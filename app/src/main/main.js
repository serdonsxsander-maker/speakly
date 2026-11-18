const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  shell,
  clipboard,
  dialog,
  systemPreferences,
  session,
  globalShortcut
} = require('electron');

const { createClient } = require('@supabase/supabase-js');

// Load environment variables from backend/.env and root .env for dev / key sync
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '../../../../backend/.env'), override: true });
  require('dotenv').config({ path: path.resolve(process.cwd(), '../.env') });
  require('dotenv').config({ path: path.resolve(process.cwd(), '../backend/.env'), override: true });
} catch (_) {}

const store = require('./store');
const { transcribeAudio, validateApiKey } = require('./transcribe');
const { pasteAtCursor } = require('./paster');
const { HotkeyManager, HOLD_KEY_MAP } = require('./hotkeys');
const { createTrayIcon, createAppIconPngBuffer } = require('./tray-icons');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lwiznvgeemrkrildyyvw.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aXpudmdlZW1ya3JpbGR5eXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODIyNzksImV4cCI6MjEwODg1ODI3OX0.eeh3Yp-ZkDKbZ-WyeZJ7ZtLXc86TeqbezFFp2QEhQo4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getResolvedBackendUrl() {
  if (process.env.SPEAKLY_BACKEND_URL) return process.env.SPEAKLY_BACKEND_URL.replace(/\/+$/, '');
  const isProd = app?.isPackaged || process.env.NODE_ENV !== 'development';
  return isProd ? 'https://speakly-backend-ie1b.onrender.com' : 'http://localhost:8787';
}

let dashboardWindow = null;
let pillWindow = null;
let tray = null;
let hotkeyManager = null;
let isQuitting = false;
let currentRecordingState = 'idle'; // 'idle' | 'recording' | 'processing'

// Ensure WebAudio AudioContext never suspends in background/overlay windows
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showDashboard();
  });
}

function ensureAppIconAsset() {
  try {
    const assetsDir = path.join(__dirname, '..', '..', 'assets');
    const iconPath = path.join(assetsDir, 'icon.png');
    if (fs.existsSync(iconPath) && fs.statSync(iconPath).size > 1000) {
      return iconPath;
    }
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(iconPath, createAppIconPngBuffer(512));
    return iconPath;
  } catch {
    return undefined;
  }
}

function getPermissionsStatus() {
  const isMac = process.platform === 'darwin';
  if (!isMac) {
    return {
      platform: process.platform,
      microphone: 'granted',
      accessibility: true
    };
  }
  const micStatus = systemPreferences.getMediaAccessStatus('microphone'); // 'not-determined' | 'granted' | 'denied' | 'restricted'
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  return {
    platform: 'darwin',
    microphone: micStatus,
    accessibility
  };
}

function positionPillOnActiveDisplay() {
  if (!pillWindow || pillWindow.isDestroyed()) return;
  try {
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    // Use bounds fallback if workArea is zeroed in certain fullscreen spaces
    const area = display.workArea && display.workArea.height > 100 ? display.workArea : display.bounds;
    const { x, y, width, height } = area;
    const pillWidth = 280;
    const pillHeight = 70;
    const targetX = Math.round(x + (width - pillWidth) / 2);
    const targetY = Math.round(y + height - pillHeight - 24);
    pillWindow.setBounds({ x: targetX, y: targetY, width: pillWidth, height: pillHeight }, false);
  } catch {
    // ignore display race
  }
}

function applyMacFullscreenOverlayFlags(win) {
  if (process.platform !== 'darwin' || !win || win.isDestroyed()) return;
  try {
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    win.setAlwaysOnTop(true, 'screen-saver', 1);
  } catch {
    // Ignore on older Electron builds
  }
}

function createPillWindow() {
  const isMac = process.platform === 'darwin';

  pillWindow = new BrowserWindow({
    width: 280,
    height: 70,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    hasShadow: false,
    focusable: false, // CRITICAL: Never steals focus from user's active document/input!
    alwaysOnTop: true,
    // CRITICAL on macOS: 'panel' creates an NSPanel (NSWindowStyleMaskNonActivatingPanel),
    // which is required by macOS WindowServer to render over native Full-Screen Spaces!
    type: isMac ? 'panel' : 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'pill-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  if (isMac) {
    applyMacFullscreenOverlayFlags(pillWindow);
  } else {
    pillWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  pillWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pill', 'pill.html'));

  pillWindow.webContents.on('render-process-gone', () => {
    if (!isQuitting && pillWindow && !pillWindow.isDestroyed()) {
      try {
        pillWindow.reload();
      } catch {
        // ignore
      }
    }
  });

  pillWindow.once('ready-to-show', () => {
    positionPillOnActiveDisplay();
    if (isMac) {
      applyMacFullscreenOverlayFlags(pillWindow);
    }
    // Always hidden when idle unless explicitly recording!
    pillWindow.hide();
    sendToPill('voxflow:state-sync', buildPublicState());
  });
}

function createDashboardWindow(iconPath) {
  const isMac = process.platform === 'darwin';

  dashboardWindow = new BrowserWindow({
    width: 1020,
    height: 700,
    minWidth: 820,
    minHeight: 580,
    title: 'Speakly',
    icon: iconPath,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#0c0d12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'dashboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  dashboardWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard', 'index.html'));

  dashboardWindow.webContents.on('render-process-gone', () => {
    if (!isQuitting && dashboardWindow && !dashboardWindow.isDestroyed()) {
      try {
        dashboardWindow.reload();
      } catch {
        // ignore
      }
    }
  });

  // Start completely hidden in the background / menu bar tray!
  // The control center will only open when the user clicks 'Open Speakly Control Center' in the tray menu.
  dashboardWindow.once('ready-to-show', () => {
    // dashboardWindow stays hidden on launch
  });

  dashboardWindow.on('focus', () => {
    broadcastState();
  });

  dashboardWindow.on('show', () => {
    broadcastState();
  });

  dashboardWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      dashboardWindow.hide();
      if (process.platform === 'darwin' && app.dock) {
        // Keep running quietly in Menu Bar; clicking Dock or Tray re-opens it
      }
    }
  });
}

function showDashboard() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    createDashboardWindow(ensureAppIconAsset());
    return;
  }
  if (dashboardWindow.isMinimized()) dashboardWindow.restore();
  dashboardWindow.show();
  dashboardWindow.focus();
  broadcastState();
}

function sendToDashboard(channel, payload) {
  try {
    if (
      dashboardWindow &&
      !dashboardWindow.isDestroyed() &&
      dashboardWindow.webContents &&
      !dashboardWindow.webContents.isDestroyed() &&
      dashboardWindow.webContents.mainFrame
    ) {
      dashboardWindow.webContents.send(channel, payload);
    }
  } catch {
    // Ignore transient disposed frame errors during reload/shutdown
  }
}

function sendToPill(channel, payload) {
  try {
    if (
      pillWindow &&
      !pillWindow.isDestroyed() &&
      pillWindow.webContents &&
      !pillWindow.webContents.isDestroyed() &&
      pillWindow.webContents.mainFrame
    ) {
      pillWindow.webContents.send(channel, payload);
    }
  } catch {
    // Recreate pill window if its render frame was disposed
    try {
      if (pillWindow && !pillWindow.isDestroyed()) {
        pillWindow.destroy();
      }
      pillWindow = null;
      createPillWindow();
    } catch {
      // ignore
    }
  }
}

function broadcastState() {
  const pub = buildPublicState();
  sendToDashboard('voxflow:state-updated', pub);
  sendToPill('voxflow:state-sync', pub);
  rebuildTrayMenu();
}

function getHotkeyDisplayLabel(settings) {
  const isMac = process.platform === 'darwin';
  const info = HOLD_KEY_MAP[settings.holdKey];
  if (info) return isMac ? info.macLabel : info.winLabel;
  if (settings.triggerMode === 'hold') {
    return settings.holdKey;
  }
  return (settings.toggleAccelerator || 'CommandOrControl+Shift+Space')
    .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
    .replace(/\+/g, ' + ');
}

function buildPublicState() {
  const state = store.getState();
  const activeMode = store.getActiveMode();
  return {
    ...state,
    activeMode,
    permissions: getPermissionsStatus(),
    recordingState: currentRecordingState,
    hotkeyDisplay: getHotkeyDisplayLabel(state.settings),
    holdKeyOptions: hotkeyManager ? hotkeyManager.getHoldKeyOptions() : [],
    lowLevelHookActive: hotkeyManager ? hotkeyManager.canUseLowLevelHook() : false
  };
}

function updateTrayIcon(recording) {
  if (!tray) return;
  tray.setImage(createTrayIcon({ recording }));
}

