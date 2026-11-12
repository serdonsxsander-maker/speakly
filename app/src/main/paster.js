const fs = require('fs');
const path = require('path');
const { clipboard, systemPreferences, shell } = require('electron');
const { execFile } = require('child_process');

let uiohookModule = null;
try {
  uiohookModule = require('uiohook-napi');
} catch {
  uiohookModule = null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotClipboard() {
  try {
    const formats = clipboard.availableFormats();
    return {
      formats,
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF(),
      image: formats.some((f) => f.startsWith('image/')) ? clipboard.readImage() : null
    };
  } catch {
    return null;
  }
}

function restoreClipboard(snapshot) {
  if (!snapshot) return;
  try {
    const data = {};
    if (snapshot.text) data.text = snapshot.text;
    if (snapshot.html) data.html = snapshot.html;
    if (snapshot.rtf) data.rtf = snapshot.rtf;
    if (snapshot.image && !snapshot.image.isEmpty()) {
      data.image = snapshot.image;
    }
    if (Object.keys(data).length > 0) {
      clipboard.write(data);
    } else {
      clipboard.clear();
    }
  } catch {
    // Non-fatal
  }
}

function sendWinPasteFallback() {
  return new Promise((resolve) => {
    // 1. Ultra-fast Windows WScript.Shell SendKeys via mshta (10ms, instant native Windows keystroke)
    execFile(
      'mshta',
      ['vbscript:Execute("Set w=CreateObject(""WScript.Shell""):w.SendKeys ""^v"":close()")'],
      { timeout: 1500 },
      (err) => {
        if (!err) {
          resolve(true);
          return;
        }
        // 2. PowerShell fallback
        const psCommand =
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psCommand],
          { windowsHide: true, timeout: 3000 },
          (psErr) => {
            resolve(!psErr);
          }
        );
      }
    );
  });
}

function sendMacPasteFallback() {
  return new Promise((resolve) => {
    // 1. Primary macOS method: AppleScript System Events keystroke
    // This tells macOS WindowServer to deliver Cmd+V directly to whichever application
    // and text cursor currently holds active focus (Google Chrome, Antigravity, Notes, etc.)
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      { timeout: 2000 },
      (osaErr) => {
        if (!osaErr) {
          resolve(true);
          return;
        }

        // 2. Fallback to keymonitor if osascript failed
        const candidates = [
          path.join(__dirname, '..', '..', 'assets', 'keymonitor').replace('app.asar', 'app.asar.unpacked'),
          path.join(__dirname, '..', '..', 'assets', 'keymonitor'),
          path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'keymonitor')
        ];
        const binPath = candidates.find((p) => {
          try {
            return fs.existsSync(p);
          } catch {
            return false;
          }
        });

        if (binPath) {
          execFile(binPath, ['--paste'], { timeout: 1500 }, (kErr) => {
            resolve(!kErr);
          });
          return;
        }

        resolve(false);
      }
    );
  });
}

/**
 * Copies text to clipboard, triggers Cmd+V (macOS) or Ctrl+V (Windows) into the active cursor,
 * and optionally restores the user's previous clipboard contents after a safe delay.
 */
async function pasteAtCursor(text, { preserveClipboard = false } = {}) {
  if (!text) return { pasted: false, reason: 'empty' };

  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const prevClipboard = preserveClipboard ? snapshotClipboard() : null;

  // 1. Write formatted speech text to system clipboard
  clipboard.writeText(text);

  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    try {
      systemPreferences.isTrustedAccessibilityClient(true);
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    } catch {}
    return {
      pasted: false,
      copiedFallback: true,
      reason: 'accessibility_missing'
    };
  }
  
  // 2. Allow OS pasteboard to synchronize across apps
  await sleep(70);

  let simulatedOk = false;

  if (isMac) {
    simulatedOk = await sendMacPasteFallback();
    if (!simulatedOk && uiohookModule && uiohookModule.uIOhook && uiohookModule.UiohookKey) {
      try {
        const { uIOhook, UiohookKey } = uiohookModule;
        uIOhook.keyTap(UiohookKey.V, [UiohookKey.Meta]);
        simulatedOk = true;
      } catch {
        simulatedOk = false;
      }
    }
  } else {
    // Windows / Linux path
    if (uiohookModule && uiohookModule.uIOhook && uiohookModule.UiohookKey) {
      try {
        const { uIOhook, UiohookKey } = uiohookModule;
        uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]);
        simulatedOk = true;
      } catch {
        simulatedOk = false;
      }
    }
    if (!simulatedOk && isWin) {
      try {
        await sendWinPasteFallback();
        simulatedOk = true;
      } catch {
        simulatedOk = false;
      }
    }
  }

  // 3. If preserveClipboard was explicitly enabled by the user:
  // NEVER restore in 220ms! In modern multi-tab browsers (Chrome, Arc, Brave) and Electron
  // apps (Cursor, Slack, VS Code), reading NSPasteboard after Cmd+V takes 250-400ms.
  // Overwriting after 220ms causes the target app to paste old text or nothing.
  // We schedule restoration with a generous 3.0 second background timer so it never blocks
  // or races with the target application, and leaves transcribed text ready on the clipboard.
  if (preserveClipboard && prevClipboard && simulatedOk) {
    setTimeout(() => {
      try {
        restoreClipboard(prevClipboard);
      } catch {
        // Non-fatal
      }
    }, 3000);
  }

  return {
    pasted: simulatedOk,
    copiedFallback: !simulatedOk
  };
}

module.exports = {
  pasteAtCursor
};
