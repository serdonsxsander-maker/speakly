/**
 * Speakly Cloud AI Backend Proxy Server
 * 
 * PRODUCTION & SECURITY DOCTRINE:
 * 1. Authenticated Users Only: All speech transcription calls require a valid Supabase JWT.
 *    Public guests and unauthenticated clients are denied (protects Groq/OpenAI LPU tokens).
 * 2. Zero-Retention Audio: Voice audio is held ephemerally in RAM only during transcription.
 *    No audio bytes or transcript text are ever written to server disk or database.
 * 3. Rate Limiting Active: Sliding-window rate limiting per authenticated user (45 req/min)
 *    and per IP on auth endpoints (15 req/min).
 * 4. OOM / DoS Defense: Strict 25MB payload ceiling prevents memory exhaustion.
 * 5. Free-Tier Keep-Alive Ready: Lightweight /health and / endpoints return instant 200 OK.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load environment variables from parent and local .env files if present (for local development)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const PORT = parseInt(process.env.PORT || '8787', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://lwiznvgeemrkrildyyvw.supabase.co').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BILLING_WEBHOOK_SECRET = (process.env.BILLING_WEBHOOK_SECRET || process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '').trim();
const LEMONSQUEEZY_API_KEY = (process.env.LEMONSQUEEZY_API_KEY || '').trim();
const LEMONSQUEEZY_STORE_ID = (process.env.LEMONSQUEEZY_STORE_ID || '').trim();
const LEMONSQUEEZY_VARIANT_ID = (process.env.LEMONSQUEEZY_VARIANT_ID || '').trim();
const LEMONSQUEEZY_CHECKOUT_URL = (process.env.LEMONSQUEEZY_CHECKOUT_URL || 'https://speakly.lemonsqueezy.com/buy/speakly-pro').trim();

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

const GRAMMAR_CLEANUP_PROMPT = `
You are Speakly's real-time grammar and speech cleanup engine.
1. Fix all grammatical errors, subject-verb disagreements, and incorrect verb tenses.
2. Remove speech disfluencies, filler words (um, uh, like, you know), and word repetitions (e.g. "correct. Correct" -> "correct", "I I want" -> "I want").
3. Resolve mid-sentence self-corrections (e.g. "at 2pm wait no 3:30pm" -> "at 3:30 PM").
4. Adapt words to fit the sentence structure cleanly and naturally while keeping the speaker's original meaning and language.
5. Output ONLY the final polished text ready to paste. Never answer questions, never add conversational quotes or commentary.
`;

const HALLUCINATION_PHRASES = new Set([
  'thank you.',
  'thank you for watching.',
  'thanks for watching.',
  'thank you for watching!',
  'subtitles by the amara.org community',
  'ondertitels ingediend door de amara.org gemeenschap',
  'sous-titres réalisés para la communauté d\'amara.org',
  'you',
  '.',
  '...'
]);

// ============================================================================
// Sliding-Window Rate Limiters (Prevents API abuse & token exhaustion)
// ============================================================================

// Transcribe: Per authenticated user (45 dictations / min)
const userRateLimitMap = new Map();
const USER_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_USER = 45;

// Auth endpoints: Per IP (15 attempts / min) to prevent credential stuffing
const authRateLimitMap = new Map();
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_AUTH_ATTEMPTS_PER_IP = 15;

// Periodically clean up stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of userRateLimitMap.entries()) {
    if (now - record.windowStart > USER_RATE_LIMIT_WINDOW_MS) {
      userRateLimitMap.delete(key);
    }
  }
  for (const [key, record] of authRateLimitMap.entries()) {
    if (now - record.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) {
      authRateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

function checkUserRateLimit(userId) {
  const key = `user:${userId}`;
  const now = Date.now();
  let record = userRateLimitMap.get(key);

  if (!record || (now - record.windowStart) > USER_RATE_LIMIT_WINDOW_MS) {
    record = { windowStart: now, count: 1 };
    userRateLimitMap.set(key, record);
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_USER - 1,
      resetMs: USER_RATE_LIMIT_WINDOW_MS
    };
  }

  record.count += 1;
  const resetMs = Math.max(0, USER_RATE_LIMIT_WINDOW_MS - (now - record.windowStart));

  if (record.count > MAX_REQUESTS_PER_USER) {
    return { allowed: false, remaining: 0, resetMs };
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_USER - record.count,
    resetMs
  };
}

function checkAuthIpRateLimit(ip) {
  const key = `ip:${ip}`;
  const now = Date.now();
  let record = authRateLimitMap.get(key);

  if (!record || (now - record.windowStart) > AUTH_RATE_LIMIT_WINDOW_MS) {
    record = { windowStart: now, count: 1 };
    authRateLimitMap.set(key, record);
    return { allowed: true, remaining: MAX_AUTH_ATTEMPTS_PER_IP - 1, resetMs: AUTH_RATE_LIMIT_WINDOW_MS };
  }

  record.count += 1;
  const resetMs = Math.max(0, AUTH_RATE_LIMIT_WINDOW_MS - (now - record.windowStart));

  if (record.count > MAX_AUTH_ATTEMPTS_PER_IP) {
    return { allowed: false, remaining: 0, resetMs };
  }

  return {
    allowed: true,
    remaining: MAX_AUTH_ATTEMPTS_PER_IP - record.count,
    resetMs
  };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Strictly authenticates request via Supabase Bearer JWT.
 * Speech transcription and personal data access require an authenticated Supabase user.
 * Public guests or unauthenticated clients are denied to protect Groq/OpenAI resources.
 */