const WHISPER_LANGUAGES = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: 'Chinese - Simplified (简体中文)' },
  { code: 'nl', label: 'Dutch (Nederlands)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian (Shqip)' },
  { code: 'am', label: 'Amharic (አማርኛ)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'hy', label: 'Armenian (Հայերեն)' },
  { code: 'as', label: 'Assamese (অসমীয়া)' },
  { code: 'az', label: 'Azerbaijani (Azərbaycan)' },
  { code: 'ba', label: 'Bashkir' },
  { code: 'eu', label: 'Basque (Euskara)' },
  { code: 'be', label: 'Belarusian (Беларуская)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'bs', label: 'Bosnian (Bosanski)' },
  { code: 'br', label: 'Breton' },
  { code: 'bg', label: 'Bulgarian (Български)' },
  { code: 'yue', label: 'Cantonese (粵語)' },
  { code: 'ca', label: 'Catalan (Català)' },
  { code: 'zh-TW', label: 'Chinese - Traditional (繁體中文)' },
  { code: 'hr', label: 'Croatian (Hrvatski)' },
  { code: 'cs', label: 'Czech (Čeština)' },
  { code: 'da', label: 'Danish (Dansk)' },
  { code: 'en-GB', label: 'English - British' },
  { code: 'en-CA', label: 'English - Canadian' },
  { code: 'et', label: 'Estonian (Eesti)' },
  { code: 'fo', label: 'Faroese (Føroyskt)' },
  { code: 'fi', label: 'Finnish (Suomi)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'gl', label: 'Galician (Galego)' },
  { code: 'ka', label: 'Georgian (ქართული)' },
  { code: 'de-CH', label: 'German - Swiss (Deutsch)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'el', label: 'Greek (Ελληνικά)' },
  { code: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { code: 'ht', label: 'Haitian Creole (Kreyòl Ayisyen)' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'Hawaiian (\'Ōlelo Hawai\'i)' },
  { code: 'he', label: 'Hebrew (עברית)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'hu', label: 'Hungarian (Magyar)' },
  { code: 'is', label: 'Icelandic (Íslenska)' },
  { code: 'id', label: 'Indonesian (Bahasa Indonesia)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'jv', label: 'Javanese' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'kk', label: 'Kazakh (Қазақ)' },
  { code: 'km', label: 'Khmer (ខ្មែរ)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'lo', label: 'Lao (ລາວ)' },
  { code: 'la', label: 'Latin' },
  { code: 'lv', label: 'Latvian (Latviešu)' },
  { code: 'lt', label: 'Lithuanian (Lietuvių)' },
  { code: 'lb', label: 'Luxembourgish (Lëtzebuergesch)' },
  { code: 'mk', label: 'Macedonian (Македонски)' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms', label: 'Malay (Bahasa Melayu)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'mt', label: 'Maltese (Malti)' },
  { code: 'mi', label: 'Maori' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'mn', label: 'Mongolian (Монгол)' },
  { code: 'my', label: 'Myanmar (Burmese)' },
  { code: 'ne', label: 'Nepali (नेपाली)' },
  { code: 'no', label: 'Norwegian (Norsk)' },
  { code: 'oc', label: 'Occitan' },
  { code: 'ps', label: 'Pashto (پښتو)' },
  { code: 'fa', label: 'Persian (فارسی)' },
  { code: 'pl', label: 'Polish (Polski)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'ro', label: 'Romanian (Română)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'sa', label: 'Sanskrit (संस्कृतम्)' },
  { code: 'sr', label: 'Serbian (Srpski)' },
  { code: 'sn', label: 'Shona' },
  { code: 'sd', label: 'Sindhi (سنڌي)' },
  { code: 'si', label: 'Sinhala (සිංහල)' },
  { code: 'sk', label: 'Slovak (Slovenčina)' },
  { code: 'sl', label: 'Slovenian (Slovenščina)' },
  { code: 'so', label: 'Somali' },
  { code: 'su', label: 'Sundanese' },
  { code: 'sw', label: 'Swahili (Kiswahili)' },
  { code: 'sv', label: 'Swedish (Svenska)' },
  { code: 'tl', label: 'Tagalog (Filipino)' },
  { code: 'tg', label: 'Tajik (Тоҷикӣ)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'tt', label: 'Tatar' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'th', label: 'Thai (ไทย)' },
  { code: 'bo', label: 'Tibetan (བོད་ཡིག)' },
  { code: 'tr', label: 'Turkish (Türkçe)' },
  { code: 'tk', label: 'Turkmen' },
  { code: 'uk', label: 'Ukrainian (Українська)' },
  { code: 'ur', label: 'Urdu (اردو)' },
  { code: 'uz', label: 'Uzbek (Oʻzbek)' },
  { code: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  { code: 'cy', label: 'Welsh (Cymraeg)' },
  { code: 'yi', label: 'Yiddish (ייִדיש)' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'zu', label: 'Zulu' }
];

let availableAudioDevices = [];

function checkUpdatesFromTray() {
  dialog.showMessageBox({
    type: 'info',
    title: 'Speakly Updates',
    message: 'You are on the latest version of Speakly (v1.0.0).',
    detail: 'Speakly is up to date with the latest Groq LPU transcription, 5-minute safety limits, and macOS Gatekeeper optimizations.',
    buttons: ['OK', 'Visit Website'],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 1) {
      shell.openExternal('https://speakly.app');
    }
  }).catch(() => {});
}

async function pasteLastTranscript() {
  const state = store.getState();
  const lastItem = state.history?.[0];
  const textToPaste = lastItem?.text || lastItem?.finalText || lastItem?.rawText;

  if (!textToPaste || !textToPaste.trim()) {
    sendToPill('voxflow:pill-toast', {
      kind: 'muted',
      message: 'No recent transcript'
    });
    return;
  }

  try {
    const pasteResult = await pasteAtCursor(textToPaste, {
      preserveClipboard: state.settings.preserveClipboard
    });

    if (pasteResult.pasted) {
      sendToPill('voxflow:pill-toast', {
        kind: 'success',
        message: 'Pasted last transcript ✨'
      });
    } else if (pasteResult.reason === 'accessibility_missing') {
      sendToPill('voxflow:pill-toast', {
        kind: 'warning',
        message: 'Copied! Enable Accessibility to paste'
      });
    } else {
      sendToPill('voxflow:pill-toast', {
        kind: 'warning',
        message: 'Copied to clipboard'
      });
    }
  } catch (err) {
    console.error('Failed to paste last transcript:', err);
  }
}

function openShortcutsFromTray() {
  showDashboard();
  const send = () => sendToDashboard('voxflow:navigate-tab', { tab: 'settings', section: 'shortcuts' });
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (dashboardWindow.webContents.isLoading()) {
      dashboardWindow.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
}

function openHelpCenterFromTray() {
  const guidePath = path.resolve(__dirname, '..', '..', 'docs', 'ONBOARDING_GUIDE.md');
  if (fs.existsSync(guidePath)) {
    shell.openPath(guidePath);
  } else {
    shell.openExternal('https://speakly.app/help');
  }
}

function openSupportFromTray() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    createDashboardWindow(ensureAppIconAsset());
  }
  if (dashboardWindow.isMinimized()) dashboardWindow.restore();
  dashboardWindow.show();
  dashboardWindow.focus();
  const send = () => sendToDashboard('voxflow:open-feedback');
  if (dashboardWindow.webContents.isLoading()) {
    dashboardWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const state = store.getState();
  const hotkeyLabel = getHotkeyDisplayLabel(state.settings);

  // 1. Microphone Submenu (Matches Wispr Flow Image 3)
  const activeMicId = state.settings.micDeviceId || 'default';
  const micItems = [
    {
      label: 'Auto-detect (System Default)',
      type: 'radio',
      checked: activeMicId === 'default' || !activeMicId,
      click: () => {
        store.updateSettings({ micDeviceId: 'default' });
        rebuildTrayMenu();
        sendToPill('voxflow:pill-toast', { kind: 'success', message: 'Mic: Auto-detect' });
      }
    }
  ];

  if (availableAudioDevices && availableAudioDevices.length > 0) {
    const seen = new Set();
    availableAudioDevices.forEach((d) => {
      if (!d.deviceId || seen.has(d.deviceId)) return;
      seen.add(d.deviceId);
      const isBuiltIn = /built-in|internal|macbook/i.test(d.label);
      const displayLabel = isBuiltIn ? `${d.label} (recommended)` : d.label;
      micItems.push({
        label: displayLabel,
        type: 'radio',
        checked: activeMicId === d.deviceId,
        click: () => {
          store.updateSettings({ micDeviceId: d.deviceId });
          rebuildTrayMenu();
          sendToPill('voxflow:pill-toast', { kind: 'success', message: `Mic: ${d.label}` });
        }
      });
    });
  } else {
    micItems.push({
      label: 'Built-in mic (recommended)',
      type: 'radio',
      checked: activeMicId === 'builtin',
      click: () => {
        store.updateSettings({ micDeviceId: 'builtin' });
        rebuildTrayMenu();
      }
    });
  }

  // 2. Languages Submenu (Matches Wispr Flow Image 4)
  const activeLangCode = state.settings.language || '';
  const langItems = WHISPER_LANGUAGES.map((l) => ({
    label: l.label,
    type: 'radio',
    checked: activeLangCode === l.code,
    click: () => {
      store.updateSettings({ language: l.code });
      syncPreferencesToCloud();
      broadcastState();
      rebuildTrayMenu();
      sendToPill('voxflow:pill-toast', {
        kind: 'success',
        message: l.code ? `Language: ${l.label}` : 'Language: Auto-detect'
      });
    }
  }));

  // Wispr Flow Dropdown Menu Architecture (without meeting items, Speakly branded)
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Speakly',
      click: () => showDashboard()
    },
    { type: 'separator' },
    {
      label: 'Check for updates…',
      click: () => checkUpdatesFromTray()
    },
    {
      label: 'Paste last transcript',
      accelerator: 'Control+Alt+V',
      click: () => pasteLastTranscript()
    },
    { type: 'separator' },
    {
      label: 'Shortcuts',
      click: () => openShortcutsFromTray()
    },
    {
      label: 'Microphone',
      submenu: micItems
    },
    {
      label: 'Languages',
      submenu: langItems
    },
    { type: 'separator' },
    {
      label: 'Help center',
      click: () => openHelpCenterFromTray()
    },
    {
      label: 'Talk to support',
      accelerator: 'CmdOrControl+/',
      click: () => openSupportFromTray()
    },
    {
      label: 'Share feedback',
      click: () => openFeedbackFromTray()
    },
    { type: 'separator' },
    {
      label: 'Quit Speakly',
      accelerator: 'CmdOrControl+Q',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip(`Speakly Voice-to-Text (${hotkeyLabel})`);
}

function createTray() {
  tray = new Tray(createTrayIcon({ recording: false }));
  tray.on('double-click', () => showDashboard());
  rebuildTrayMenu();
}

// Opens the Control Center and asks the renderer to show the feedback modal.
// Waits for the page to finish loading if the window was just (re)created.
function openFeedbackFromTray() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    createDashboardWindow(ensureAppIconAsset());
  }
  if (dashboardWindow.isMinimized()) dashboardWindow.restore();
  dashboardWindow.show();
  dashboardWindow.focus();
  const send = () => sendToDashboard('voxflow:open-feedback');
  if (dashboardWindow.webContents.isLoading()) {
    dashboardWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

// ---- In-app feedback (stored in Supabase `public.feedback`, insert-only RLS) ----
const FEEDBACK_KINDS = ['bug', 'idea', 'other'];
const FEEDBACK_MAX_LENGTH = 5000;
const FEEDBACK_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isNetworkError(err) {
  const msg = String(err?.message || err || '');
  return /fetch failed|network|timed out|ENOTFOUND|ECONN|EAI_AGAIN|ETIMEDOUT|socket/i.test(msg);
}

function isAuthError(err) {
  const msg = String(err?.message || '');
  const code = String(err?.code || '');
  return code === 'PGRST301' || code === 'PGRST303' || /jwt|expired|invalid token|unauthorized/i.test(msg);
}

async function insertFeedbackRow(accessToken, row) {
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  // No .select(): users have no SELECT policy, so ask for a minimal response.
  const { error } = await withTimeout(userClient.from('feedback').insert(row), FEEDBACK_TIMEOUT_MS);
  return error || null;
}

async function getValidAccessToken() {
  const state = store.getState();
  const auth = state.auth || {};

  // Check if accessToken exists and is not expired (decode JWT payload expiry with 60s buffer)
  if (auth.accessToken) {
    try {
      const parts = auth.accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const exp = payload.exp ? payload.exp * 1000 : 0;
        // If token has at least 60 seconds of validity left, use it
        if (exp > Date.now() + 60000) {
          return auth.accessToken;
        }
      }
    } catch {
      // In case of parse error, attempt refresh below
    }
  }

  // Token is missing or expired — refresh using stored refresh_token
  if (auth.refreshToken) {
    try {
      const refreshClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { data, error: refreshError } = await refreshClient.auth.refreshSession({
        refresh_token: auth.refreshToken
      });
      if (!refreshError && data?.session) {
        store.setAuth({
          user: data.session.user || auth.user,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token || auth.refreshToken
        });
        if (data.session.user) {
          applyCloudPreferences(data.session.user);
        }
        broadcastState();
        return data.session.access_token;
      } else if (refreshError) {
        console.warn('[Auth Token Refresh Failed]:', refreshError.message);
      }
    } catch (err) {
      console.warn('[Auth Token Refresh Warning]:', err.message);
    }
  }

  return auth.accessToken || '';
}

async function submitFeedback(payload) {
  const kind = FEEDBACK_KINDS.includes(payload?.kind) ? payload.kind : 'other';
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  const includeDiagnostics = payload?.includeDiagnostics !== false;

  if (!message) {
    return { ok: false, error: 'Please write a short message first.' };
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, error: `Please keep it under ${FEEDBACK_MAX_LENGTH} characters.` };
  }

  const state = store.getState();
  const auth = state.auth || {};
  if (!auth.accessToken || !auth.user) {
    return { ok: false, error: 'Please sign in to send feedback (Settings → User Profile).', needsAuth: true };
  }

  const row = {
    kind,
    message,
    email: auth.user.email || null
  };
  if (includeDiagnostics) {
    let activeModeId = null;
    try {
      activeModeId = store.getActiveMode()?.id || null;
    } catch {}
    row.app_version = app.getVersion();
    row.os = process.platform;
    row.os_version = os.release();
    row.active_mode = activeModeId;
  }

  try {
    let error = await insertFeedbackRow(auth.accessToken, row);

    // Access token expired → refresh once with the stored refresh token and retry.
    if (error && isAuthError(error) && auth.refreshToken) {
      const refreshClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { data, error: refreshError } = await withTimeout(
        refreshClient.auth.refreshSession({ refresh_token: auth.refreshToken }),
        FEEDBACK_TIMEOUT_MS
      );
      if (refreshError || !data?.session) {
        if (refreshError && isNetworkError(refreshError)) throw refreshError;
        return { ok: false, error: 'Your session expired. Please sign in again to send feedback.', needsAuth: true };
      }
      store.setAuth({
        user: data.session.user || auth.user,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token || auth.refreshToken
      });
      error = await insertFeedbackRow(data.session.access_token, row);
    }

    if (error) {
      console.warn('Feedback insert failed:', error.code, error.message);
      if (isNetworkError(error)) {
        return { ok: false, error: "Couldn't reach the server. Check your connection and try again — your message is still here." };
      }
      if (isAuthError(error)) {
        return { ok: false, error: 'Your session expired. Please sign in again to send feedback.', needsAuth: true };
      }
      return { ok: false, error: 'Something went wrong sending your feedback. Please try again in a moment — your message is still here.' };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Feedback submit error:', err?.message || err);
    if (isNetworkError(err)) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again — your message is still here." };
    }
    return { ok: false, error: 'Something went wrong sending your feedback. Please try again — your message is still here.' };
  }
}

let lastActiveAppContext = '';
let lastScreenContext = { cursorPrefix: '', screenTerms: [], isSecureField: false };

const UI_SCREEN_STOPWORDS = new Set([
  'file', 'edit', 'view', 'window', 'help', 'history', 'bookmarks', 'profiles', 'tab', 'tabs',
  'close', 'minimize', 'zoom', 'back', 'forward', 'reload', 'refresh', 'search', 'send',
  'cancel', 'delete', 'save', 'open', 'settings', 'preferences', 'untitled', 'button', 'group',
  'toolbar', 'scrollarea', 'webarea', 'splitter', 'application', 'system', 'events', 'menu',
  'item', 'text', 'field', 'value', 'missing', 'true', 'false', 'null', 'undefined', 'electron',
  'speakly', 'chrome', 'safari', 'finder', 'desktop', 'documents', 'downloads', 'google',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has', 'had', 'your', 'you',
  'are', 'was', 'were', 'not', 'but', 'what', 'all', 'when', 'can', 'said', 'there', 'use',
  'each', 'which', 'how', 'their', 'will', 'other', 'about', 'out', 'many', 'then', 'them',
  'these', 'some', 'her', 'him', 'his', 'she', 'would', 'make', 'like', 'into', 'time', 'look',
  'two', 'more', 'write', 'see', 'number', 'way', 'could', 'people', 'than', 'first', 'water',
  'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get',
  'come', 'made', 'may', 'part', 'new', 'inbox', 'sent', 'drafts', 'trash', 'archive', 'today',
  'yesterday', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'een', 'het', 'van', 'naar', 'voor', 'met', 'niet', 'ook',
  'maar', 'dan', 'nog', 'wel', 'geen', 'meer', 'deze', 'dit', 'dat', 'wat', 'wie', 'hoe',
  'waar', 'wanneer', 'aan', 'uit', 'bij', 'door', 'over', 'onder', 'tussen', 'zonder', 'alle'
]);

function extractScreenTermsLocally(rawText = '') {
  const input = String(rawText || '');
  if (!input.trim()) return [];

  // Strip URLs, emails, unix file paths, and standalone numbers locally on-device
  const sanitized = input
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, ' ')
    .replace(/(?:^|\s)\/[A-Za-z0-9._/@-]+/g, ' ')
    .replace(/\b\d+\b/g, ' ');

  const seenLower = new Set();
  const normalizeCandidate = (rawCandidate, isTechnical = false) => {
    let candidate = String(rawCandidate || '').replace(/\s+/g, ' ').trim();
    if (!candidate || candidate.length < 3 || candidate.length > 40) return null;

    // Trim leading/trailing UI/common stopwords from multi-word capitalized phrases
    if (!isTechnical && candidate.includes(' ')) {
      const parts = candidate.split(' ');
      while (parts.length > 0 && UI_SCREEN_STOPWORDS.has(parts[0].toLowerCase())) parts.shift();
      while (parts.length > 0 && UI_SCREEN_STOPWORDS.has(parts[parts.length - 1].toLowerCase())) parts.pop();
      candidate = parts.join(' ');
      if (!candidate || candidate.length < 3) return null;
    }

    const words = candidate.split(/\s+/);
    if (words.every((w) => UI_SCREEN_STOPWORDS.has(w.toLowerCase()))) return null;
    if (/^\d+$/.test(candidate)) return null;
    // Skip hash-like tokens or numbers-heavy strings
    if (/\d{4,}/.test(candidate) || /^[0-9a-f]{8,}$/i.test(candidate)) return null;

    const key = candidate.toLowerCase();
    if (seenLower.has(key)) return null;
    seenLower.add(key);
    return candidate;
  };

  // 1. Technical identifiers (camelCase, PascalCase, snake_case) in order of appearance
  const techMatches = sanitized.match(
    /\b(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|[a-zA-Z][a-zA-Z0-9]*_[a-zA-Z0-9_]+)\b/g
  ) || [];
  const techTerms = [];
  for (const m of techMatches) {
    if (techTerms.length >= 20) break;
    const norm = normalizeCandidate(m, true);
    if (norm) techTerms.push(norm);
  }

  // 2. Capitalized Proper Nouns (single or two-word names/brands; never cross stopwords, tech terms, or newlines)
  const nounTerms = [];
  const tokenRe = /([A-Za-z][A-Za-z0-9]{1,24})|([^\sA-Za-z0-9]+|\n)/g;
  let match;
  let pendingFirst = null;
  let prevEnd = -1;

  const flushPending = () => {
    if (!pendingFirst) return;
    const norm = normalizeCandidate(pendingFirst, false);
    if (norm) nounTerms.push(norm);
    pendingFirst = null;
  };

  while ((match = tokenRe.exec(sanitized)) !== null) {
    if (nounTerms.length >= 20) break;
    const word = match[1];
    const sep = match[2];

    if (sep) {
      flushPending();
      continue;
    }

    const gap = sanitized.slice(prevEnd, match.index);
    if (prevEnd !== -1 && /[\n\r]|[^\s]/.test(gap)) {
      flushPending();
    }
    prevEnd = match.index + word.length;

    const lower = word.toLowerCase();
    const isCapitalized = /^[A-Z]/.test(word);
    const isStopword = UI_SCREEN_STOPWORDS.has(lower);
    const alreadySeen = seenLower.has(lower);

    if (!isCapitalized || isStopword || alreadySeen || word.length < 2) {
      flushPending();
      continue;
    }

    if (!pendingFirst) {
      if (word.length >= 3) {
        pendingFirst = word;
      }
    } else {
      const norm = normalizeCandidate(`${pendingFirst} ${word}`, false);
      if (norm) nounTerms.push(norm);
      pendingFirst = null;
    }
  }
  flushPending();

  // Balance technical identifiers and proper nouns so neither starves the other within the 20-term cap
  const merged = [
    ...techTerms.slice(0, 10),
    ...nounTerms.slice(0, 10),
    ...techTerms.slice(10),
    ...nounTerms.slice(10)
  ];
  return merged.slice(0, 20);
}

function captureActiveAppContext({ useScreenContext = true } = {}) {
  lastScreenContext = { cursorPrefix: '', screenTerms: [], isSecureField: false };

  if (process.platform === 'darwin') {
    if (!useScreenContext) {
      execFile(
        'osascript',
        [
          '-e',
          'tell application "System Events" to set fp to first application process whose frontmost is true',
          '-e',
          'set appName to name of fp',
          '-e',
          'set winTitle to ""',
          '-e',
          'try',
          '-e',
          'set winTitle to name of front window of fp',
          '-e',
          'end try',
          '-e',
          'return appName & " | " & winTitle'
        ],
        { timeout: 1200 },
        (err, stdout) => {
          if (!err && stdout) {
            lastActiveAppContext = String(stdout).trim().slice(0, 140);
          }
        }
      );
      return;
    }

    const appleScript = `
tell application "System Events"
  set fp to first application process whose frontmost is true
  set appName to ""
  try
    set appName to (name of fp) as string
  end try
  set winTitle to ""
  try
    set winTitle to (name of front window of fp) as string
  end try
  set isSecure to "0"
  set cursorCtx to ""
  set winTerms to ""
  try
    set fel to value of attribute "AXFocusedUIElement" of fp
    set fRole to ""
    set fSub to ""
    try
      set fRole to (value of attribute "AXRole" of fel) as string
    end try
    try
      set fSub to (value of attribute "AXSubrole" of fel) as string
    end try
    if fRole contains "AXSecureTextField" or fSub contains "AXSecureTextField" then
      set isSecure to "1"
    else
      set rawVal to ""
      try
        set vv to value of attribute "AXValue" of fel
        if vv is not missing value and (class of vv is text) then set rawVal to vv
      end try
      set valLen to length of rawVal
      if valLen > 0 then
        set hasRange to false
        set caretEnd to valLen
        try
          set sr to value of attribute "AXSelectedTextRange" of fel
          if class of sr is list and (count of sr) >= 1 then
            set caretEnd to item 1 of sr
            set hasRange to true
          end if
        end try
        if hasRange then
          if caretEnd > valLen then set caretEnd to valLen
          if caretEnd > 0 then
            set sliceStart to caretEnd - 160
            if sliceStart < 1 then set sliceStart to 1
            set cursorCtx to text sliceStart thru caretEnd of rawVal
          end if
        else
          set sliceStart to valLen - 160
          if sliceStart < 1 then set sliceStart to 1
          set cursorCtx to text sliceStart thru valLen of rawVal
        end if
      end if
    end if
  end try
  if isSecure is "0" then
    try
      set fw to front window of fp
      try
        repeat with n in (name of every UI element of fw)
          if n is not missing value then set winTerms to winTerms & linefeed & (n as string)
        end repeat
      end try
      try
        repeat with s in (value of every static text of fw)
          if s is not missing value then set winTerms to winTerms & linefeed & (s as string)
        end repeat
      end try
      set els to UI elements of fw
      set maxN to count of els
      if maxN > 20 then set maxN to 20
      repeat with i from 1 to maxN
        set el to item i of els
        try
          set subEls to UI elements of el
          set subN to count of subEls
          if subN > 15 then set subN to 15
          repeat with j from 1 to subN
            set se to item j of subEls
            try
              set snm to name of se
              if snm is not missing value then set winTerms to winTerms & linefeed & (snm as string)
            end try
            try
              set sv to value of se
              if sv is not missing value and (class of sv is text) then set winTerms to winTerms & linefeed & sv
            end try
          end repeat
        end try
      end repeat
    end try
  end if
  return appName & " | " & winTitle & "__SPEAKLY_SEP__" & isSecure & "__SPEAKLY_SEP__" & cursorCtx & "__SPEAKLY_SEP__" & winTerms
end tell`.trim();

    execFile('osascript', ['-e', appleScript], { timeout: 1400 }, (err, stdout) => {
      if (err || !stdout) return;
      const parts = String(stdout).split('__SPEAKLY_SEP__');
      const header = String(parts[0] || '').trim();
      lastActiveAppContext = header.slice(0, 140);

      const isSecureField = String(parts[1] || '').trim() === '1';
      if (isSecureField) {
        lastScreenContext = { cursorPrefix: '', screenTerms: [], isSecureField: true };
        return;
      }

      const rawCursor = String(parts[2] || '')
        .replace(/missing value/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      const cursorPrefix = rawCursor.slice(-80);
      const winTitle = header.includes(' | ') ? header.split(' | ').slice(1).join(' | ') : '';
      const rawWindowText = `${winTitle}\n${String(parts[3] || '')}`;
      const screenTerms = extractScreenTermsLocally(rawWindowText);

      lastScreenContext = {
        cursorPrefix,
        screenTerms,
        isSecureField: false
      };
    });
  } else if (process.platform === 'win32') {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$p = Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -MemberDefinition \'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();\' -Name "Win32" -Namespace "Win32" -PassThru)::GetForegroundWindow() } | Select-Object -First 1; if ($p) { "$($p.ProcessName) | $($p.MainWindowTitle)" }'
      ],
      { timeout: 1200 },
      (err, stdout) => {
        if (!err && stdout) {
          const header = String(stdout).trim();
          lastActiveAppContext = header.slice(0, 140);
          if (useScreenContext) {
            const winTitle = header.includes(' | ') ? header.split(' | ').slice(1).join(' | ') : header;
            lastScreenContext = {
              cursorPrefix: '',
              screenTerms: extractScreenTermsLocally(winTitle),
              isSecureField: false
            };
          }
        }
      }
    );
  }
}

// 5 minutes max recording safety limit to protect API costs and avoid memory buildup
const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;
let recordingSafetyWatchdog = null;
let postPasteWatchTimers = [];

function clearPostPasteWatch() {
  for (const t of postPasteWatchTimers) {
    clearTimeout(t);
  }
  postPasteWatchTimers = [];
}

function extractMatchingSegment(fieldValue, baselineText) {
  const full = String(fieldValue || '').trim();
  const base = String(baselineText || '').trim();
  if (!full || !base) return '';
  if (full.length <= Math.max(200, base.length * 2.2)) {
    return full;
  }

  // In multi-line fields (emails, notes, docs), locate the paragraph/line most similar to the pasted dictation
  const baseWords = new Set(
    base
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter((w) => w.length >= 2)
  );
  if (baseWords.size === 0) return '';

  const segments = full
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s && s.length <= Math.max(240, base.length * 2.2));

  let bestSeg = '';
  let bestScore = 0;
  for (const seg of segments) {
    const segWords = seg
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter((w) => w.length >= 2);
    let matches = 0;
    for (const w of segWords) {
      if (baseWords.has(w)) matches++;
    }
    const score = matches / Math.max(1, baseWords.size);
    if (score > bestScore) {
      bestScore = score;
      bestSeg = seg;
    }
  }
  return bestScore >= 0.4 ? bestSeg : '';
}

function schedulePostPasteLearningWatch({ pastedText, historyId }) {
  clearPostPasteWatch();
  const curState = store.getState();
  if (curState.settings.autoLearnDictionary === false || curState.subscription?.plan !== 'pro') {
    return;
  }

  let currentBaseline = String(pastedText || '').trim();
  if (!currentBaseline) return;

  let initialClipboard = '';
  try {
    initialClipboard = clipboard.readText();
  } catch {}

  const tryLearnCandidate = (rawText) => {
    if (currentRecordingState !== 'idle') return;
    const candidate = extractMatchingSegment(rawText, currentBaseline);
    if (!candidate || candidate === currentBaseline) return;

    const result = store.learnFromEdit({
      originalText: currentBaseline,
      editedText: candidate,
      historyId,
      force: false
    });

    if (result.learned.length > 0 || result.corrections.length > 0) {
      currentBaseline = candidate;
      syncPreferencesToCloud();
      broadcastState();

      const label =
        result.corrections.length > 0
          ? `"${result.corrections[0].from}" → "${result.corrections[0].to}"`
          : `Added "${result.learned[0]}" to Dictionary`;
      sendToPill('voxflow:pill-toast', {
        kind: 'success',
        title: 'Auto-Learned 🦆',
        message: label
      });
    }
  };

  for (const delayMs of [4500, 8000]) {
    const timer = setTimeout(() => {
      if (currentRecordingState !== 'idle') return;

      try {
        const cbNow = clipboard.readText();
        if (cbNow && cbNow !== initialClipboard) {
          tryLearnCandidate(cbNow);
        }
      } catch {}

      if (process.platform === 'darwin') {
        execFile(
          'osascript',
          [
            '-e', 'tell application "System Events"',
            '-e', 'set fp to first application process whose frontmost is true',
            '-e', 'set focusedEl to value of attribute "AXFocusedUIElement" of fp',
            '-e', 'return value of attribute "AXValue" of focusedEl',
            '-e', 'end tell'
          ],
          { timeout: 1000 },
          (err, stdout) => {
            if (!err && stdout && stdout.trim()) {
              tryLearnCandidate(stdout.trim());
            }
          }
        );
      }
    }, delayMs);
    postPasteWatchTimers.push(timer);
  }
}

function triggerStartRecording({ source = 'hotkey' } = {}) {
  if (currentRecordingState !== 'idle') return;
  clearPostPasteWatch();

  // Gate check on macOS: if Accessibility is not trusted, warn user and open setup dashboard
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
    showDashboard();
    sendToPill('voxflow:pill-toast', {
      kind: 'warning',
      title: 'Action Needed ⚠️',
      message: 'Accessibility required to paste'
    });
    return;
  }

  const state = store.getState();

  // 1. Send IPC to start microphone capture FIRST before any window positioning so mic starts 0ms!
  currentRecordingState = 'recording';
  sendToPill('voxflow:start-capture', {
    source,
    audioFeedback: state.settings.audioFeedback,
    micSensitivity: state.settings.micSensitivity || 'high',
    micDeviceId: state.settings.micDeviceId || 'default',
    modeBadge: store.getActiveMode().badge,
    triggerMode: state.settings.triggerMode
  });

  // 5-minute safety shut-off watchdog (protects API costs and memory in case user forgets toggle is active)
  if (recordingSafetyWatchdog) {
    clearTimeout(recordingSafetyWatchdog);
    recordingSafetyWatchdog = null;
  }
  recordingSafetyWatchdog = setTimeout(() => {
    if (currentRecordingState === 'recording') {
      console.warn('[Safety Watchdog] 5-minute maximum recording limit reached. Automatically stopping to protect API costs.');
      sendToPill('voxflow:pill-toast', {
        kind: 'warning',
        title: 'Safety Limit ⏱️',
        message: 'Auto-stopped: 5 min limit reached'
      });
      triggerStopRecording();
    }
  }, MAX_RECORDING_DURATION_MS);

  // Asynchronously capture active app, cursor prefix, & local screen terms while user speaks (0ms latency overhead)
  captureActiveAppContext({ useScreenContext: state.settings.useScreenContext !== false });

  // 2. Show HUD pill on top of fullscreen/desktop without stealing focus
  positionPillOnActiveDisplay();
  if (pillWindow && !pillWindow.isDestroyed()) {
    if (process.platform === 'darwin') {
      applyMacFullscreenOverlayFlags(pillWindow);
      pillWindow.showInactive();
      applyMacFullscreenOverlayFlags(pillWindow);
    } else {
      pillWindow.setAlwaysOnTop(true, 'screen-saver');
      pillWindow.showInactive();
    }
  }

  updateTrayIcon(true);
  rebuildTrayMenu();
  sendToDashboard('voxflow:recording-status', { state: 'recording' });
}

let processingWatchdog = null;

function triggerStopRecording() {
  if (currentRecordingState !== 'recording') return;

  if (recordingSafetyWatchdog) {
    clearTimeout(recordingSafetyWatchdog);
    recordingSafetyWatchdog = null;
  }

  currentRecordingState = 'processing';
  updateTrayIcon(false);
  rebuildTrayMenu();

  const curSettings = store.getState().settings;
  const watchdogMs = curSettings.provider === 'local' ? 65000 : 22000;

  if (processingWatchdog) clearTimeout(processingWatchdog);
  processingWatchdog = setTimeout(() => {
    if (currentRecordingState === 'processing') {
      currentRecordingState = 'idle';
      if (hotkeyManager) hotkeyManager.notifyRecordingStoppedExternally();
      rebuildTrayMenu();
      sendToDashboard('voxflow:recording-status', { state: 'idle' });
      if (pillWindow && !pillWindow.isDestroyed()) {
        pillWindow.hide();
      }
    }
  }, watchdogMs);
  sendToPill('voxflow:stop-capture', {
    audioFeedback: curSettings.audioFeedback,
    micSensitivity: curSettings.micSensitivity || 'high'
  });
  sendToDashboard('voxflow:recording-status', { state: 'processing' });
}

function triggerCancelRecording() {
  if (currentRecordingState === 'idle') return;

  if (recordingSafetyWatchdog) {
    clearTimeout(recordingSafetyWatchdog);
    recordingSafetyWatchdog = null;
  }

  currentRecordingState = 'idle';
  updateTrayIcon(false);
  if (hotkeyManager) hotkeyManager.notifyRecordingStoppedExternally();
  rebuildTrayMenu();

  const state = store.getState();
  sendToPill('voxflow:cancel-capture', {
    showIdlePill: state.settings.showIdlePill
  });
  sendToDashboard('voxflow:recording-status', { state: 'idle' });

  if (!state.settings.showIdlePill && pillWindow && !pillWindow.isDestroyed()) {
    setTimeout(() => {
      if (currentRecordingState === 'idle' && !store.getState().settings.showIdlePill) {
        pillWindow.hide();
      }
    }, 350);
  }
}

async function syncPreferencesToCloud() {
  const state = store.getState();
  if (!state.auth || !state.auth.accessToken) return;
  const preferences = {
    triggerMode: state.settings.triggerMode,
    holdKey: state.settings.holdKey,
    toggleAccelerator: state.settings.toggleAccelerator,
    activeModeId: state.settings.activeModeId,
    aiPromptTarget: state.settings.aiPromptTarget,
    userFirstName: state.settings.userFirstName,
    userLastName: state.settings.userLastName,
    language: state.settings.language,
    provider: state.settings.provider,
    autoLearnDictionary: state.settings.autoLearnDictionary,
    useScreenContext: state.settings.useScreenContext,
    dictionary: state.dictionary,
    learnedCorrections: state.learnedCorrections || []
  };
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (state.auth.refreshToken) {
      await userClient.auth.setSession({
        access_token: state.auth.accessToken,
        refresh_token: state.auth.refreshToken
      });
    }
    await userClient.auth.updateUser({
      data: { speakly_prefs: preferences }
    });
  } catch {}
}

let activeOAuthServer = null;

function stopActiveOAuthServer() {
  if (activeOAuthServer) {
    try {
      activeOAuthServer.close();
    } catch {}
    activeOAuthServer = null;
  }
}

function applyCloudPreferences(user, { replacePersonalData = false } = {}) {
  if (!user) return;
  const meta = user?.user_metadata || {};
  const cloudPrefs = meta.speakly_prefs || {};
  const curSettings = store.getState().settings;
  const patch = {};
  if (cloudPrefs.triggerMode) patch.triggerMode = cloudPrefs.triggerMode;
  if (cloudPrefs.holdKey) patch.holdKey = cloudPrefs.holdKey;
  if (cloudPrefs.toggleAccelerator) patch.toggleAccelerator = cloudPrefs.toggleAccelerator;
  if (cloudPrefs.activeModeId) patch.activeModeId = cloudPrefs.activeModeId;
  if (cloudPrefs.aiPromptTarget) patch.aiPromptTarget = cloudPrefs.aiPromptTarget;
  if (cloudPrefs.language !== undefined) patch.language = cloudPrefs.language;
  if (cloudPrefs.provider) patch.provider = cloudPrefs.provider;
  if (cloudPrefs.autoLearnDictionary !== undefined) {
    patch.autoLearnDictionary = Boolean(cloudPrefs.autoLearnDictionary);
  }
  if (cloudPrefs.useScreenContext !== undefined) {
    patch.useScreenContext = Boolean(cloudPrefs.useScreenContext);
  }

  // Strictly scope First Name & Last Name to the authenticated account
  const oauthFullName = String(meta.full_name || meta.name || '').trim();
  const oauthParts = oauthFullName ? oauthFullName.split(/\s+/) : [];
  const oauthFirst = meta.given_name || oauthParts[0] || '';
  const oauthLast = meta.family_name || oauthParts.slice(1).join(' ') || '';

  if (cloudPrefs.userFirstName !== undefined) {
    patch.userFirstName = cloudPrefs.userFirstName;
  } else if (oauthFirst) {
    patch.userFirstName = oauthFirst;
  } else if (replacePersonalData) {
    patch.userFirstName = '';
  }

  if (cloudPrefs.userLastName !== undefined) {
    patch.userLastName = cloudPrefs.userLastName;
  } else if (oauthLast) {
    patch.userLastName = oauthLast;
  } else if (replacePersonalData) {
    patch.userLastName = '';
  }

  if (Object.keys(patch).length > 0) {
    store.updateSettings(patch);
    if (hotkeyManager) hotkeyManager.configure(store.getState().settings);
  }
  if (Array.isArray(cloudPrefs.dictionary)) {
    if (replacePersonalData || cloudPrefs.dictionary.length > 0) {
      store.setDictionary(cloudPrefs.dictionary);
    }
  }
  if (Array.isArray(cloudPrefs.learnedCorrections)) {
    if (replacePersonalData) {
      store.setLearnedCorrections(cloudPrefs.learnedCorrections);
    } else if (cloudPrefs.learnedCorrections.length > 0) {
      const existing = store.getState().learnedCorrections || [];
      const byFrom = new Map();
      for (const r of [...cloudPrefs.learnedCorrections, ...existing]) {
        if (r && typeof r.from === 'string' && typeof r.to === 'string' && r.from.trim() && r.to.trim()) {
          byFrom.set(r.from.trim().toLowerCase(), r);
        }
      }
      store.setLearnedCorrections(Array.from(byFrom.values()));
    }
  }
  if (meta.speakly_subscription) {
    store.setSubscription(meta.speakly_subscription);
  }
}

function setAuthenticatedUserSession({ user, accessToken, refreshToken, isSignUp = false }) {
  const prevUserId = store.getState().auth?.user?.id || null;
  const nextUserId = user?.id || null;
  const isAccountSwitch = Boolean(nextUserId && prevUserId !== nextUserId);

  if (!isSignUp && isAccountSwitch) {
    store.resetPersonalDataToDefaults();
  }

  store.setAuth({
    user: { id: user?.id, email: user?.email },
    accessToken: accessToken || '',
    refreshToken: refreshToken || ''
  });

  applyCloudPreferences(user, { replacePersonalData: !isSignUp && isAccountSwitch });
}

function registerIpcHandlers() {
  ipcMain.handle('voxflow:get-state', () => buildPublicState());

  ipcMain.handle('voxflow:auth-google', async () => {
    stopActiveOAuthServer();

    return new Promise(async (resolve, reject) => {
      let isSettled = false;
      const timeout = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          stopActiveOAuthServer();
          reject(new Error('Google sign-in timed out. Please try again.'));
        }
      }, 120000);

      activeOAuthServer = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url, 'http://localhost:54321');

          if (reqUrl.pathname === '/auth/callback') {
            const code = reqUrl.searchParams.get('code');
            const errorDesc = reqUrl.searchParams.get('error_description') || reqUrl.searchParams.get('error');

            if (errorDesc) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;background:#09090b;color:#ef4444;text-align:center;"><h2>Authentication Error</h2><p>${errorDesc}</p><p>You can close this tab and return to Speakly.</p></body></html>`);
              if (!isSettled) {
                isSettled = true;
                clearTimeout(timeout);
                stopActiveOAuthServer();
                reject(new Error(errorDesc));
              }
              return;
            }

            if (code) {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) throw error;
              setAuthenticatedUserSession({
                user: data.user,
                accessToken: data.session?.access_token || '',
                refreshToken: data.session?.refresh_token || ''
              });
              broadcastState();
              showDashboard();

              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Speakly</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:36px;text-align:center;max-width:400px;}</style></head><body><div class="card"><h2 style="color:#22c55e;margin-top:0;">✓ Signed in to Speakly!</h2><p style="color:#a1a1aa;">You can close this tab and return to Speakly.</p></div><script>setTimeout(() => window.close(), 1500);</script></body></html>`);

              if (!isSettled) {
                isSettled = true;
                clearTimeout(timeout);
                setTimeout(() => stopActiveOAuthServer(), 1000);
                resolve(buildPublicState());
              }
              return;
            }

            // Implicit token fragment receiver
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Speakly Authentication</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px 40px; text-align: center; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h2 { margin: 12px 0 8px; font-size: 20px; }
    p { color: #a1a1aa; font-size: 14px; margin: 0; }
    .spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid rgba(250,204,21,0.2); border-top-color: #facc15; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="spinner" id="spinner"></div>
    <h2 id="title">Connecting to Speakly…</h2>
    <p id="msg">Finalizing your Google sign-in.</p>
  </div>
  <script>
    const hash = window.location.hash.substring(1);
    const search = window.location.search.substring(1);
    const params = new URLSearchParams(hash || search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const errorDesc = params.get('error_description') || params.get('error');

    if (errorDesc) {
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('title').textContent = 'Authentication Failed';
      document.getElementById('title').style.color = '#ef4444';
      document.getElementById('msg').textContent = errorDesc;
    } else if (accessToken) {
      fetch('/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, refreshToken })
      }).then(r => r.json()).then(res => {
        if (res.ok) {
          document.getElementById('spinner').style.display = 'none';
          document.getElementById('title').textContent = '✓ Successfully Signed In!';
          document.getElementById('title').style.color = '#22c55e';
          document.getElementById('msg').textContent = 'You can safely close this window and return to Speakly.';
          setTimeout(() => { window.close(); }, 1500);
        } else {
          throw new Error(res.error || 'Failed to save session');
        }
      }).catch(err => {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'Error';
        document.getElementById('msg').textContent = err.message;
      });
    } else {
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('title').textContent = 'No tokens received';
      document.getElementById('msg').textContent = 'Please try signing in again.';
    }
  </script>
</body>
</html>`);
            return;
          }

          if (reqUrl.pathname === '/auth/token' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
              try {
                const { accessToken, refreshToken } = JSON.parse(body);
                const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
                if (userError) throw userError;

                setAuthenticatedUserSession({
                  user: userData.user,
                  accessToken,
                  refreshToken: refreshToken || ''
                });

                broadcastState();
                showDashboard();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));

                if (!isSettled) {
                  isSettled = true;
                  clearTimeout(timeout);
                  setTimeout(() => stopActiveOAuthServer(), 1000);
                  resolve(buildPublicState());
                }
              } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
                if (!isSettled) {
                  isSettled = true;
                  clearTimeout(timeout);
                  stopActiveOAuthServer();
                  reject(err);
                }
              }
            });
            return;
          }

          res.writeHead(404);
          res.end();
        } catch (err) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeout);
            stopActiveOAuthServer();
            reject(err);
          }
        }
      });

      activeOAuthServer.listen(54321, '127.0.0.1', async () => {
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: 'http://localhost:54321/auth/callback',
              skipBrowserRedirect: true
            }
          });
          if (error) throw error;
          if (data?.url) {
            shell.openExternal(data.url);
          } else {
            throw new Error('No authorization URL received from Supabase');
          }
        } catch (err) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeout);
            stopActiveOAuthServer();
            reject(err);
          }
        }
      });

      activeOAuthServer.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeout);
          stopActiveOAuthServer();
          reject(new Error(`Failed to bind callback server on port 54321: ${err.message}`));
        }
      });
    });
  });

  ipcMain.handle('voxflow:auth-login', async (_event, { email, password, firstName, lastName, referralCode, isSignUp }) => {
    if (firstName !== undefined || lastName !== undefined) {
      const namePatch = {};
      if (firstName && String(firstName).trim()) namePatch.userFirstName = String(firstName).trim();
      if (lastName && String(lastName).trim()) namePatch.userLastName = String(lastName).trim();
      if (Object.keys(namePatch).length > 0) store.updateSettings(namePatch);
    }

    const state = store.getState();
    const currentPrefs = {
      triggerMode: state.settings.triggerMode,
      holdKey: state.settings.holdKey,
      toggleAccelerator: state.settings.toggleAccelerator,
      activeModeId: state.settings.activeModeId,
      aiPromptTarget: state.settings.aiPromptTarget,
      userFirstName: state.settings.userFirstName,
      userLastName: state.settings.userLastName,
      language: state.settings.language,
      provider: state.settings.provider,
      autoLearnDictionary: state.settings.autoLearnDictionary,
      dictionary: state.dictionary,
      learnedCorrections: state.learnedCorrections || []
    };

    let authResult;
    if (isSignUp) {
      const userMeta = { speakly_prefs: currentPrefs };
      if (referralCode && String(referralCode).trim()) {
        userMeta.referral_code = String(referralCode).trim().toUpperCase();
      }
      authResult = await supabase.auth.signUp({
        email,
        password,
        options: { data: userMeta }
      });
    } else {
      authResult = await supabase.auth.signInWithPassword({ email, password });
    }

    if (authResult.error) {
      throw new Error(authResult.error.message || 'Authentication failed');
    }

    const user = authResult.data?.user;
    const sessionData = authResult.data?.session;

    setAuthenticatedUserSession({
      user,
      accessToken: sessionData?.access_token || '',
      refreshToken: sessionData?.refresh_token || '',
      isSignUp: Boolean(isSignUp)
    });

    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:auth-logout', () => {
    clearPostPasteWatch();
    store.setAuth({ user: null, accessToken: '', refreshToken: '' });
    store.setSubscription({ plan: 'free', status: 'trial', customerPortalUrl: '', renewsAt: null });
    store.resetPersonalDataToDefaults();
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:open-checkout', async () => {
    const state = store.getState();
    const user = state.auth?.user;
    const accessToken = state.auth?.accessToken;
    let checkoutUrl = 'https://speakly.lemonsqueezy.com/buy/speakly-pro';

    try {
      if (accessToken) {
        const backendUrl = getResolvedBackendUrl();
        const res = await fetch(`${backendUrl}/api/v1/billing/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ returnUrl: 'https://speakly.app' })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.checkoutUrl) checkoutUrl = json.checkoutUrl;
        }
      } else {
        const urlObj = new URL(checkoutUrl);
        if (user?.email) urlObj.searchParams.set('checkout[email]', user.email);
        if (user?.id) urlObj.searchParams.set('checkout[custom][user_id]', user.id);
        checkoutUrl = urlObj.toString();
      }
    } catch (_) {
      try {
        const urlObj = new URL(checkoutUrl);
        if (user?.email) urlObj.searchParams.set('checkout[email]', user.email);
        if (user?.id) urlObj.searchParams.set('checkout[custom][user_id]', user.id);
        checkoutUrl = urlObj.toString();
      } catch (_) {}
    }

    shell.openExternal(checkoutUrl);
    return { success: true, url: checkoutUrl };
  });

  ipcMain.handle('voxflow:open-billing-portal', async () => {
    const state = store.getState();
    const accessToken = state.auth?.accessToken;
    let portalUrl = state.subscription?.customerPortalUrl || 'https://speakly.lemonsqueezy.com/billing';

    try {
      if (accessToken) {
        const backendUrl = getResolvedBackendUrl();
        const res = await fetch(`${backendUrl}/api/v1/billing/portal`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.portalUrl) portalUrl = json.portalUrl;
        }
      }
    } catch (_) {}

    shell.openExternal(portalUrl);
    return { success: true, url: portalUrl };
  });

  ipcMain.handle('voxflow:update-settings', (_event, patch) => {
    const prev = store.getState().settings;
    store.updateSettings(patch);
    const next = store.getState().settings;

    if (
      patch.triggerMode !== undefined ||
      patch.holdKey !== undefined ||
      patch.toggleAccelerator !== undefined
    ) {
      hotkeyManager.configure(next);
    }

    if (patch.launchAtLogin !== undefined && patch.launchAtLogin !== prev.launchAtLogin) {
      try {
        app.setLoginItemSettings({ openAtLogin: Boolean(next.launchAtLogin) });
      } catch {
        // Ignore in dev unpacked mode if unsupported
      }
    }

    if (patch.showIdlePill !== undefined && pillWindow && !pillWindow.isDestroyed()) {
      if (next.showIdlePill) {
        positionPillOnActiveDisplay();
        pillWindow.showInactive();
      } else if (currentRecordingState === 'idle') {
        pillWindow.hide();
      }
    }

    syncPreferencesToCloud();
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:validate-key', async (_event, { provider, apiKey }) => {
    return validateApiKey({ provider, apiKey });
  });

  ipcMain.handle('voxflow:set-dictionary', (_event, words) => {
    store.setDictionary(words);
    syncPreferencesToCloud();
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:learn-from-edit', (_event, { originalText, editedText, historyId = null, force = false } = {}) => {
    const res = store.learnFromEdit({ originalText, editedText, historyId, force });
    if (res.learned.length > 0 || res.corrections.length > 0 || historyId) {
      syncPreferencesToCloud();
      broadcastState();
    }
    return { ...res, state: buildPublicState() };
  });

  ipcMain.handle('voxflow:add-learned-correction', (_event, { from, to } = {}) => {
    store.addLearnedCorrection({ from, to });
    syncPreferencesToCloud();
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:remove-learned-correction', (_event, from) => {
    store.removeLearnedCorrection(from);
    syncPreferencesToCloud();
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:save-custom-mode', (_event, mode) => {
    store.saveCustomMode(mode);
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:delete-custom-mode', (_event, modeId) => {
    store.deleteCustomMode(modeId);
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:delete-history-item', (_event, id) => {
    store.deleteHistoryItem(id);
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:clear-history', () => {
    store.clearHistory();
    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:copy-text', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });

  ipcMain.handle('voxflow:export-data', async () => {
    try {
      const exportPayload = store.exportUserData();
      const defaultFilename = `speakly-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export My Speakly Data (GDPR Portability)',
        defaultPath: path.join(app.getPath('downloads'), defaultFilename),
        filters: [{ name: 'JSON Data', extensions: ['json'] }]
      });
      if (!canceled && filePath) {
        fs.writeFileSync(filePath, JSON.stringify(exportPayload, null, 2), 'utf8');
        return { ok: true, filePath };
      }
      return { ok: false, canceled: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('voxflow:delete-account', async () => {
    const state = store.getState();
    // 1. Wipe cloud preferences from Supabase if authenticated
    if (state.auth && state.auth.accessToken) {
      try {
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        if (state.auth.refreshToken) {
          await userClient.auth.setSession({
            access_token: state.auth.accessToken,
            refresh_token: state.auth.refreshToken
          });
        }
        await userClient.auth.updateUser({
          data: { speakly_prefs: null }
        });
        await userClient.auth.signOut();
      } catch (err) {
        console.warn('Error clearing Supabase cloud preferences:', err.message);
      }
    }

    // 2. Erase all local state & history from disk
    store.eraseAllUserData();
    broadcastState();
    return { ok: true };
  });

  ipcMain.handle('feedback:submit', (_event, payload) => submitFeedback(payload));

  ipcMain.handle('voxflow:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { ok: true };
  });

  ipcMain.handle('voxflow:request-mic-permission', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'denied' || status === 'restricted') {
        shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
        );
        return getPermissionsStatus();
      }
      await systemPreferences.askForMediaAccess('microphone');
    }
    const updated = getPermissionsStatus();
    broadcastState();
    return updated;
  });

  ipcMain.handle('voxflow:request-accessibility', () => {
    if (process.platform === 'darwin') {
      // Triggers macOS native prompt AND opens Accessibility pane if needed
      const trusted = systemPreferences.isTrustedAccessibilityClient(true);
      if (!trusted) {
        shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
        );
      } else if (hotkeyManager) {
        hotkeyManager.configure(store.getState().settings);
      }
    }
    const updated = getPermissionsStatus();
    broadcastState();
    return updated;
  });

  ipcMain.handle('voxflow:get-valid-token', async () => {
    return getValidAccessToken();
  });

  ipcMain.handle('voxflow:get-backend-url', () => {
    return getResolvedBackendUrl();
  });

  ipcMain.handle('voxflow:check-permissions', () => {
    if (hotkeyManager && hotkeyManager.canUseLowLevelHook()) {
      hotkeyManager.configure(store.getState().settings);
    }
    return buildPublicState();
  });

  // Pill or Dashboard interactive trigger controls
  ipcMain.on('voxflow:ui-toggle-recording', () => {
    if (currentRecordingState === 'recording') {
      if (hotkeyManager) hotkeyManager.notifyRecordingStoppedExternally();
      triggerStopRecording();
    } else if (currentRecordingState === 'processing') {
      triggerCancelRecording();
    } else if (currentRecordingState === 'idle') {
      triggerStartRecording({ source: 'pill-click' });
    }
  });

  ipcMain.on('voxflow:ui-cancel-recording', () => {
    triggerCancelRecording();
  });

  ipcMain.on('voxflow:open-dashboard', () => {
    showDashboard();
  });

  ipcMain.on('voxflow:audio-devices', (_event, devices) => {
    if (Array.isArray(devices) && devices.length > 0) {
      availableAudioDevices = devices;
      rebuildTrayMenu();
    }
  });

  // Receive recorded WAV buffer from Pill HUD
  ipcMain.on('voxflow:audio-captured', async (_event, payload) => {
    const { wavBytes, durationSeconds, rmsPeak } = payload || {};
    const state = store.getState();

    const finishIdle = (delayMs = 1300) => {
      if (processingWatchdog) {
        clearTimeout(processingWatchdog);
        processingWatchdog = null;
      }
      currentRecordingState = 'idle';
      updateTrayIcon(false);
      if (hotkeyManager) hotkeyManager.notifyRecordingStoppedExternally();
      rebuildTrayMenu();
      sendToDashboard('voxflow:recording-status', { state: 'idle' });

      // Always hide the pill completely once done so there is no bar lingering on the desktop!
      if (pillWindow && !pillWindow.isDestroyed()) {
        setTimeout(() => {
          if (currentRecordingState === 'idle') {
            pillWindow.hide();
          }
        }, delayMs);
      }
    };

    if (!wavBytes || wavBytes.byteLength < 1600 || durationSeconds < 0.25) {
      if (durationSeconds > 0.05) {
        sendToPill('voxflow:pill-toast', {
          kind: 'muted',
          title: 'Tip 💡',
          message: 'Hold hotkey while speaking'
        });
        finishIdle(900);
      } else {
        finishIdle(0);
      }
      return;
    }

    const sens = state.settings.micSensitivity || 'high';
    const rmsThreshold = sens === 'high' ? 0.00018 : sens === 'low' ? 0.0035 : 0.00075;

    if (typeof rmsPeak === 'number' && rmsPeak < rmsThreshold) {
      sendToPill('voxflow:pill-toast', {
        kind: 'muted',
        title: 'Mic Check 🎤',
        message: 'No speech heard'
      });
      finishIdle(1100);
      return;
    }

    try {
      const audioBuffer = Buffer.from(wavBytes);
      const activeMode = store.getActiveMode();
      const predictedLangs = store.getPredictedLanguages();

      const token = await getValidAccessToken();

      const { rawText, finalText, usage: returnedUsage } = await transcribeAudio({
        audioBuffer,
        mimeType: 'audio/wav',
        settings: state.settings,
        dictionary: state.dictionary,
        learnedCorrections: state.learnedCorrections || [],
        mode: activeMode,
        activeContext: lastActiveAppContext,
        screenContext:
          state.settings.useScreenContext !== false && !lastScreenContext.isSecureField
            ? lastScreenContext
            : null,
        predictedLanguages: predictedLangs,
        authToken: token
      });

      if (!finalText) {
        sendToPill('voxflow:pill-toast', {
          kind: 'muted',
          title: 'Mic Check 🎤',
          message: 'No speech detected'
        });
        finishIdle(1100);
        return;
      }

      const pasteResult = await pasteAtCursor(finalText, {
        preserveClipboard: state.settings.preserveClipboard
      });

      const { entry } = store.recordSession({
        rawText,
        finalText,
        durationSeconds,
        modeName: activeMode.name,
        provider: state.settings.provider
      });

      // Broadcast latest usage to dashboard if returned by cloud
      if (returnedUsage) {
        sendToDashboard('speakly:usage-updated', returnedUsage);
      }

      if (pasteResult.pasted) {
        sendToPill('voxflow:pill-toast', {
          kind: 'success',
          title: 'Pasted! ✨',
          message: `Pasted ${entry.wordCount} ${entry.wordCount === 1 ? 'word' : 'words'}`
        });
        schedulePostPasteLearningWatch({ pastedText: finalText, historyId: entry.id });
      } else if (pasteResult.reason === 'accessibility_missing') {
        sendToPill('voxflow:pill-toast', {
          kind: 'warning',
          title: 'Copied 📋',
          message: 'Enable Accessibility to auto-paste'
        });
      } else {
        sendToPill('voxflow:pill-toast', {
          kind: 'success',
          title: 'Copied! 📋',
          message: 'Copied to clipboard (Cmd/Ctrl+V)'
        });
      }

      broadcastState();
      finishIdle(1400);
    } catch (err) {
      console.error('Transcription pipeline error:', err);
      const isQuota = Boolean(err.quotaExceeded || (err.message && err.message.includes('quota reached')));

      if (isQuota) {
        sendToPill('voxflow:pill-toast', {
          kind: 'quota',
          title: 'Limit Reached 🦆',
          message: 'Monthly cap reached (3,000 words). Upgrade to Pro for unlimited dictation.'
        });
        sendToDashboard('speakly:quota-exceeded', {
          title: 'Monthly Cap Reached',
          message: err.message || 'You have reached the free 3,000 words cap this month.',
          limit: err.quotaDetails?.limit || 3000,
          current: err.quotaDetails?.current || 3000
        });
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.show();
          dashboardWindow.focus();
        }
      } else {
        sendToPill('voxflow:pill-toast', {
          kind: 'error',
          title: 'Oops! ⚠️',
          message: (err && err.message ? err.message : 'Transcription error').slice(0, 56)
        });
        sendToDashboard('voxflow:error', {
          message: err && err.message ? err.message : 'Transcription failed.'
        });
      }
      finishIdle(2400);
    }
  });

  ipcMain.on('voxflow:capture-error', (_event, message) => {
    currentRecordingState = 'idle';
    updateTrayIcon(false);
    if (hotkeyManager) hotkeyManager.notifyRecordingStoppedExternally();
    rebuildTrayMenu();
    sendToPill('voxflow:pill-toast', {
      kind: 'error',
      title: 'Mic Error ⚠️',
      message: String(message || 'Microphone unavailable').slice(0, 52)
    });
    sendToDashboard('voxflow:error', {
      message: String(message || 'Microphone access failed.')
    });
  });
}

