const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { globalShortcut, systemPreferences } = require('electron');

let uiohookModule = null;
try {
  uiohookModule = require('uiohook-napi');
} catch {
  uiohookModule = null;
}

const HOLD_KEY_MAP = {
  right_cmd: {
    code: uiohookModule ? uiohookModule.UiohookKey.MetaRight : 3676,
    macLabel: 'Right ⌘ Command',
    winLabel: 'Right ⊞ Win'
  },
  left_cmd: {
    code: uiohookModule ? uiohookModule.UiohookKey.Meta : 3675,
    macLabel: 'Left ⌘ Command',
    winLabel: 'Left ⊞ Win'
  },
  right_alt: {
    code: uiohookModule ? uiohookModule.UiohookKey.AltRight : 3640,
    macLabel: 'Right ⌥ Option',
    winLabel: 'Right Alt'
  },
  left_alt: {
    code: uiohookModule ? uiohookModule.UiohookKey.Alt : 56,
    macLabel: 'Left ⌥ Option',
    winLabel: 'Left Alt'
  },
  right_ctrl: {
    code: uiohookModule ? uiohookModule.UiohookKey.CtrlRight : 3613,
    macLabel: 'Right ⌃ Control',
    winLabel: 'Right Ctrl'
  },
  left_ctrl: {
    code: uiohookModule ? uiohookModule.UiohookKey.Ctrl : 29,
    macLabel: 'Left ⌃ Control',
    winLabel: 'Left Ctrl'
  },
  right_shift: {
    code: uiohookModule ? uiohookModule.UiohookKey.ShiftRight : 54,
    macLabel: 'Right ⇧ Shift',
    winLabel: 'Right Shift'
  },
  left_shift: {
    code: uiohookModule ? uiohookModule.UiohookKey.Shift : 42,
    macLabel: 'Left ⇧ Shift',
    winLabel: 'Left Shift'
  },
  f5: {
    code: uiohookModule ? uiohookModule.UiohookKey.F5 : 63,
    macLabel: 'F5',
    winLabel: 'F5'
  },
  f6: {
    code: uiohookModule ? uiohookModule.UiohookKey.F6 : 64,
    macLabel: 'F6',
    winLabel: 'F6'
  },
  f7: {
    code: uiohookModule ? uiohookModule.UiohookKey.F7 : 65,
    macLabel: 'F7',
    winLabel: 'F7'
  },
  f8: {
    code: uiohookModule ? uiohookModule.UiohookKey.F8 : 66,
    macLabel: 'F8',
    winLabel: 'F8'
  },
  f9: {
    code: uiohookModule ? uiohookModule.UiohookKey.F9 : 67,
    macLabel: 'F9',
    winLabel: 'F9'
  },
  f10: {
    code: uiohookModule ? uiohookModule.UiohookKey.F10 : 68,
    macLabel: 'F10',
    winLabel: 'F10'
  },
  f11: {
    code: uiohookModule ? uiohookModule.UiohookKey.F11 : 87,
    macLabel: 'F11',
    winLabel: 'F11'
  },
  f12: {
    code: uiohookModule ? uiohookModule.UiohookKey.F12 : 88,
    macLabel: 'F12',
    winLabel: 'F12'
  }
};

function resolveMacKeyMonitorPath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'keymonitor').replace('app.asar', 'app.asar.unpacked'),
    path.join(__dirname, '..', '..', 'assets', 'keymonitor'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'keymonitor')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

class HotkeyManager {
  constructor({ onStartRecording, onStopRecording, onCancelRecording }) {
    this.onStartRecording = onStartRecording;
    this.onStopRecording = onStopRecording;
    this.onCancelRecording = onCancelRecording;

    this._hookStarted = false;
    this._hookListenersBound = false;
    this._macMonitorProc = null;
    this._isHoldActive = false;
    this._otherKeyPressedDuringHold = false;
    this._holdTimer = null;
    this._settings = null;
    this._isToggleRecording = false;
    this._permissionWatcher = null;
  }

  getHoldKeyOptions() {
    const isMac = process.platform === 'darwin';
    return Object.entries(HOLD_KEY_MAP).map(([id, info]) => ({
      id,
      label: isMac ? info.macLabel : info.winLabel
    }));
  }

  canUseLowLevelHook() {
    if (process.platform === 'darwin') {
      // On macOS, our native CoreGraphics keymonitor works immediately without TCC signature lockouts!
      if (resolveMacKeyMonitorPath()) return true;
      return Boolean(uiohookModule && systemPreferences.isTrustedAccessibilityClient(false));
    }
    return Boolean(uiohookModule);
  }

  configure(settings) {
    this._settings = settings;
    globalShortcut.unregisterAll();

    // Always register the toggle shortcut as either primary (toggle mode) or backup shortcut!
    const accel = settings.toggleAccelerator || 'CommandOrControl+Shift+Space';
    try {
      globalShortcut.register(accel, () => {
        if (this._isToggleRecording) {
          this._isToggleRecording = false;
          this.onStopRecording({ source: 'toggle' });
        } else {
          this._isToggleRecording = true;
          this.onStartRecording({ source: 'toggle' });
        }
      });
    } catch (err) {
      console.warn('Could not register toggle shortcut:', accel, err.message);
    }

    // Always ensure the low-level key monitor is running so both 'hold' and single-key 'toggle' work!
    this._ensureHookRunning();
  }