async function authenticateUser(req) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Authentication required. Please sign in to your Speakly account to transcribe speech.'
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Invalid authentication token: Bearer token is empty.'
    };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user || !user.id) {
      return {
        ok: false,
        statusCode: 401,
        error: error?.message || 'Invalid or expired authentication session. Please sign in again.'
      };
    }

    return {
      ok: true,
      user,
      userId: user.id,
      email: user.email
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Authentication failed: ' + (err.message || 'Unable to verify session with Supabase.')
    };
  }
}

/**
 * Safe body buffer reader with hard memory ceiling (prevents OOM crashes)
 */
function readBodyWithLimit(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;

    req.on('data', (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        req.destroy();
        const err = new Error(`Payload too large. Exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit.`);
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

function fallbackCleanup(text) {
  if (!text) return '';
  let out = text.trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.!?…:;]$/.test(out)) out += '.';
  return out;
}

/**
 * Speech Transcription & Polish Engine
 * Uses Groq LPU (whisper-large-v3-turbo + llama-3.3-70b-versatile) as primary for ~0.3s latency,
 * with automatic fallback to OpenAI if configured.
 */
async function transcribeAndPolish({
  audioBuffer,
  mimeType = 'audio/wav',
  language = '',
  dictionary = [],
  modeId = 'smart',
  modePrompt = ''
}) {
  const hasGroq = Boolean(GROQ_API_KEY);
  const hasOpenAI = Boolean(OPENAI_API_KEY);

  if (!hasGroq && !hasOpenAI) {
    throw new Error('AI transcription service not configured on server (missing GROQ_API_KEY and OPENAI_API_KEY).');
  }

  // 1. Transcription (STT) via Groq or OpenAI
  let rawText = '';
  let activeEngine = hasGroq ? 'groq-lpu' : 'openai';

  const ext = mimeType.includes('webm') ? 'webm' : 'wav';
  const blob = new Blob([audioBuffer], { type: mimeType });

  // Attempt Groq STT first
  if (hasGroq) {
    try {
      const form = new FormData();
      form.append('file', blob, `recording.${ext}`);
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'json');
      if (language && language.trim()) form.append('language', language.trim());
      if (dictionary && dictionary.length > 0) {
        form.append('prompt', `Vocabulary: ${dictionary.slice(0, 50).join(', ')}.`);
      }

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        rawText = String(data?.text || '').trim();
        activeEngine = 'groq-lpu';
      } else {
        const errText = await groqRes.text().catch(() => '');
        console.warn(`Groq STT failed (HTTP ${groqRes.status}): ${errText}`);
      }
    } catch (groqErr) {
      console.warn('Groq STT network error:', groqErr.message);
    }
  }

  // Fallback to OpenAI STT if Groq failed or not configured
  if (!rawText && hasOpenAI) {
    try {
      const form = new FormData();
      form.append('file', blob, `recording.${ext}`);
      form.append('model', 'whisper-1');
      form.append('response_format', 'json');
      if (language && language.trim()) form.append('language', language.trim());
      if (dictionary && dictionary.length > 0) {
        form.append('prompt', `Vocabulary: ${dictionary.slice(0, 50).join(', ')}.`);
      }

      const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form
      });

      if (openaiRes.ok) {
        const data = await openaiRes.json();
        rawText = String(data?.text || '').trim();
        activeEngine = 'openai-whisper';
      } else {
        const errText = await openaiRes.text().catch(() => '');
        console.warn(`OpenAI STT failed (HTTP ${openaiRes.status}): ${errText}`);
      }
    } catch (openaiErr) {
      console.warn('OpenAI STT network error:', openaiErr.message);
    }
  }

  if (!rawText) {
    // If text is genuinely empty or hallucinated
    return { rawText: '', finalText: '', engine: activeEngine };
  }

  if (HALLUCINATION_PHRASES.has(rawText.toLowerCase())) {
    return { rawText: '', finalText: '', engine: activeEngine };
  }

  // If raw mode requested, skip LLM cleanup
  if (modeId === 'raw') {
    return {
      rawText,
      finalText: fallbackCleanup(rawText),
      engine: activeEngine
    };
  }

  // 2. Grammar & Polish via LLM
  const activeSystemPrompt = (modePrompt && modePrompt.trim()) ? modePrompt.trim() : GRAMMAR_CLEANUP_PROMPT;
  const vocabHint = dictionary.length > 0 ? `\nEnsure terms are spelled accurately: ${dictionary.join(', ')}.` : '';

  // Candidate LLM models: Groq Llama 3.3 70B & 3.1 8B, or OpenAI GPT-4o-mini
  const llmCandidates = [];
  if (hasGroq) {
    llmCandidates.push({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile'
    });
    llmCandidates.push({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: GROQ_API_KEY,
      model: 'llama-3.1-8b-instant'
    });
  }
  if (hasOpenAI) {
    llmCandidates.push({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4o-mini'
    });
  }

  for (const candidate of llmCandidates) {
    try {
      const llmRes = await fetch(`${candidate.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: candidate.model,
          temperature: 0.1,
          max_tokens: 1500,
          messages: [
            { role: 'system', content: activeSystemPrompt + vocabHint },
            { role: 'user', content: `<raw_dictation>\n${rawText}\n</raw_dictation>` }
          ]
        })
      });

      if (llmRes.ok) {
        const llmData = await llmRes.json();
        let polished = String(llmData?.choices?.[0]?.message?.content || '').trim();
        polished = polished.replace(/^<raw_dictation>|<\/raw_dictation>$/gi, '').trim();
        if (polished) {
          return {
            rawText,
            finalText: polished,
            engine: `${activeEngine}+${candidate.model}`
          };
        }
      }
    } catch (err) {
      console.warn(`LLM model ${candidate.model} failed, trying next:`, err.message);
    }
  }

  // Graceful fallback to raw text cleanup if LLM polish times out or fails
  return {
    rawText,
    finalText: fallbackCleanup(rawText),
    engine: activeEngine
  };
}

// ============================================================================
// HTTP Server Router & Middleware
// ============================================================================

const server = http.createServer(async (req, res) => {
  const ip = getClientIp(req);

  // Security & Hardening Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-speakly-client, x-speakly-client-auth, x-speakly-language');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Malformed URL' }));
    return;
  }

  // --------------------------------------------------------------------------
  // Health Check & Render Keep-Alive Ping Endpoints (/ and /health)
  // Publicly accessible for 5-minute health check pings so Render doesn't sleep
  // --------------------------------------------------------------------------
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'speakly-backend',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      engines: {
        groqLpu: Boolean(GROQ_API_KEY),
        openaiFallback: Boolean(OPENAI_API_KEY)
      },
      supabaseConnected: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
      security: {
        authRequired: true,
        authProvider: 'Supabase JWT Bearer',
        guestAccess: false,
        userRateLimitPerMinute: MAX_REQUESTS_PER_USER
      },
      privacyModel: 'Zero-Retention Ephemeral RAM Processing'
    }));
    return;
  }

  // --------------------------------------------------------------------------
  // Supabase Auth: Sign Up
  // Protected with IP rate limiting
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/signup' && req.method === 'POST') {
    const ipCheck = checkAuthIpRateLimit(ip);
    if (!ipCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Too many signup attempts. Please try again later.' }));
      return;
    }

    try {
      const bodyBuffer = await readBodyWithLimit(req, 1024 * 1024); // 1MB limit
      const { email, password, preferences } = JSON.parse(bodyBuffer.toString('utf8'));
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { speakly_prefs: preferences || {} } }
      });
      if (error) throw error;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: data.user,
        session: data.session,
        preferences: data.user?.user_metadata?.speakly_prefs || {}
      }));
    } catch (err) {
      const status = err.statusCode || 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // Supabase Auth: Sign In
  // Protected with IP rate limiting
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/signin' && req.method === 'POST') {
    const ipCheck = checkAuthIpRateLimit(ip);
    if (!ipCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Too many signin attempts. Please try again in a few minutes.' }));
      return;
    }

    try {
      const bodyBuffer = await readBodyWithLimit(req, 1024 * 1024);
      const { email, password } = JSON.parse(bodyBuffer.toString('utf8'));
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: data.user,
        session: data.session,
        preferences: data.user?.user_metadata?.speakly_prefs || {}
      }));
    } catch (err) {
      const status = err.statusCode || 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // Supabase User Preferences Sync (Save & Load per User)
  // Requires valid user access token
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/v1/user/preferences' && req.method === 'POST') {
    try {
      const bodyBuffer = await readBodyWithLimit(req, 1024 * 1024);
      const { accessToken, refreshToken, preferences } = JSON.parse(bodyBuffer.toString('utf8'));
      if (!accessToken) throw new Error('Not authenticated');

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (refreshToken) {
        await userClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
      const { data, error } = await userClient.auth.updateUser({
        data: { speakly_prefs: preferences || {} }
      });
      if (error) throw error;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        preferences: data.user?.user_metadata?.speakly_prefs || preferences
      }));
    } catch (err) {
      const status = err.statusCode || 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // Billing & Subscription Webhook (Lemon Squeezy / Polar / Stripe)
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/v1/billing/webhook' && req.method === 'POST') {
    try {
      const rawBody = await readBodyWithLimit(req, 1024 * 1024); // 1MB limit
      const signature = req.headers['x-signature'] || req.headers['webhook-signature'] || '';

      // Verify HMAC signature if secret configured
      if (BILLING_WEBHOOK_SECRET) {
        const hmac = crypto.createHmac('sha256', BILLING_WEBHOOK_SECRET);
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
        const signatureBuf = Buffer.from(String(signature), 'utf8');
        if (digest.length !== signatureBuf.length || !crypto.timingSafeEqual(digest, signatureBuf)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid webhook signature' }));
          return;
        }
      }

      const event = JSON.parse(rawBody.toString('utf8'));
      const eventName = event.meta?.event_name || event.type || event.event || '';
      const userEmail = (
        event.data?.attributes?.user_email ||
        event.data?.object?.customer_email ||
        event.customer_email ||
        ''
      ).toLowerCase().trim();

      const customUserId = event.meta?.custom_data?.user_id || event.data?.attributes?.custom_data?.user_id || null;

      console.log(`[Billing Webhook] Received event: ${eventName} for ${userEmail || customUserId || 'unknown'}`);

      // Handle Subscription Lifecycle
      if (supabaseAdmin && (userEmail || customUserId)) {
        const isPro = /subscription_created|subscription_resumed|order_created|invoice\.payment_succeeded/i.test(eventName);
        const isCancelled = /subscription_cancelled|subscription_expired|customer\.subscription\.deleted/i.test(eventName);

        let targetUserId = customUserId;

        // If no custom user ID, find user by email in Supabase
        if (!targetUserId && userEmail) {
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const matchedUser = usersData?.users?.find(u => (u.email || '').toLowerCase() === userEmail);
          if (matchedUser) {
            targetUserId = matchedUser.id;
          }
        }

        if (targetUserId) {
          const subscriptionPayload = {
            plan: isCancelled ? 'free' : (isPro ? 'pro' : 'free'),
            status: isCancelled ? 'cancelled' : (isPro ? 'active' : 'inactive'),
            provider: 'merchant_of_record',
            updatedAt: new Date().toISOString()
          };

          await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            user_metadata: { speakly_subscription: subscriptionPayload }
          });
          console.log(`[Billing Webhook] Updated user ${targetUserId} subscription to ${subscriptionPayload.plan} (${subscriptionPayload.status})`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, event: eventName }));
    } catch (err) {
      console.error('[Billing Webhook Error]:', err.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: false, error: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // Audio Transcribe & Grammar Polish
  // STRICT REQUIREMENT: Authenticated Supabase User ONLY.
  // Guests cannot consume server Groq/OpenAI tokens.
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/v1/transcribe' && req.method === 'POST') {
    // 1. Authenticate user via Supabase Bearer JWT
    const authResult = await authenticateUser(req);
    if (!authResult.ok) {
      res.writeHead(authResult.statusCode || 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: authResult.error
      }));
      return;
    }

    // 2. Enforce Sliding-Window Rate Limiting per Supabase User (45 dictations / min)
    const rateCheck = checkUserRateLimit(authResult.userId);
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS_PER_USER));
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateCheck.resetMs / 1000)));

    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(rateCheck.resetMs / 1000)));
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Rate limit exceeded (maximum ${MAX_REQUESTS_PER_USER} dictations per minute). Please wait a moment before dictating again.`,
        retryAfterSeconds: Math.ceil(rateCheck.resetMs / 1000)
      }));
      return;
    }

    // 3. Read Body with 25MB Hard Cap (OOM Prevention)
    try {
      const bodyBuffer = await readBodyWithLimit(req, 25 * 1024 * 1024);
      const contentType = req.headers['content-type'] || 'audio/wav';

      let audioBuffer;
      let mimeType = 'audio/wav';
      let language = '';
      let dictionary = [];
      let modeId = 'smart';
      let modePrompt = '';

      if (contentType.includes('application/json')) {
        const parsed = JSON.parse(bodyBuffer.toString('utf8'));
        audioBuffer = Buffer.from(parsed.audioBase64 || '', 'base64');
        mimeType = parsed.mimeType || 'audio/wav';
        language = parsed.language || '';
        dictionary = Array.isArray(parsed.dictionary) ? parsed.dictionary : [];
        modeId = parsed.modeId || 'smart';
        modePrompt = parsed.modePrompt || '';
      } else {
        audioBuffer = bodyBuffer;
        mimeType = contentType;
        language = req.headers['x-speakly-language'] || '';
      }

      if (!audioBuffer || audioBuffer.length < 100) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'No audio data provided' }));
        return;
      }

      // 4. In-Memory Transcribe & Polish (Zero Audio Persistence Guarantee)
      const result = await transcribeAndPolish({
        audioBuffer,
        mimeType,
        language,
        dictionary,
        modeId,
        modePrompt
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      const status = err.statusCode || 500;
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message || 'Processing failed' }));
      }
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n🔒 Speakly Cloud AI Backend running on port ${PORT}`);
  console.log(`   Environment:   ${NODE_ENV}`);
  console.log(`   Auth Policy:   STRICT - Supabase Authenticated Users Only (No Guest AI Access)`);
  console.log(`   Rate Limiter:  Active (${MAX_REQUESTS_PER_USER} req/min per user)`);
  console.log(`   Engines:       Groq LPU: ${GROQ_API_KEY ? 'Ready ✓' : 'Disabled'} | OpenAI: ${OPENAI_API_KEY ? 'Ready ✓' : 'Disabled'}`);
  console.log(`   Health Ping:   Ready on / and /health for Render 5-min keep-alive\n`);
});

// Graceful shutdown handling for Render deployments & container restarts
function handleShutdown(signal) {
  console.log(`Received ${signal}, closing HTTP server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
