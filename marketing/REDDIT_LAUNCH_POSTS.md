# Speakly Reddit Launch Playbook
*Authentic founder stories crafted for developer and Mac communities. Post these after your website and backend are live.*

---

## 📱 Subreddit 1: r/macapps
**Target:** Mac power users, indie software enthusiasts.
**Title:** I built an indie Mac dictation app using Groq LPUs (~290ms latency) because Wispr Flow was too slow and expensive.
**Flair:** `Developer` or `Self-Promo Saturday`

**Body:**
> Hey r/macapps,
>
> I'm a solo developer based in Belgium. Over the last few months, I got hooked on dictating code prompts instead of typing everything out by hand. But the existing tools frustrated me:
> - Wispr Flow / Mac Whisper either had a 2-second lag or charged heavy recurring pricing.
> - Apple's built-in dictation still garbles punctuation and technical jargon.
>
> So I built **Speakly** (with a little rubber duck companion in the menu bar).
>
> **How it works technically:**
> - Global push-to-talk hotkey (hold Right-Option or Right-Command).
> - Streams 16kHz mono audio directly into Groq LPUs running Whisper-large-v3 (~290ms response time).
> - Runs a fast Llama-3.3 cleanup pass to strip filler words ("umms", accidental repetitions, self-corrections like "at 2pm wait no 3:30pm") and format technical terms before auto-pasting at your cursor.
> - Floating HUD pill stays out of your way and never steals window focus.
> - Ephemeral memory: Zero audio bytes or transcripts are stored on disk or server.
>
> We just opened Early Access today. I built universal Mac DMGs (Apple Silicon M1–M4 & Intel):
> [Download & Setup Guide (106 MB)](https://speakly-website.onrender.com)
>
> Because we are early access, it's ad-hoc signed (we include a 5-second "Open Anyway" guide for macOS 15 Sequoia).
>
> There's a "Send Feedback" button built directly into the tray settings. Would love your brutal thoughts on the hotkey feel and latency!

---

## 💻 Subreddit 2: r/cursor
**Target:** Developers using Cursor IDE, Claude Code, and vibe-coding tools.
**Title:** I got tired of typing 4-paragraph prompts in Cursor, so I built a 290ms push-to-talk dictation app for devs.
**Flair:** `Discussion` or `Resource`

**Body:**
> Hey Cursor community,
>
> Like many of you, my Cursor workflow shifted from typing code to writing detailed context prompts and architectural instructions. Typing out 300 words explaining a refactor to Claude 3.5 Sonnet takes 3 minutes; speaking it takes 25 seconds.
>
> The problem was standard speech-to-text outputs messy spoken prose with "umms", sentence fragments, and wrong syntax casing.
>
> I built **Speakly** specifically for this:
> 1. You hold Right-Option while looking at your code.
> 2. You speak naturally: *"add a post request handler here to update user profile and make sure to validate the bearer token wait actually use supabase auth check"*.
> 3. Groq's LPUs transcribe in ~290ms, format the instruction cleanly, resolve your mid-sentence correction, and paste it directly into Cursor's `Cmd+K` or `Cmd+I` prompt box.
>
> It runs as a lightweight native desktop app on Mac and Windows.
>
> If you want to test it out during our Early Access phase:
> [Speakly Early Access](https://speakly-website.onrender.com)
>
> Let me know if there are specific developer modes or prompt formats you'd like added to the engine!

---

## 🛠️ Subreddit 3: r/SideProject
**Target:** Indie builders, solopreneurs.
**Title:** Solo founder from Belgium: Launched early access for Speakly, an AI voice dictation desktop app built on Groq LPUs.
**Flair:** `Feedback`

**Body:**
> Hi r/SideProject,
>
> I wanted to share the project I've been working on as a solo founder in Belgium: **Speakly**.
>
> It's a cross-platform desktop utility (Electron + native hotkeys + Groq LPU backend) designed to make voice-to-text feel instant instead of like waiting for an API roundtrip.
>
> **The Tech & Business Model:**
> - **Inference:** Groq LPUs running Whisper-large-v3 and Llama-3.3-70b (~290ms latency). Because Groq is ~$0.04/audio hour, our margins stay healthy without charging enterprise prices.
> - **Privacy:** Zero retention. Audio is held ephemerally in RAM during the 300ms stream, never saved to disk or database.
> - **Affiliate Loop:** We built recurring commission tracking directly into the app (creators get 35% recurring revenue share on paid users).
>
> Download links and setup guides for Mac & Windows are live:
> [Speakly Early Access](https://speakly-website.onrender.com)
>
> Would appreciate any feedback on the onboarding flow and landing page!
