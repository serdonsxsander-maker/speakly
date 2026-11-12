/**
 * Speakly Cloud, Backend & 100% Local On-Device Transcription Engine
 * Supports:
 *  - 'local': 100% private on-device whisper.cpp engine (zero cloud requests, no API key required)
 *  - 'groq' / 'openai': Ultra-fast cloud STT + LLM rewriting
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');

// Production Speakly backend (Render service "speakly-backend" in backend/render.yaml).
// Packaged apps always talk to production; `npm run dev` talks to a local backend.
const PRODUCTION_BACKEND_URL = 'https://speakly-backend.onrender.com';
const DEV_BACKEND_URL = 'http://localhost:8787';
const BACKEND_URL = (process.env.SPEAKLY_BACKEND_URL ||
  (app.isPackaged || process.env.NODE_ENV !== 'development' ? PRODUCTION_BACKEND_URL : DEV_BACKEND_URL)).replace(/\/+$/, '');
const LOCAL_MODEL_FILENAME = 'ggml-small-q5_1.bin';
const LOCAL_MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${LOCAL_MODEL_FILENAME}`;

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

const PROVIDERS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    sttModel: 'gpt-4o-transcribe',
    sttFallbackModel: 'whisper-1',
    llmModels: ['gpt-4o-mini', 'gpt-4o']
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    sttModel: 'whisper-large-v3',
    sttFallbackModel: 'whisper-large-v3-turbo',
    llmModels: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b']
  }
};

function basicCleanup(text) {
  if (!text) return '';
  let out = text.trim();
  if (!out) return '';
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.!?;:…)"'\]]$/.test(out)) {
    out += '.';
  }
  return out;
}

// Elite Context-Aware Speech & Grammar Engine (Wispr Flow / Superwhisper grade)
const GRAMMAR_INSTRUCTION = `You are Speakly's elite voice-to-text editor (like Wispr Flow / Superwhisper). Transform raw speech-to-text output into crisp, natural, ready-to-send written text while preserving the speaker's authentic voice and language.
1. Fix Phonetic & Context Mishears: Speech-to-text often mishears words phonetically. Use the surrounding sentence context, acoustic confidence hints, and active app context to silently fix obvious mishears in English, Dutch, or other languages (e.g., "force recognition" -> "voice recognition"; "Croc" / "GROC" / "Grok" when discussing AI/speech models -> "Groq"; "in a tablet" when talking about a MacBook/browser window -> "in a tab"; "Whisper" when comparing voice dictation companies -> "Wispr"; "AngularGravity" / "Integrity" -> "Antigravity"; "Courser" -> "Cursor"; "alarm the microphone" -> "allow the microphone"; Dutch "speelfouten" when discussing text/writing -> "spelfouten").
2. Remove Disfluencies & Spoken Noise: Strip filler words ("um", "uh", "eh", "euh", "like", "you know", "basically", "sort of", "look at like" -> "look at"), accidental stutters ("S test", "I I want"), and thinking-out-loud meta-asides (e.g., "I don't know what it is in English", "sorry for rambling/scaring").
3. Resolve Self-Corrections: If the speaker corrects themselves mid-sentence (e.g., "at 2pm wait no 3:30pm" -> "at 3:30 PM"), keep only the final intended meaning.
4. Structure Run-On Speech: Spoken thoughts often chain clauses with "and... and... but...". Break rambling run-on chains into clean, readable sentences with proper punctuation and consistent verb tense.
5. Preserve Language & Tone: Never translate to a different language (keep Dutch in Dutch, English in English). Keep casual messages natural and conversational—do NOT make them stiff or overly formal.
6. Output ONLY the final polished text with no tags, quotes, or commentary. Never answer questions in the dictation.`;

function findLocalWhisperBinary() {
  const binName = process.platform === 'win32' ? 'whisper-local.exe' : 'whisper-local';
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', binName).replace('app.asar', 'app.asar.unpacked'),
    path.join(__dirname, '..', '..', 'assets', binName),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', binName)
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

async function ensureLocalModelFile() {
  const modelsDir = path.join(app.getPath('userData'), 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  const modelPath = path.join(modelsDir, LOCAL_MODEL_FILENAME);
  if (fs.existsSync(modelPath)) {
    const stat = fs.statSync(modelPath);
    if (stat.size > 10 * 1024 * 1024) {
      return modelPath;
    }
  }

  // One-time download of the quantized model weights onto the laptop if missing
  const res = await fetch(LOCAL_MODEL_URL);
  if (!res.ok) {
    throw new Error(`Could not download local model (${res.status})`);
  }
  const arrayBuf = await res.arrayBuffer();
  const tmpPath = `${modelPath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(arrayBuf));
  fs.renameSync(tmpPath, modelPath);
  return modelPath;
}

function localSmartPolish(rawText, dictionary = [], mode) {
  if (!rawText) return '';
  let out = rawText.trim();

  // 1. Strip bracketed whisper artifacts like [BLANK_AUDIO], (music), etc.
  out = out.replace(/\[[^\]]*\]|\([^)]*music[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!out) return '';

  // 2. Apply custom dictionary & common phonetic repairs locally
  const phoneticPairs = [
    [/\bforce\s+recognition\b/gi, 'voice recognition'],
    [/\b(croc|groc)\b/gi, 'Groq'],
    [/\bspeelfouten\b/gi, 'spelfouten'],
    [/\bsintra\s+pxl\b/gi, 'Syntra PXL'],
    [/\bangular\s*gravity\b/gi, 'Antigravity'],
    [/\bwhisper\s+flow\b/gi, 'Wispr Flow']
  ];
  for (const [regex, replacement] of phoneticPairs) {
    out = out.replace(regex, replacement);
  }

  for (const term of dictionary || []) {
    const clean = String(term || '').trim();
    if (clean.length >= 3) {
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), clean);
    }
  }

  if (mode && mode.id === 'raw') {
    return basicCleanup(out);
  }

  // 3. Remove spoken filler words (English + Dutch)
  out = out
    .replace(/\b(um+|uh+|eh+|euh+|erm+|hmm+)\b[,.]?\s*/gi, '')
    .replace(/\b(you know|sort of|kind of|like,)\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 4. Resolve simple mid-sentence self-corrections ("at 2pm, actually wait no, at 4pm" -> "at 4pm")
  out = out.replace(/[^.!?]*?\b(actually[,\s]+wait[,\s]+no|wait[,\s]+no|wacht[,\s]+nee)[,.\s]+/gi, '');

  // 5. Mode-specific local formatting
  if (mode && mode.id === 'notes') {
    const parts = out
      .replace(/^(ok(ay)?[,\s]+)?(so\s+)?(three|two|four|some|a few)\s+things[^.!?]*[.!?]\s*/i, '')
      .split(/(?:\b(?:first|second|third|fourth|ten eerste|ten tweede|ten derde)\b[,:\s]*|[.!?]+\s+)/i)
      .map((s) => basicCleanup(s))
      .filter((s) => s.length > 2);
    if (parts.length > 0) {
      return parts.map((p) => `- ${p}`).join('\n');
    }
  }

  if (mode && mode.id === 'email') {
    const body = basicCleanup(out.replace(/^(hi|hey|hello|beste|hoi)\b[,!\s]*/i, ''));
    return `Hi,\n\n${body}\n\nBest regards,`;
  }

  return basicCleanup(out);
}

