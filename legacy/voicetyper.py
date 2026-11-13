#!/usr/bin/env python3
"""
VoiceTyper — Hold a hotkey to record, release to transcribe & paste.

Usage:
    python voicetyper.py

Configuration via .env file (see .env.example).
Requires macOS Accessibility permissions for the terminal app running this script.
"""

import io
import os
import sys
import time
import wave
import struct
import threading
import subprocess
import tempfile

import numpy as np
import sounddevice as sd
from pynput import keyboard
from openai import OpenAI
from dotenv import load_dotenv

# ── Load configuration ──────────────────────────────────────────────────────

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
HOTKEY = os.getenv("HOTKEY", "right_cmd")  # See HOTKEY_MAP below
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", "16000"))
CHANNELS = 1
AUDIO_FEEDBACK = os.getenv("AUDIO_FEEDBACK", "true").lower() == "true"
TEXT_CLEANUP = os.getenv("TEXT_CLEANUP", "true").lower() == "true"
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-1")
LANGUAGE = os.getenv("LANGUAGE", "")  # e.g. "en", "nl", "" for auto-detect

# ── Hotkey mapping ──────────────────────────────────────────────────────────

HOTKEY_MAP = {
    # Special keys (pynput Key enum names)
    "right_cmd":    keyboard.Key.cmd_r,
    "left_cmd":     keyboard.Key.cmd_l,
    "right_alt":    keyboard.Key.alt_r,
    "left_alt":     keyboard.Key.alt_l,
    "right_ctrl":   keyboard.Key.ctrl_r,
    "left_ctrl":    keyboard.Key.ctrl_l,
    "right_shift":  keyboard.Key.shift_r,
    "left_shift":   keyboard.Key.shift_l,
    "fn":           keyboard.Key.f20,  # Fn alone is tricky on macOS; fallback
    "caps_lock":    keyboard.Key.caps_lock,
    "f5":           keyboard.Key.f5,
    "f6":           keyboard.Key.f6,
    "f7":           keyboard.Key.f7,
    "f8":           keyboard.Key.f8,
    "f9":           keyboard.Key.f9,
    "f10":          keyboard.Key.f10,
    "f11":          keyboard.Key.f11,
    "f12":          keyboard.Key.f12,
}

def resolve_hotkey(name: str):
    """Resolve a hotkey name to a pynput Key or KeyCode."""
    name_lower = name.lower().strip()
    if name_lower in HOTKEY_MAP:
        return HOTKEY_MAP[name_lower]
    # Single character key
    if len(name_lower) == 1:
        return keyboard.KeyCode.from_char(name_lower)
    raise ValueError(
        f"Unknown hotkey '{name}'. Valid options: {', '.join(HOTKEY_MAP.keys())} "
        f"or a single character like 'z'."
    )

TRIGGER_KEY = resolve_hotkey(HOTKEY)

# ── Terminal colours ────────────────────────────────────────────────────────

class C:
    """ANSI colour helpers."""
    RED    = "\033[91m"
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    DIM    = "\033[2m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"

def status(icon: str, msg: str, colour: str = C.CYAN):
    print(f"  {colour}{icon}  {msg}{C.RESET}")

# ── Audio feedback ──────────────────────────────────────────────────────────

def _beep(freq: float = 600, duration: float = 0.08, volume: float = 0.15):
    """Play a short sine-wave beep using sounddevice."""
    if not AUDIO_FEEDBACK:
        return
    try:
        t = np.linspace(0, duration, int(44100 * duration), endpoint=False)
        # Apply fade in/out to avoid clicks
        fade = int(44100 * 0.01)
        envelope = np.ones_like(t)
        envelope[:fade] = np.linspace(0, 1, fade)
        envelope[-fade:] = np.linspace(1, 0, fade)
        tone = (volume * np.sin(2 * np.pi * freq * t) * envelope).astype(np.float32)
        sd.play(tone, samplerate=44100, blocksize=1024)
        sd.wait()
    except Exception:
        pass  # Non-critical; silently skip

def beep_start():
    _beep(freq=800, duration=0.08)

def beep_stop():
    _beep(freq=600, duration=0.12)

# ── Audio recording ─────────────────────────────────────────────────────────

class Recorder:
    """Records audio from the default microphone while active."""

    def __init__(self):
        self._frames: list[np.ndarray] = []
        self._stream = None
        self._lock = threading.Lock()

    def start(self):
        with self._lock:
            self._frames = []
            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="int16",
                callback=self._callback,
            )
            self._stream.start()

    def _callback(self, indata, frames, time_info, status):
        self._frames.append(indata.copy())

    def stop(self) -> bytes:
        """Stop recording and return WAV bytes."""
        with self._lock:
            if self._stream is not None:
                self._stream.stop()
                self._stream.close()
                self._stream = None
            return self._frames_to_wav()

    def _frames_to_wav(self) -> bytes:
        if not self._frames:
            return b""
        audio = np.concatenate(self._frames, axis=0)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(audio.tobytes())
        return buf.getvalue()

