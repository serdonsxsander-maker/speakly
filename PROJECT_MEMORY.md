# Speakly: Project Memory & Technical Context

## Quick Directory Map (Wegwijzer voor AI & Developer)
> Gebruik dit overzicht om direct de juiste map en bestanden te vinden. Zware build-outputs, binaries, media (`*.mp4`, `*.dmg`, `*.exe`), legacy-code en grote lead-JSON-dumps staan in `.ignore` zodat zoeken snel blijft terwijl alle bestanden lokaal behouden blijven.

- **Desktop App (Electron)**: `app/src/main/` (`main.js`, `transcribe.js`, `paster.js`, `store.js`, `hotkeys.js`, `tray-icons.js`), `app/src/renderer/`, `app/src/preload/`, `app/src/native/` (builds in `app/dist/`)
- **Backend (Render / Groq LPU)**: `backend/server.js`, `render.yaml`
- **Website & Setup Guides**: `website/index.html`, `website/setup-guide.html`, `website/setup-guide-windows.html`, `website/downloads/` (`website/_archive/` bevat oude versies)
- **Database & Auth (Supabase + Lemon Squeezy)**: `supabase/migrations/`
- **Marketing, Outreach & Growth Hub**:
  - Dashboard & UGC Studio: `marketing/index.html`, `marketing/app.js`, `marketing/ugc-studio.js`, `marketing/publish-dispatcher.js`, `marketing/api-integrations.md`, `marketing/articles/`
  - Active Campaign & Verification Dossiers: `campaign/` (ook gelinkt via `marketing/campaign/`) — `OUTREACH_TEMPLATES.md`, `OUTREACH_TRACKING_LOG.md`, `USER_VERIFICATION_DOSSIER.md`, `NICHE_ANALYSIS_REPORT.md`
  - Leads & Outreach Databases: `marketing/leads/` (`VERIFIED_ACTIVE_OUTREACH_LIST.md`, `INFLUENCER_OUTREACH_LIST.md`) + generator-scripts in `marketing/leads/scripts/` (`generate_lead_database.py`, `generate_lead_markdown.py`, `update_lead_audit.py`, `generate_active_markdown.py`)
  - Video & Ad Showcase: `marketing/showcase/` (`ad-review.html`, `index.html`, compositions & renders)
- **Docs & Runbooks**: `docs/ONBOARDING_GUIDE.md`, `docs/EARLY_ACCESS_RUNBOOK.md`, `docs/LEMON_SQUEEZY_SETUP.md` (oud Python-prototype gearchiveerd in `docs/_legacy/`)
- **Automation & Verification Scripts**: `scripts/` (`publish-release.sh`, `verify_backend_transcription.js`, `verify_backend_transcription.sh`, `mission-control.js`, `stats.js`, `grant_pro.js`, `seed_campaign_users.js`, `upload-github-release.js`)
- **Test Suites**: `tests/` (`test_milestone1.js`, `test_milestone2.js`, `test_campaign.js`, `adversarial_challenger_m5.js`)
- **Tooling**: `tools/mission-control/`
- **Campaign Milestones & Forensic Sync**: `PROJECT.md` (gesynchroniseerd met `.agents/teamwork/orchestrator/PROJECT.md` voor tests)

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
| 2026-11-13 | **Production Launch Complete**: GitHub Release `v1.0.0` published with all 4 installers (Mac ARM64, Mac x64, Windows Setup, Windows Portable). Static website deployed live on Render CDN at `https://speakly-website.onrender.com`. Backend active at `https://speakly-backend-ie1b.onrender.com`. All 9 end-to-end smoke tests passing HTTP 200. |
| 2026-11-13 | **Full-Scale Central Marketing & Growth OS Deployed**: Built modular dashboard at `marketing/index.html` with cross-platform channel overview (TikTok, Shorts, Reels, X, Meta, Benelux), category ad spend & ROAS calculator, Supabase client pipeline & 35% partner referral CRM, in-browser 9:16 UGC video recording studio with overlaid teleprompter, cloud AI generation commands (Veo 3.1, Seedance 2.0 via `inference.sh`), 1-click multi-channel webhook dispatcher, and complete API setup vault with `marketing/api-integrations.md`. |
| 2026-11-12 | Backend hardened for Render: strictly requires authenticated Supabase users (guest AI access blocked to protect Groq tokens), active 45 req/min rate limiter, 5-minute keep-alive ping on `/health`. |
| 2026-11-12 | **Lemon Squeezy chosen as Merchant of Record (MoR)**: 0€/month, automatically collects and remits EU/Belgian VAT via OSS/MOSS. Wired native Lemon Squeezy checkout, Lemon.js overlay & affiliate tracking, recurring 30% partner commission on paid conversions, and Supabase subscription sync (`supabase/migrations/20261112170000_lemon_squeezy.sql`). |
| 2026-11-13 | **Spoken Language Selector Restored**: Added categorized language selector with country flags (English 🇬🇧/🇺🇸, Nederlands/Vlaams 🇧🇪/🇳🇱, Français 🇫🇷/🇧🇪, Deutsch 🇩🇪, etc.) in Settings under AI Speech Engine; directly accelerates Groq Whisper by bypassing language-probing latency. |
| 2026-11-13 | **Outreach & Communication Doctrine (Builder-to-Builder)**: Never use formal corporate speak or stiff openings ("Saw your post about..."). Frame outreach as a fellow builder: "Hey, I was actually having the exact same problem and ended up building a tool for myself." Do NOT mention the brand name ("Speakly") in the initial message. Avoid technical jargon dumps (Groq LPU, Whisper Turbo, ms latency); simply state what pain it eliminates. Never "sell". Close casually: "I was actually thinking about launching it, would you be open to trying an early access build?" |
| 2026-11-13 | **Audience Strategy Pivot (Heavy Typers / Problem-Aware, Solution-Unaware)**: Shift priority from hyper-technical developers (who can hack their own Whisper scripts) to high-volume typers who are NOT aware of modern AI dictation tools like Wispr Flow. Targets: writers, researchers, PMs, lawyers, customer support, students, founders, and people suffering from wrist strain/RSI. They feel the acute pain of typing for hours daily, but don't know seamless voice dictation exists yet. |