  notifyRecordingStoppedExternally() {
    this._isToggleRecording = false;
    this._isHoldActive = false;
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  _handleKeyDownName(keyName) {
    if (!this._settings) return;

    if (keyName === 'escape' && (this._isHoldActive || this._isToggleRecording)) {
      this._isHoldActive = false;
      this._isToggleRecording = false;
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
        this._holdTimer = null;
      }
      this.onCancelRecording();
      return;
    }

    // If user selected "Press to Toggle (Hands-Free)" mode, pressing their chosen key toggles start/stop!
    if (this._settings.triggerMode === 'toggle') {
      if (keyName === this._settings.holdKey) {
        if (this._isToggleRecording) {
          this._isToggleRecording = false;
          this.onStopRecording({ source: 'toggle' });
        } else {
          this._isToggleRecording = true;
          this.onStartRecording({ source: 'toggle' });
        }
      }
      return;
    }

    if (this._settings.triggerMode !== 'hold') return;

    if (keyName === this._settings.holdKey) {
      if (this._isHoldActive) return;
      this._otherKeyPressedDuringHold = false;
      this._isHoldActive = true;
      // 0ms immediate trigger (just like voicetyper.py) so there is zero delay!
      this.onStartRecording({ source: 'hold' });
    } else {
      // User pressed another key (e.g. Right Cmd + V or Right Alt + Tab) -> cancel hold trigger!
      if (this._isHoldActive) {
        this._isHoldActive = false;
        this.onCancelRecording();
      }
    }
  }

  _handleKeyUpName(keyName) {
    if (!this._settings || this._settings.triggerMode !== 'hold') return;
    if (keyName !== this._settings.holdKey) return;

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
      return;
    }

    if (this._isHoldActive) {
      this._isHoldActive = false;
      this.onStopRecording({ source: 'hold' });
    }
  }

  _ensureHookRunning() {
    if (process.platform === 'darwin') {
      const binPath = resolveMacKeyMonitorPath();
      if (binPath) {
        this._startMacKeyMonitor(binPath);
        return;
      }
    }

    if (!uiohookModule) return;

    if (!this.canUseLowLevelHook()) {
      if (!this._permissionWatcher && process.platform === 'darwin') {
        this._permissionWatcher = setInterval(() => {
          if (this.canUseLowLevelHook()) {
            clearInterval(this._permissionWatcher);
            this._permissionWatcher = null;
            this._startHook();
          }
        }, 2000);
      }
      return;
    }

    this._startHook();
  }

  _startMacKeyMonitor(binPath) {
    if (this._macMonitorProc) return;
    try {
      const proc = spawn(binPath, [], { stdio: ['ignore', 'pipe', 'ignore'] });
      this._macMonitorProc = proc;
      let buf = '';
      proc.stdout.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (line.startsWith('DOWN:')) {
            this._handleKeyDownName(line.slice(5));
          } else if (line.startsWith('UP:')) {
            this._handleKeyUpName(line.slice(3));
          }
        }
      });
      proc.on('exit', () => {
        this._macMonitorProc = null;
      });
    } catch (err) {
      console.error('Failed to start macOS keymonitor:', err);
    }
  }

  _startHook() {
    if (this._hookStarted || !uiohookModule) return;
    const { uIOhook, UiohookKey } = uiohookModule;

    if (!this._hookListenersBound) {
      this._hookListenersBound = true;

      uIOhook.on('keydown', (e) => {
        if (!this._settings) return;
        if (e.keycode === UiohookKey.Escape) {
          this._handleKeyDownName('escape');
          return;
        }
        const target = HOLD_KEY_MAP[this._settings.holdKey];
        if (target && e.keycode === target.code) {
          this._handleKeyDownName(this._settings.holdKey);
        } else {
          this._handleKeyDownName('other_key');
        }
      });

      uIOhook.on('keyup', (e) => {
        if (!this._settings) return;
        const target = HOLD_KEY_MAP[this._settings.holdKey];
        if (target && e.keycode === target.code) {
          this._handleKeyUpName(this._settings.holdKey);
        }
      });
    }

    try {
      uIOhook.start();
      this._hookStarted = true;
    } catch (err) {
      console.error('Failed to start uIOhook:', err);
    }
  }

  destroy() {
    if (this._permissionWatcher) {
      clearInterval(this._permissionWatcher);
      this._permissionWatcher = null;
    }
    if (this._macMonitorProc) {
      try {
        this._macMonitorProc.kill();
      } catch {}
      this._macMonitorProc = null;
    }
    try {
      globalShortcut.unregisterAll();
    } catch {}
    if (this._hookStarted && uiohookModule) {
      try {
        uiohookModule.uIOhook.stop();
      } catch {}
      this._hookStarted = false;
    }
  }
}

module.exports = {
  HotkeyManager,
  HOLD_KEY_MAP
};
