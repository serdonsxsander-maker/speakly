const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_MODES = [
  {
    id: 'smart',
    name: 'Smart Polish',
    badge: 'Smart',
    description: 'Removes filler words ("um", "uh"), fixes phonetic mishears & self-corrections, and structures clean sentences in your natural voice.',
    builtIn: true,
    prompt:
      'You are Speakly\'s elite voice-to-text editor (like Wispr Flow / Superwhisper). Transform raw speech-to-text output into crisp, natural, ready-to-send written text while preserving the speaker\'s authentic voice and language.\n' +
      '1. Fix Phonetic & Context Mishears: Use sentence context and active app context to silently fix obvious speech-to-text mishears (e.g., "in a tablet" when discussing a browser/MacBook window -> "in a tab"; "Whisper" when discussing voice dictation tools -> "Wispr"; "AngularGravity" / "Integrity" -> "Antigravity"; "Courser" -> "Cursor"; "alarm the microphone" -> "allow the microphone").\n' +
      '2. Strip Disfluencies & Spoken Noise: Remove filler words ("um", "uh", "like", "you know", "basically", "sort of", "look at like" -> "look at"), stutters ("S test"), and thinking-out-loud meta-asides (e.g., "I don\'t know what it\'s called in English", "sorry for rambling").\n' +
      '3. Resolve Self-Corrections: If the speaker changes their mind mid-sentence (e.g., "at 3 wait no 4pm" -> "at 4 PM"), output only the final intended meaning.\n' +
      '4. Structure Run-On Speech: Break rambling spoken chains ("and... and... but...") into clean, natural sentences with proper punctuation and consistent verb tense.\n' +
      '5. Preserve Language & Tone: Never translate to another language. Keep casual messages natural and conversational—do NOT make them stiff or robotic. Output ONLY the final polished text with no tags, quotes, or commentary.'
  },
  {
    id: 'raw',
    name: 'Fast Verbatim',
    badge: 'Raw',
    description: 'Fastest speed and zero LLM cost. Transcribes exactly what you say with basic capitalization and punctuation.',
    builtIn: true,
    prompt: ''
  },
  {
    id: 'email',
    name: 'Professional Email',
    badge: 'Email',
    description: 'Turns casual spoken thoughts into a polite, well-structured email ready to send.',
    builtIn: true,
    prompt:
      'Transform this spoken dictation into a clear, polite, well-structured email in the same language as the speaker. Keep it concise and professional, use short paragraphs, and include an appropriate greeting and sign-off only if it reads like a full message. Output ONLY the email body with no subject line prefix or commentary.'
  },
  {
    id: 'notes',
    name: 'Actionable Notes',
    badge: 'Notes',
    description: 'Organizes rambling brain-dumps into crisp bullet points and action items.',
    builtIn: true,
    prompt:
      'Convert this spoken dictation into clean, scannable bullet points using "-" bullets in the exact same language as the speaker (English, Dutch, etc.). Extract all key facts, specifications, dimensions, decisions, and clear action items into logical bullet points. Omit conversational filler or intros. Output ONLY the final bulleted notes with no intro, outro, or quotes.'
  },
  {
    id: 'code',
    name: 'AI Prompt / Dev',
    badge: 'Dev',
    description: 'Optimized for dictating prompts into Cursor, Claude, ChatGPT, or technical Slack channels.',
    builtIn: true,
    prompt:
      'Clean up this technical dictation for a developer or AI coding assistant prompt. Remove speech disfluencies, preserve all technical terms, variable names, CLI commands, and file names accurately (using inline backticks where appropriate), and structure multi-part instructions clearly. Output ONLY the final text.'
  }
];

function readLegacyEnvKey(varName = 'OPENAI_API_KEY') {
  try {
    const candidates = [
      path.resolve(process.cwd(), '..', '.env'),
      path.resolve(__dirname, '..', '..', '..', '.env')
    ];
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        const raw = fs.readFileSync(envPath, 'utf8');
        const regex = new RegExp(`^\\s*${varName}\\s*=\\s*([^\\r\\n#]+)`, 'm');
        const match = raw.match(regex);
        if (match && match[1]) {
          const cleaned = match[1].trim().replace(/^['"]|['"]$/g, '');
          if (cleaned && !cleaned.includes('your-key-here')) {
            return cleaned;
          }
        }
      }
    }
  } catch {
    // Ignore errors reading optional legacy .env
  }
  return '';
}