# ── Transcription ───────────────────────────────────────────────────────────

client = None

def get_client() -> OpenAI:
    global client
    if client is None:
        if not OPENAI_API_KEY:
            print(f"\n  {C.RED}✗  OPENAI_API_KEY not set. Add it to your .env file.{C.RESET}")
            sys.exit(1)
        client = OpenAI(api_key=OPENAI_API_KEY)
    return client

def transcribe(wav_bytes: bytes) -> str:
    """Send WAV audio to OpenAI Whisper and return the transcription."""
    buf = io.BytesIO(wav_bytes)
    buf.name = "recording.wav"

    kwargs = {"model": WHISPER_MODEL, "file": buf, "response_format": "text"}
    if LANGUAGE:
        kwargs["language"] = LANGUAGE

    result = get_client().audio.transcriptions.create(**kwargs)
    return result.strip() if isinstance(result, str) else result.text.strip()

# ── Text cleanup ────────────────────────────────────────────────────────────

def cleanup_text(text: str) -> str:
    """Basic text cleanup: capitalize first letter, ensure trailing period."""
    if not text or not TEXT_CLEANUP:
        return text
    text = text.strip()
    # Capitalize first letter
    text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()
    # Add period at end if no punctuation present
    if text and text[-1] not in ".!?;:":
        text += "."
    return text

# ── Paste at cursor ─────────────────────────────────────────────────────────

def paste_text(text: str):
    """Copy text to clipboard and simulate Cmd+V to paste at cursor position."""
    # Use pbcopy (macOS) to set clipboard
    proc = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
    proc.communicate(text.encode("utf-8"))

    # Small delay to ensure clipboard is set
    time.sleep(0.05)

    # Simulate Cmd+V via pynput instead of osascript
    # This avoids annoying System Events automation permissions
    controller = keyboard.Controller()
    with controller.pressed(keyboard.Key.cmd):
        controller.press('v')
        controller.release('v')

# ── Main logic ──────────────────────────────────────────────────────────────

recorder = Recorder()
is_recording = False
recording_lock = threading.Lock()

def on_press(key):
    global is_recording
    if key != TRIGGER_KEY:
        return
    with recording_lock:
        if is_recording:
            return  # Already recording (key repeat)
        is_recording = True

    status("🎙", "Recording…", C.RED)
    beep_start()
    recorder.start()

def on_release(key):
    global is_recording
    if key != TRIGGER_KEY:
        return
    with recording_lock:
        if not is_recording:
            return
        is_recording = False

    wav_bytes = recorder.stop()
    beep_stop()

    if not wav_bytes or len(wav_bytes) < 1000:
        status("⚠", "Recording too short, skipped.", C.YELLOW)
        return

    # Transcribe in a thread so we don't block the listener
    threading.Thread(target=_process, args=(wav_bytes,), daemon=True).start()

def _process(wav_bytes: bytes):
    status("⏳", "Transcribing…", C.YELLOW)
    try:
        text = transcribe(wav_bytes)
        if not text:
            status("⚠", "No speech detected.", C.YELLOW)
            return
        text = cleanup_text(text)
        status("✓", f"{text}", C.GREEN)
        paste_text(text)
    except Exception as e:
        status("✗", f"Error: {e}", C.RED)

# ── Entry point ─────────────────────────────────────────────────────────────

def main():
    if not OPENAI_API_KEY:
        print(f"\n  {C.RED}✗  OPENAI_API_KEY is not set.{C.RESET}")
        print(f"  {C.DIM}   Create a .env file with: OPENAI_API_KEY=sk-...{C.RESET}\n")
        sys.exit(1)

    print()
    print(f"  {C.BOLD}{'─' * 44}{C.RESET}")
    print(f"  {C.BOLD}  🎤  VoiceTyper{C.RESET}")
    print(f"  {C.BOLD}{'─' * 44}{C.RESET}")
    print()
    print(f"  {C.DIM}Hotkey        :  {HOTKEY}  (hold to record){C.RESET}")
    print(f"  {C.DIM}Model         :  {WHISPER_MODEL}{C.RESET}")
    print(f"  {C.DIM}Language      :  {LANGUAGE or 'auto-detect'}{C.RESET}")
    print(f"  {C.DIM}Audio feedback:  {'on' if AUDIO_FEEDBACK else 'off'}{C.RESET}")
    print(f"  {C.DIM}Text cleanup  :  {'on' if TEXT_CLEANUP else 'off'}{C.RESET}")
    print()
    print(f"  {C.CYAN}Listening… Press Ctrl+C to quit.{C.RESET}")
    print()

    with keyboard.Listener(on_press=on_press, on_release=on_release) as listener:
        try:
            listener.join()
        except KeyboardInterrupt:
            print(f"\n  {C.DIM}Bye! 👋{C.RESET}\n")

if __name__ == "__main__":
    main()