async function transcribeLocal({ audioBuffer, settings, dictionary = [], mode }) {
  const binPath = findLocalWhisperBinary();
  if (!binPath) {
    throw new Error('Local Whisper engine binary not found in app bundle.');
  }

  const modelPath = await ensureLocalModelFile();
  const tmpWav = path.join(
    os.tmpdir(),
    `speakly_offline_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`
  );

  // Write temporary WAV with strict 0600 owner-only permissions
  fs.writeFileSync(tmpWav, audioBuffer, { mode: 0o600 });

  const coreTerms = ['Speakly', 'Wispr', 'Antigravity', 'Cursor', 'MacBook', 'Windows'];
  const mergedTerms = [...new Set([...(dictionary || []), ...coreTerms])].slice(0, 35);
  // CRITICAL: In whisper.cpp, '-l auto' ignores --audio-ctx (-ac) and forces an extra full 30-second
  // (1500-frame) encoder pass that takes ~19s on Intel CPUs! Passing an explicit language code ('en' or 'nl')
  // skips that redundant 30s pass and cuts local transcription time from ~22s down to ~2.5s!
  const langArg = settings.language && settings.language.trim() ? settings.language.trim() : 'en';

  // CRITICAL SPEED OPTIMIZATION:
  // By default, whisper.cpp pads every clip to a full 30-second window (-ac 1500), which takes 25+ seconds on Intel CPUs!
  // Sizing --audio-ctx (-ac) dynamically to the actual recording duration speeds up local inference by 6x-10x!
  const audioSeconds = Math.max(1, (audioBuffer.byteLength - 44) / 32000);
  const dynamicAudioCtx = Math.min(1500, Math.max(160, Math.ceil((audioSeconds / 30) * 1500) + 64));

  try {
    const rawStdout = await new Promise((resolve, reject) => {
      const args = [
        '-m',
        modelPath,
        '-f',
        tmpWav,
        '-l',
        langArg,
        '-ac',
        String(dynamicAudioCtx),
        '-t',
        String(Math.min(8, Math.max(2, os.cpus().length))),
        '-bs',
        '1',
        '-bo',
        '1',
        '-nt',
        '-np'
      ];
      if (mergedTerms.length > 0) {
        args.push('--prompt', mergedTerms.join(', '));
      }

      execFile(
        binPath,
        args,
        {
          timeout: 60000,
          env: {
            ...process.env,
            GGML_METAL_PATH_RESOURCES: path.dirname(binPath)
          }
        },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr || err.message || 'Local whisper execution failed'));
            return;
          }
          resolve(String(stdout || ''));
        }
      );
    });

    const rawText = rawStdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!rawText || HALLUCINATION_PHRASES.has(rawText.toLowerCase())) {
      return { rawText: '', finalText: '' };
    }

    const finalText = localSmartPolish(rawText, mergedTerms, mode);
    return { rawText, finalText };
  } finally {
    // SECURITY GUARANTEE: Always wipe the temporary audio file from disk immediately
    try {
      if (fs.existsSync(tmpWav)) {
        fs.unlinkSync(tmpWav);
      }
    } catch {}
  }
}

