# Speakly: Project Memory & Technical Context

## Company & stage (updated 2026-11-12)
- Solo founder based in **Belgium** (EU VAT applies). Goal: get the **first users** while keeping upfront costs near zero.
- Stage: going **straight to Early Access** (no separate beta). Payments are **not live yet**. There is **no public website yet** (`website/` is a local draft).
- Strategy hub chat: "Early Access Playbook". Workstreams run in separate chats (see the playbook artifact).

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-12 | **No BYOK.** Speakly is a managed subscription only. Pricing TBD, likely similar to Wispr Flow. |
| 2026-11-12 | No "first 100 users" founding-member discount (it signals "unfinished"). |
| 2026-11-12 | Partner/affiliate commission: recurring % of **paid** revenue only, cancelled when the customer cancels. No free lifetime Pro; a free month or discount is OK. |
| 2026-11-12 | Users get one free month per referred paying friend (referral loop). |
| 2026-11-12 | Wedge audience: **developers / AI-coding users** (Cursor, Claude Code, Antigravity). Home market Belgium/NL (Dutch + French) as a second front. |
| 2026-11-12 | macOS: ship **ad-hoc signed** (free) builds for early access, with a clear "Open Anyway" guide. Buy the Apple Developer Program (`$99/yr`) once revenue allows. |
| 2026-11-12 | Onboarding order: account → billing (later) → permissions → first dictation. |
| 2026-11-12 | Security: removed the hardcoded Groq + OpenAI keys from the app. Old keys must be revoked. AI keys live only on the backend. |
| 2026-11-12 | Partner referral code field added to onboarding & settings signup; saved in Supabase `user_metadata.referral_code`. |
| 2026-11-12 | Website (`website/index.html` & `website/app.js`) updated: BYOK removed, direct downloads wired, OS auto-detection added. |
| 2026-11-12 | Landing page reworked for Early Access: dual prominent download buttons (Mac DMG & Windows Setup EXE) with OS auto-detection, all legacy BYOK/DuckyPro references stripped, pricing simplified to 100% Free during Early Access (no card required), tightened copy around Cursor/Claude/Terminal developer wedge, and added a 20-second visual first-launch guide for macOS Gatekeeper ("Open Anyway") and Windows Defender SmartScreen ("Run anyway") with a 1-click terminal CLI copy tool. |
| 2026-11-12 | Clean Windows installers built: `Speakly-Setup-1.0.0-win.exe` (89MB) and `Speakly-1.0.0-win-portable.exe` (81MB). |
| 2026-11-12 | Interactive Ad Review Dashboard created at `showcase/ad-review.html` with 5 strategic angles. |
| 2026-11-12 | Multi-Wedge Growth Strategy & Central Marketing Hub built at `marketing/index.html` with 22 curated targets, 1-click DM copy, interactive teleprompter, and 35% commission calculator. |
| 2026-11-12 | Launch Prioritization: Short-Form Video First (TikTok, YouTube Shorts, X) using the 5 multi-wedge video hooks and pre-rendered MP4 assets in `website/assets/videos/`. |
| 2026-11-12 | Affiliate Tracking Decision: Automated affiliate management via Lemon Squeezy / Stripe Connect once billing goes live; manual ref tracking in Supabase during early access. |
| 2026-11-12 | Backend hardened for Render: strictly requires authenticated Supabase users (guest AI access blocked to protect Groq tokens), active 45 req/min rate limiter, 5-minute keep-alive ping on `/health`. |
| 2026-11-12 | **Lemon Squeezy chosen as Merchant of Record (MoR)**: 0€/month, automatically collects and remits EU/Belgian VAT via OSS/MOSS. Wired native Lemon Squeezy checkout, Lemon.js overlay & affiliate tracking, recurring 30% partner commission on paid conversions, and Supabase subscription sync (`supabase/migrations/20261112170000_lemon_squeezy.sql`). |

## Brand Identity & Visual Language (LOCKED: Option 04 — LPU Cyber-Matrix)
- **Active Brand Kit**: Option 04 — LPU Cyber-Matrix
- **Palette**: Silicon Void (`#06080E`), Matrix Gold (`#FFD000`), LPU Electric Cyan (`#00F5D4` / `#38BDF8`), Pulse Orange (`#FF6B00`), Pasted Emerald (`#34D399`).
- **Mascot Rule (IMMUTABLE)**: The Rubber Ducky at the bottom of the screen (floating HUD pill) and in the menu bar / tray when holding the hotkey must NEVER be changed. It remains the beloved Rubber Ducky with its three animated states:
  1. Listening (with studio headphones)
  2. Thinking (squinted eye + thought bubbles)
  3. Solved / Pasted (happy anime eyes + rosy blush + golden sparkle).

## Architecture & Tech Stack
- **Desktop Client**: Electron (non-focus-stealing floating HUD pill `focusable: false` + Dashboard window). Builds: `app/` → `npm run dist:mac` / `dist:win` → `app/dist/`.
- **Audio Capture**: 16kHz mono PCM stream via `navigator.mediaDevices` with real-time `AnalyserNode` frequency feedback.
- **Inference Engine**: Primary Groq LPU (`whisper-large-v3-turbo` + `llama-3.3-70b-versatile`, median latency ~0.29s) with OpenAI Whisper fallback, **called from the backend only**.
- **Backend**: `backend/server.js` deployed live on Render at `https://speakly-backend-ie1b.onrender.com` (`app/src/main/transcribe.js`). Enforces Supabase JWT authentication, sliding-window rate limiting (45 req/min), 25MB body limit, and Groq LPU engine. 5-minute keep-alive ping running on `/health`.
- **Auto-Paste**: Native OS key simulation (`Cmd+V` / `Ctrl+V`) with automatic 600ms clipboard backup and restoration.
- **Cloud Sync**: Supabase (project `lwiznvgeemrkrildyyvw`) Auth and User Preferences sync for personal dictionary, hotkeys, and AI modes. Feedback goes into the `public.feedback` table (migration in `supabase/migrations/`).