function getDefaultState() {
  const isMac = process.platform === 'darwin';
  const importedOpenAiKey = readLegacyEnvKey('OPENAI_API_KEY');
  const importedGroqKey = readLegacyEnvKey('GROQ_API_KEY');

  return {
    settings: {
      onboardingComplete: true,
      provider: 'groq', // default to ultra-fast Groq LPU
      openaiApiKey: importedOpenAiKey || '',
      groqApiKey: importedGroqKey || '',
      triggerMode: 'hold', // 'hold' (Push-to-Talk) | 'toggle' (Press to Start/Stop)
      holdKey: isMac ? 'right_alt' : 'right_ctrl', // Right Option (⌥) is more ergonomic and doesn't conflict with OS cmd keys
      toggleAccelerator: 'CommandOrControl+Shift+Space',
      activeModeId: 'smart',
      aiPromptTarget: 'chatgpt', // 'chatgpt' | 'claude' | 'gemini' | 'cursor'
      userFirstName: '',
      userLastName: '',
      language: '', // '' = auto-detect
      micSensitivity: 'high', // 'high' (Far-Field & Soft Speech) | 'normal' (Smart Auto) | 'low' (Noisy Room)
      audioFeedback: true,
      preserveClipboard: false, // Keep dictated text on clipboard so manual Cmd+V is always available and no async race conditions
      showIdlePill: false, // Hidden by default when idle! Only appears when recording/speaking
      launchAtLogin: true,
      theme: 'system' // 'system' | 'dark' | 'light'
    },
    dictionary: ['Speakly'],
    customModes: [],
    auth: {
      user: null,
      accessToken: '',
      refreshToken: ''
    },
    stats: {
      wordsDictated: 0,
      secondsRecorded: 0,
      sessionsCount: 0
    },
    history: []
  };
}

class Store {
  constructor() {
    this._filePath = null;
    this._data = null;
  }