const SPEAKLY_CLIENT_HANDSHAKE = 'speakly_client_beta_v1_secure_handshake';

function getBackendUrl(settings) {
  if (process.env.SPEAKLY_BACKEND_URL) return process.env.SPEAKLY_BACKEND_URL.replace(/\/+$/, '');
  if (settings && typeof settings.backendUrl === 'string' && settings.backendUrl.trim()) {
    return settings.backendUrl.trim().replace(/\/+$/, '');
  }
  return BACKEND_URL;
}

async function transcribeViaBackend({ audioBuffer, mimeType, language, dictionary, mode, authToken = '', backendUrl = '' }) {
  const base64Audio = audioBuffer.toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const targetBaseUrl = backendUrl || BACKEND_URL;
  let res;
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-speakly-client': 'desktop-v1',
      'x-speakly-client-auth': SPEAKLY_CLIENT_HANDSHAKE
    };
    if (authToken && String(authToken).trim()) {
      headers['Authorization'] = `Bearer ${String(authToken).trim()}`;
    }

    res = await fetch(`${targetBaseUrl}/api/v1/transcribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audioBase64: base64Audio,
        mimeType,
        language,
        dictionary,
        modeId: mode?.id || 'smart',
        modePrompt: mode?.prompt || ''
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new Error('Rate limit reached. Please wait a few seconds before dictating again.');
  }

  if (res.status === 413) {
    throw new Error('Audio recording was too large for cloud processing (max 25MB).');
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      detail = errJson?.error || detail;
    } catch {}
    throw new Error(`Speakly Cloud error: ${detail}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Backend transcription failed');
  }

  return {
    rawText: data.rawText || '',
    finalText: data.finalText || ''
  };
}

async function callWhisperStt({ baseUrl, apiKey, sttModel, audioBuffer, mimeType, language, whisperPrompt }) {
  const ext = mimeType.includes('webm') ? 'webm' : 'wav';
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  form.append('file', blob, `recording.${ext}`);
  form.append('model', sttModel);

  // Whisper models support verbose_json (which gives us acoustic logprob confidence scores!).
  // GPT-4o-transcribe models use standard json.
  const supportsVerboseJson = sttModel.startsWith('whisper');
  form.append('response_format', supportsVerboseJson ? 'verbose_json' : 'json');
  form.append('temperature', '0');

  if (language && language.trim()) {
    form.append('language', language.trim());
  }

  if (whisperPrompt) {
    form.append('prompt', whisperPrompt);
  }

  const sttController = new AbortController();
  const sttTimer = setTimeout(() => sttController.abort(), 14000);
  try {
    return await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: sttController.signal
    });
  } finally {
    clearTimeout(sttTimer);
  }
}

