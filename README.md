# 🎤 VoiceTyper

A lightweight macOS voice-to-text tool. Hold a hotkey to record, release to transcribe via OpenAI Whisper, and the text is automatically pasted at your cursor.

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure your API key
cp .env.example .env
# Edit .env and add your OpenAI API key

# 3. Run
python voicetyper.py
```

## macOS Permissions

VoiceTyper needs two macOS permissions:

1. **Accessibility** — for keyboard listening and simulating paste  
   → System Settings → Privacy & Security → Accessibility → add your terminal app

2. **Microphone** — for audio recording  
   → System Settings → Privacy & Security → Microphone → add your terminal app

## Configuration

All settings are in the `.env` file:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Your OpenAI API key (required) |
| `HOTKEY` | `right_cmd` | Key to hold for recording |
| `WHISPER_MODEL` | `whisper-1` | OpenAI Whisper model |
| `LANGUAGE` | *(auto)* | Language code (`en`, `nl`, etc.) |
| `SAMPLE_RATE` | `16000` | Audio sample rate in Hz |
| `AUDIO_FEEDBACK` | `true` | Play beep on record start/stop |
| `TEXT_CLEANUP` | `true` | Capitalize + add period |

### Available hotkeys

| Key name | Description |
|---|---|
| `right_cmd` | Right ⌘ key |
| `left_cmd` | Left ⌘ key |
| `right_alt` | Right ⌥ key |
| `left_alt` | Left ⌥ key |
| `right_ctrl` | Right ⌃ key |
| `left_ctrl` | Left ⌃ key |
| `right_shift` | Right ⇧ key |
| `left_shift` | Left ⇧ key |
| `f5` – `f12` | Function keys |
| Single char | e.g. `z` |

## Usage

```
$ python voicetyper.py

  ──────────────────────────────────────────────
    🎤  VoiceTyper
  ──────────────────────────────────────────────

  Hotkey        :  right_cmd  (hold to record)
  Model         :  whisper-1
  Language      :  auto-detect
  Audio feedback:  on
  Text cleanup  :  on

  Listening… Press Ctrl+C to quit.

  🎙  Recording…
  ⏳  Transcribing…
  ✓  Hello, this is a test.
```

## How it works

1. You hold the hotkey → audio recording starts
2. You release the hotkey → recording stops, audio is sent to OpenAI Whisper API
3. The transcribed text is copied to your clipboard and pasted via `Cmd+V` at your cursor

## Tips

- **Right Command key** is the default hotkey — it's easy to reach and rarely conflicts with shortcuts
- Set `LANGUAGE` in `.env` if you always speak the same language (improves accuracy)
- The script prints each transcription to the terminal for reference
