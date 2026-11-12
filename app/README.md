# VoxFlow — Cross-Platform AI Voice-to-Text (macOS & Windows)

VoxFlow is a commercial-ready desktop voice-to-text application built with Electron for **macOS (`x64` & Apple Silicon `arm64`)** and **Windows (`x64`)**.

## Key Features
- **Floating Always-On-Top Pill HUD**: Non-focusable floating capsule (`pill.html`) with live 60fps microphone waveform visualization that never steals cursor focus from your active app.
- **Universal Auto-Paste + Clipboard Preservation**: Pastes cleanly at your cursor in any Mac or Windows app (`Cmd+V` / `Ctrl+V`) and automatically restores your previous clipboard contents afterward.
- **Hold-to-Talk & Hands-Free Toggle**: Supports single-key push-to-talk (e.g., `Right ⌘ Command` on Mac, `Right Ctrl` on Windows) via `uiohook-napi` as well as global toggle shortcuts (`⌘/Ctrl + Shift + Space`).
- **AI Formatting Modes**: Built-in **Smart Polish** (removes filler words & self-corrections), **Fast Verbatim**, **Professional Email**, **Actionable Notes**, **AI Prompt / Dev**, plus **Custom AI Modes** for niche verticals.
- **Dual Cloud Engine**: Supports **OpenAI** (`whisper-1` + `gpt-4o-mini`) and **Groq Cloud** (`whisper-large-v3-turbo` + `llama-3.3-70b-versatile`).
- **Personal Dictionary**: Custom vocabulary injected into both Whisper acoustic prompting and LLM post-processing.

## Running Locally
```bash
cd ~/Documents/voice/app
npm start
```
Or double-click **`Start VoxFlow.command`** (macOS) / **`Start VoxFlow.bat`** (Windows) directly from Finder or File Explorer.

## Packaging Installers for Customers
- **macOS `.dmg` Installer (`dist/VoxFlow-1.0.0.dmg`)**:
  ```bash
  npm run dist:mac
  ```
- **Windows `.exe` Installer & Portable App (`dist/VoxFlow Setup 1.0.0.exe`)**:
  ```bash
  npm run dist:win
  ```
