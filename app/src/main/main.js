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
  session
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

const SUPABASE_URL = 'https://lwiznvgeemrkrildyyvw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aXpudmdlZW1ya3JpbGR5eXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODIyNzksImV4cCI6MjEwODg1ODI3OX0.eeh3Yp-ZkDKbZ-WyeZJ7ZtLXc86TeqbezFFp2QEhQo4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

function rebuildTrayMenu() {
  if (!tray) return;
  const state = store.getState();
  const modes = store.getAllModes();
  const hotkeyLabel = getHotkeyDisplayLabel(state.settings);

  const modeItems = modes.map((m) => ({
    label: m.name,
    type: 'radio',
    checked: state.settings.activeModeId === m.id,
    click: () => {
      store.updateSettings({ activeModeId: m.id });
      broadcastState();
    }
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: `Speakly — ${currentRecordingState === 'recording' ? 'Listening…' : 'Ready'}`,
      enabled: false
    },
    {
      label: `Trigger: ${hotkeyLabel}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: currentRecordingState === 'recording' ? 'Stop & Transcribe' : 'Start Dictation Now',
      click: () => {
        if (currentRecordingState === 'recording') {
          triggerStopRecording();
        } else {
          triggerStartRecording({ source: 'tray' });
        }
      }
    },
    {
      label: 'AI Formatting Mode',
      submenu: modeItems
    },
    {
      label: '🔒 100% Local Offline Mode',
      type: 'checkbox',
      checked: state.settings.provider === 'local',
      click: (menuItem) => {
        store.updateSettings({ provider: menuItem.checked ? 'local' : 'groq' });
        broadcastState();
      }
    },
    { type: 'separator' },
    {
      label: 'Open Speakly Control Center',
      click: () => showDashboard()
    },
    {
      label: 'Send Feedback…',
      click: () => openFeedbackFromTray()
    },
    { type: 'separator' },
    {
      label: 'Quit Speakly',
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

function captureActiveAppContext() {
  if (process.platform === 'darwin') {
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
  }
}

function triggerStartRecording({ source = 'hotkey' } = {}) {
  if (currentRecordingState !== 'idle') return;

  // Gate check on macOS: if Accessibility is not trusted, warn user and open setup dashboard
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
    showDashboard();
    sendToPill('voxflow:pill-toast', {
      kind: 'warning',
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
    modeBadge: store.getActiveMode().badge,
    triggerMode: state.settings.triggerMode
  });

  // Asynchronously capture active app & window title while user speaks (0ms latency overhead)
  captureActiveAppContext();

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
    dictionary: state.dictionary
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

function applyCloudPreferences(user) {
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

  // Populate First Name & Last Name from cloudPrefs or OAuth metadata if not already set
  if (cloudPrefs.userFirstName) {
    patch.userFirstName = cloudPrefs.userFirstName;
  } else if (!curSettings.userFirstName && (meta.given_name || meta.full_name || meta.name)) {
    const parts = String(meta.full_name || meta.name || '').trim().split(/\s+/);
    patch.userFirstName = meta.given_name || parts[0] || '';
    if (!curSettings.userLastName) {
      patch.userLastName = meta.family_name || parts.slice(1).join(' ') || '';
    }
  }
  if (cloudPrefs.userLastName) {
    patch.userLastName = cloudPrefs.userLastName;
  }

  if (Object.keys(patch).length > 0) {
    store.updateSettings(patch);
    if (hotkeyManager) hotkeyManager.configure(store.getState().settings);
  }
  if (Array.isArray(cloudPrefs.dictionary) && cloudPrefs.dictionary.length > 0) {
    store.setDictionary(cloudPrefs.dictionary);
  }
  if (meta.speakly_subscription) {
    store.setSubscription(meta.speakly_subscription);
  }
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
              store.setAuth({
                user: { id: data.user?.id, email: data.user?.email },
                accessToken: data.session?.access_token || '',
                refreshToken: data.session?.refresh_token || ''
              });
              applyCloudPreferences(data.user);
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

                store.setAuth({
                  user: { id: userData.user?.id, email: userData.user?.email },
                  accessToken,
                  refreshToken: refreshToken || ''
                });

                applyCloudPreferences(userData.user);
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
      dictionary: state.dictionary
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

    store.setAuth({
      user: { id: user?.id, email: user?.email },
      accessToken: sessionData?.access_token || '',
      refreshToken: sessionData?.refresh_token || ''
    });

    applyCloudPreferences(user);

    broadcastState();
    return buildPublicState();
  });

  ipcMain.handle('voxflow:auth-logout', () => {
    store.setAuth({ user: null, accessToken: '', refreshToken: '' });
    store.setSubscription({ plan: 'free', status: 'trial', customerPortalUrl: '', renewsAt: null });
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
        const backendUrl = (process.env.SPEAKLY_BACKEND_URL || (app.isPackaged || process.env.NODE_ENV !== 'development' ? 'https://speakly-backend.onrender.com' : 'http://localhost:8787')).replace(/\/+$/, '');
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
        const backendUrl = (process.env.SPEAKLY_BACKEND_URL || (app.isPackaged || process.env.NODE_ENV !== 'development' ? 'https://speakly-backend.onrender.com' : 'http://localhost:8787')).replace(/\/+$/, '');
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
        message: 'No speech heard'
      });
      finishIdle(1100);
      return;
    }

    try {
      const audioBuffer = Buffer.from(wavBytes);
      const activeMode = store.getActiveMode();

      const { rawText, finalText } = await transcribeAudio({
        audioBuffer,
        mimeType: 'audio/wav',
        settings: state.settings,
        dictionary: state.dictionary,
        mode: activeMode,
        activeContext: lastActiveAppContext,
        authToken: state.auth?.accessToken || ''
      });

      if (!finalText) {
        sendToPill('voxflow:pill-toast', {
          kind: 'muted',
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

      if (pasteResult.pasted) {
        sendToPill('voxflow:pill-toast', {
          kind: 'success',
          message: `Pasted ${entry.wordCount} ${entry.wordCount === 1 ? 'word' : 'words'}`
        });
      } else if (pasteResult.reason === 'accessibility_missing') {
        sendToPill('voxflow:pill-toast', {
          kind: 'warning',
          message: 'Copied! Enable Accessibility to auto-paste'
        });
      } else {
        sendToPill('voxflow:pill-toast', {
          kind: 'success',
          message: 'Copied to clipboard (Cmd/Ctrl+V)'
        });
      }

      broadcastState();
      finishIdle(1400);
    } catch (err) {
      console.error('Transcription pipeline error:', err);
      sendToPill('voxflow:pill-toast', {
        kind: 'error',
        message: (err && err.message ? err.message : 'Transcription error').slice(0, 56)
      });
      sendToDashboard('voxflow:error', {
        message: err && err.message ? err.message : 'Transcription failed.'
      });
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