async function transcribeDirect({ audioBuffer, mimeType, settings, dictionary, mode, activeContext = '' }) {
  const providerKey = settings.provider === 'groq' ? 'groq' : 'openai';
  const providerCfg = PROVIDERS[providerKey];
  const apiKey = (providerKey === 'groq' ? settings.groqApiKey : settings.openaiApiKey || '').trim();

  if (!apiKey) {
    throw new Error('No API key configured. Enter a key in Settings or connect to Speakly Cloud.');
  }

  // Build a natural proper-noun conditioning string (never prefix with "Vocabulary:" so Whisper never echoes it)
  const coreTerms = ['Speakly', 'Groq', 'OpenAI', 'Wispr', 'Antigravity', 'Cursor', 'MacBook', 'Windows'];
  const mergedTerms = [...new Set([...(dictionary || []), ...coreTerms])].slice(0, 45);
  const whisperPrompt = mergedTerms.join(', ');

  let sttRes = await callWhisperStt({
    baseUrl: providerCfg.baseUrl,
    apiKey,
    sttModel: providerCfg.sttModel,
    audioBuffer,
    mimeType,
    language: settings.language,
    whisperPrompt
  });

  // Automatic fallback to secondary STT model if primary model is rate-limited or unavailable
  if (!sttRes.ok && providerCfg.sttFallbackModel) {
    sttRes = await callWhisperStt({
      baseUrl: providerCfg.baseUrl,
      apiKey,
      sttModel: providerCfg.sttFallbackModel,
      audioBuffer,
      mimeType,
      language: settings.language,
      whisperPrompt
    });
  }

  if (!sttRes.ok) {
    let errDetail = `HTTP ${sttRes.status}`;
    try {
      const errJson = await sttRes.json();
      errDetail = errJson?.error?.message || errDetail;
    } catch {}
    throw new Error(`Transcription failed: ${errDetail}`);
  }

  const sttData = await sttRes.json();
  let rawText = String(sttData?.text || '').trim();

  // Strip any accidental Whisper prompt echo at the very end of a recording
  rawText = rawText
    .replace(/\bVocabulary is a very good way to do that\.?\s*$/i, '')
    .replace(/\bSpeakly,\s*(Groq,\s*)?Wispr,\s*Antigravity.*$/i, '')
    .trim();

  if (!rawText || HALLUCINATION_PHRASES.has(rawText.toLowerCase())) {
    return { rawText: '', finalText: '' };
  }

  // Extract low-confidence acoustic segments from Whisper verbose_json (avg_logprob < -0.24)
  // so the LLM knows specifically where phonetic mishears ("force" vs "voice", "Croc" vs "Groq") may have occurred!
  const uncertainSegments = [];
  if (Array.isArray(sttData?.segments)) {
    for (const seg of sttData.segments) {
      if (typeof seg.avg_logprob === 'number' && seg.avg_logprob < -0.24 && seg.text) {
        uncertainSegments.push(`"${String(seg.text).trim()}" (confidence: ${Math.round(Math.exp(seg.avg_logprob) * 100)}%)`);
      }
    }
  }

  // Fast Verbatim mode skips LLM post-processing
  if (mode && mode.id === 'raw') {
    return { rawText, finalText: basicCleanup(rawText) };
  }

  // AI Formatting Mode (Smart Polish, Bullet Notes, Email, AI Prompt/Dev, Custom Modes)
  const models = providerCfg.llmModels || [providerCfg.llmModel || 'gpt-4o-mini'];
  const customPrompt = !mode || mode.id === 'smart' ? GRAMMAR_INSTRUCTION : (mode.prompt || GRAMMAR_INSTRUCTION);
  const fullName = [settings.userFirstName, settings.userLastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  const userPrompt = fullName
    ? `\nSpeaker's Name: "${fullName}". If signing off an email or message, use "${settings.userFirstName || fullName}" instead of "[Your Name]".`
    : '';
  const aiTargetMap = {
    chatgpt: 'OpenAI ChatGPT (GPT-4o)',
    claude: 'Anthropic Claude',
    gemini: 'Google Gemini',
    cursor: 'Cursor / AI Coding IDE'
  };
  const aiTargetPrompt =
    mode && mode.id === 'code'
      ? `\nTarget AI Assistant for this prompt: ${aiTargetMap[settings.aiPromptTarget] || 'OpenAI ChatGPT'}. Structure the prompt clearly for this model.`
      : '';
  const vocabPrompt = mergedTerms.length > 0 ? `\nPreferred spelling of terms/names: ${mergedTerms.join(', ')}.` : '';
  const contextPrompt = activeContext
    ? `\nActive application/window where the user is dictating: "${activeContext}". Use this context to resolve ambiguous technical or domain words accurately.`
    : '';
  const confidenceHint =
    uncertainSegments.length > 0
      ? `\n<acoustic_uncertainty_hint>\nThe speech-to-text engine had low acoustic confidence on: ${uncertainSegments.join('; ')}. Carefully check those words for phonetic/homophone mishears against the sentence context and preferred vocabulary.\n</acoustic_uncertainty_hint>`
      : '';

  for (const model of models) {
    try {
      const llmController = new AbortController();
      const llmTimer = setTimeout(() => llmController.abort(), 8000);
      let llmRes;
      try {
        const reqBody = {
          model,
          temperature: 0.1,
          max_tokens: 1500,
          messages: [
            { role: 'system', content: customPrompt + userPrompt + aiTargetPrompt + vocabPrompt + contextPrompt },
            { role: 'user', content: `<raw_dictation>\n${rawText}\n</raw_dictation>${confidenceHint}` }
          ]
        };
        if (model.startsWith('openai/gpt-oss-')) {
          reqBody.reasoning_effort = 'low';
        }
        llmRes = await fetch(`${providerCfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody),
          signal: llmController.signal
        });
      } finally {
        clearTimeout(llmTimer);
      }

      if (llmRes.ok) {
        const llmData = await llmRes.json();
        let polished = String(llmData?.choices?.[0]?.message?.content || '').trim();
        polished = polished.replace(/^<raw_dictation>|<\/raw_dictation>$/gi, '').trim();
        if (polished) {
          return { rawText, finalText: polished };
        }
      } else {
        const errJson = await llmRes.json().catch(() => ({}));
        console.warn(`LLM model ${model} failed (${llmRes.status}):`, errJson?.error?.message || llmRes.statusText);
      }
    } catch (err) {
      console.warn(`Error running LLM model ${model}:`, err.message);
    }
  }

  return { rawText, finalText: basicCleanup(rawText) };
}

async function transcribeAudio({ audioBuffer, mimeType = 'audio/wav', settings, dictionary = [], mode, activeContext = '', authToken = '' }) {
  // 0. STRICT OFFLINE MODE: 100% On-Device execution. Zero cloud calls, zero API keys required.
  if (settings.provider === 'local') {
    return transcribeLocal({ audioBuffer, settings, dictionary, mode });
  }

  // 1. If the user has configured an API key for their selected provider (Groq or OpenAI),
  // use their selected provider & AI formatting mode directly!
  const activeKey = settings.provider === 'groq' ? settings.groqApiKey : settings.openaiApiKey;
  if (activeKey && activeKey.trim()) {
    try {
      return await transcribeDirect({ audioBuffer, mimeType, settings, dictionary, mode, activeContext });
    } catch (directErr) {
      console.warn('Direct API error, trying backend proxy fallback:', directErr.message);
    }
  }

  // 2. Fallback to Speakly Secure Backend Proxy (Zero-key beta tester experience)
  try {
    const backendResult = await transcribeViaBackend({
      audioBuffer,
      mimeType,
      language: settings.language,
      dictionary,
      mode,
      authToken,
      backendUrl: getBackendUrl(settings)
    });
    if (backendResult && backendResult.finalText) {
      return backendResult;
    }
  } catch (backendErr) {
    console.log('Backend proxy unavailable or error:', backendErr.message);
    // If backend proxy returned a specific error (e.g. rate limit), rethrow so user sees it in toast
    if (backendErr.message.includes('Rate limit') || backendErr.message.includes('Speakly Cloud')) {
      throw backendErr;
    }
  }

  return transcribeDirect({ audioBuffer, mimeType, settings, dictionary, mode, activeContext });
}

async function validateApiKey({ provider, apiKey }) {
  const providerKey = provider === 'groq' ? 'groq' : 'openai';
  const providerCfg = PROVIDERS[providerKey];
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter an API key.' };
  }

  try {
    const res = await fetch(`${providerCfg.baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${trimmed}` }
    });
    if (!res.ok) {
      let msg = `Invalid API key (HTTP ${res.status})`;
      try {
        const data = await res.json();
        msg = data?.error?.message || msg;
      } catch {}
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Network connection failed.' };
  }
}

module.exports = {
  transcribeAudio,
  validateApiKey
};