## Outreach & Communication Doctrine (LOCKED: Builder-to-Builder)
- **Voice**: Casual, honest, peer indie developer. Never sound like a sales rep, growth marketer, or corporate bot.
- **Opening Rule**: Always open with authentic empathy/relatability: *"Hey, I was actually having the exact same problem and built a small tool for myself."*
- **No Brand Mention**: Do NOT drop the product name ("Speakly") in the initial outreach message. Let them ask or receive the link naturally.
- **No Tech Jargon Dumps**: Never brag about tech specs ("Groq LPU", "whisper-large-v3-turbo", "290ms latency"). Just state the plain everyday problem it solves (e.g., doesn't cut you off mid-thought, doesn't steal focus from other apps, doesn't get stuck in Cursor).
- **No Hard Selling**: Frame it as a personal project being tested: *"I was actually thinking about launching it, would you be open to trying an early access build?"*
- **Applies to**: All direct messages, replies, emails, forum responses, community outreach, and future user-facing communication.

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

## Interface Contracts & Campaign Summary (uit `PROJECT.md`)
### Client App ↔ Backend Transcription
- **Endpoint**: `POST https://speakly-backend-ie1b.onrender.com/api/v1/transcribe`
- **Headers**: `Authorization: Bearer <Supabase_JWT>`
- **Form Data**: `audio` (WAV/WebM audio stream), `mode` (`smart` | `raw` | `email` | `notes` | `code` | `custom`), `language` (`auto` | ISO code), `customPrompt` (optional string), `dictionary` (optional comma-separated string)
- **Response**: `JSON { text: string, duration: number, wordsCount: number, engine: "groq" }`

### Distribution & Gatekeeper Onboarding
- **Production Installers (GitHub Releases `v1.0.0`)**: `Speakly-1.0.0-mac-arm64.dmg`, `Speakly-1.0.0-mac-x64.dmg` (plus Windows Setup/Portable `.exe`).
- **Setup Guide**: `https://speakly-website.onrender.com/setup-guide.html` & `docs/ONBOARDING_GUIDE.md`.
- **macOS Gatekeeper Bypass**:
  - GUI: Right-click `Speakly.app` in `/Applications` > `Open` > `Open Anyway`
  - CLI: `xattr -cr /Applications/Speakly.app`

### Early User Acquisition Campaign (`campaign/` & `PROJECT.md`)
- **Milestones**: M1 (Backend Verification & Gatekeeper Guide — DONE), M2 (Outreach Templates — DONE), M3 (Targeted Outreach & 5 Verified Active Users — DONE), M4 (Niche Analysis Report — DONE), M5 (Dual-Track Testing & Forensic Integrity Audit — IN_PROGRESS).
- **Target Niches (Campaign v1)**: Translators (Trados/memoQ), Paralegals (Word/Clio), Clinicians (SimplePractice), PhDs (Overleaf/Scrivener), Support Ops, RSI Sufferers — zero contacts to voice tech AI engineers or content creators.
- **Offer**: 3 Months Free Pro Tier (no credit card required).
- **Deliverables**: `campaign/OUTREACH_TEMPLATES.md`, `campaign/OUTREACH_TRACKING_LOG.md`, `campaign/USER_VERIFICATION_DOSSIER.md`, `campaign/NICHE_ANALYSIS_REPORT.md`.