  init() {
    const userDataPath = app.getPath('userData');
    this._filePath = path.join(userDataPath, 'voxflow-state.json');
    const defaults = getDefaultState();

    try {
      if (fs.existsSync(this._filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this._filePath, 'utf8'));
        this._data = {
          settings: { ...defaults.settings, ...(parsed.settings || {}) },
          dictionary: Array.isArray(parsed.dictionary) ? parsed.dictionary : defaults.dictionary,
          customModes: Array.isArray(parsed.customModes) ? parsed.customModes : [],
          auth: { ...defaults.auth, ...(parsed.auth || {}) },
          stats: { ...defaults.stats, ...(parsed.stats || {}) },
          history: Array.isArray(parsed.history) ? parsed.history.slice(0, 20) : []
        };
        // SECURITY: early builds shipped shared API keys baked into the app. Those keys are revoked.
        // Wipe any copy persisted in a tester's local settings so requests route through the Speakly backend.
        const REVOKED_KEY_PREFIXES = ['sk-proj-5ZRCF0biq1s2', 'gsk_VcxiihhYyg3E671'];
        for (const field of ['openaiApiKey', 'groqApiKey']) {
          const val = String(this._data.settings[field] || '');
          if (REVOKED_KEY_PREFIXES.some((prefix) => val.startsWith(prefix))) {
            this._data.settings[field] = '';
          }
        }
        if (this._data.settings.provider !== 'local' && !this._data.settings.openaiApiKey && !this._data.settings.groqApiKey) {
          this._data.settings.provider = 'groq';
        }
      } else {
        this._data = defaults;
        this.save();
      }
    } catch {
      this._data = defaults;
    }
    return this._data;
  }

  getState() {
    if (!this._data) this.init();
    return {
      ...this._data,
      modes: this.getAllModes()
    };
  }

  getAllModes() {
    if (!this._data) this.init();
    return [...DEFAULT_MODES, ...(this._data.customModes || [])];
  }

  getActiveMode() {
    const modes = this.getAllModes();
    return modes.find((m) => m.id === this._data.settings.activeModeId) || modes[0];
  }

  updateSettings(patch) {
    if (!this._data) this.init();
    this._data.settings = { ...this._data.settings, ...patch };
    this.save();
    return this.getState();
  }

  setDictionary(words) {
    if (!this._data) this.init();
    const cleaned = [...new Set(words.map((w) => String(w).trim()).filter(Boolean))];
    this._data.dictionary = cleaned;
    this.save();
    return this.getState();
  }

  saveCustomMode(mode) {
    if (!this._data) this.init();
    const existingIdx = this._data.customModes.findIndex((m) => m.id === mode.id);
    const normalized = {
      id: mode.id || `custom_${Date.now()}`,
      name: String(mode.name || 'Custom Mode').trim(),
      badge: String(mode.badge || mode.name || 'Custom').trim().slice(0, 12),
      description: String(mode.description || 'Custom AI formatting instructions.').trim(),
      prompt: String(mode.prompt || '').trim(),
      builtIn: false
    };
    if (existingIdx >= 0) {
      this._data.customModes[existingIdx] = normalized;
    } else {
      this._data.customModes.push(normalized);
    }
    this.save();
    return this.getState();
  }

  deleteCustomMode(modeId) {
    if (!this._data) this.init();
    this._data.customModes = this._data.customModes.filter((m) => m.id !== modeId);
    if (this._data.settings.activeModeId === modeId) {
      this._data.settings.activeModeId = 'smart';
    }
    this.save();
    return this.getState();
  }

  recordSession({ rawText, finalText, durationSeconds, modeName, provider }) {
    if (!this._data) this.init();
    const wordCount = finalText.trim().split(/\s+/).filter(Boolean).length;
    this._data.stats.wordsDictated += wordCount;
    this._data.stats.secondsRecorded += Math.max(1, Math.round(durationSeconds || 1));
    this._data.stats.sessionsCount += 1;

    const entry = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      rawText,
      text: finalText,
      wordCount,
      durationSeconds: Number((durationSeconds || 0).toFixed(1)),
      modeName: modeName || 'Smart Polish',
      provider: provider || this._data.settings.provider
    };

    this._data.history = [entry, ...this._data.history].slice(0, 20);
    this.save();
    return { entry, state: this.getState() };
  }

  deleteHistoryItem(id) {
    if (!this._data) this.init();
    this._data.history = this._data.history.filter((item) => item.id !== id);
    this.save();
    return this.getState();
  }

  clearHistory() {
    if (!this._data) this.init();
    this._data.history = [];
    this.save();
    return this.getState();
  }

  setAuth(authData) {
    if (!this._data) this.init();
    this._data.auth = {
      user: authData?.user || null,
      accessToken: authData?.accessToken || '',
      refreshToken: authData?.refreshToken || ''
    };
    this.save();
    return this.getState();
  }

  exportUserData() {
    if (!this._data) this.init();
    return {
      appName: 'Speakly',
      exportedAt: new Date().toISOString(),
      formatVersion: '1.0',
      user: this._data.auth?.user || null,
      profile: {
        firstName: this._data.settings.userFirstName || '',
        lastName: this._data.settings.userLastName || ''
      },
      settings: {
        language: this._data.settings.language,
        triggerMode: this._data.settings.triggerMode,
        holdKey: this._data.settings.holdKey,
        toggleAccelerator: this._data.settings.toggleAccelerator,
        activeModeId: this._data.settings.activeModeId,
        theme: this._data.settings.theme,
        provider: this._data.settings.provider
      },
      stats: this._data.stats,
      dictionary: this._data.dictionary,
      customModes: this._data.customModes,
      history: this._data.history
    };
  }

  eraseAllUserData() {
    this._data = getInitialDefaults();
    this.save();
    return this.getState();
  }

  save() {
    if (!this._filePath || !this._data) return;
    try {
      fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
      fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist VoxFlow state:', err);
    }
  }
}

module.exports = new Store();