app.whenReady().then(() => {
  store.init();

  // Auto-approve microphone media requests for our trusted local file:// pages
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
      return true;
    }
    return false;
  });

  const iconPath = ensureAppIconAsset();
  if (process.platform === 'darwin' && app.dock && iconPath) {
    try {
      app.dock.setIcon(iconPath);
    } catch {
      // ignore
    }
  }

  hotkeyManager = new HotkeyManager({
    onStartRecording: (meta) => triggerStartRecording(meta),
    onStopRecording: () => triggerStopRecording(),
    onCancelRecording: () => triggerCancelRecording()
  });

  registerIpcHandlers();
  createTray();
  createPillWindow();
  createDashboardWindow(iconPath);

  hotkeyManager.configure(store.getState().settings);

  // Global shortcuts matching Wispr Flow: Paste Last Transcript (^⌥V) & Talk to Support (⌘/)
  try {
    globalShortcut.register('Control+Alt+V', () => {
      pasteLastTranscript();
    });
  } catch (err) {
    console.warn('Could not register Control+Alt+V shortcut:', err.message);
  }

  try {
    globalShortcut.register('CommandOrControl+/', () => {
      openSupportFromTray();
    });
  } catch (err) {
    console.warn('Could not register CommandOrControl+/ shortcut:', err.message);
  }

  if (process.platform === 'darwin') {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      // Trigger macOS native prompt so user can enable Accessibility in System Settings
      setTimeout(() => {
        try {
          systemPreferences.isTrustedAccessibilityClient(true);
        } catch {}
      }, 1000);
    }
  }

  try {
    const s = store.getState().settings;
    if (s && s.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true });
    }
  } catch {}

  // Keep Render cloud backend awake and eliminate cold starts (pings every 9 minutes)
  const warmUpBackend = () => {
    try {
      const url = getResolvedBackendUrl();
      fetch(`${url}/health`).catch(() => {});
    } catch {}
  };
  warmUpBackend();
  setInterval(warmUpBackend, 9 * 60 * 1000);

  app.on('activate', () => {
    showDashboard();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (hotkeyManager) {
    hotkeyManager.destroy();
  }
});

app.on('window-all-closed', () => {
  // Keep background dictation alive in Tray on both macOS and Windows unless quitting
  if (isQuitting) {
    app.quit();
  }
});
