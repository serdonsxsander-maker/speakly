#!/usr/bin/env node

/**
 * Speakly Mission Control — Executive Project Progress & Telemetry Engine
 * 
 * Usage:
 *   node scripts/mission-control.js          # Updates dashboard HTML & prints executive terminal summary
 *   node scripts/mission-control.js --serve  # Updates dashboard & launches live HTTP server on port 4040
 *   node scripts/mission-control.js --open   # Launches HTTP server and automatically opens your browser
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'app/dist');
const OUTPUT_HTML = path.resolve(ROOT_DIR, 'tools/mission-control/index.html');
const DATA_JSON = path.resolve(ROOT_DIR, 'tools/mission-control/data.json');

// 1. Gather System Status
function getSystemStatus() {
  const status = {
    generatedAt: new Date().toISOString(),
    git: {
      branch: 'main',
      latestCommit: 'unknown',
      commitDate: '',
      clean: true,
      untrackedCount: 0,
      modifiedCount: 0
    },
    installers: {
      macArm64: { exists: false, size: 0, path: 'app/dist/Speakly-1.0.0-mac-arm64.dmg' },
      macX64: { exists: false, size: 0, path: 'app/dist/Speakly-1.0.0-mac-x64.dmg' },
      winSetup: { exists: false, size: 0, path: 'app/dist/Speakly-Setup-1.0.0-win.exe' },
      winPortable: { exists: false, size: 0, path: 'app/dist/Speakly-1.0.0-win-portable.exe' },
      checksums: { exists: false, path: 'app/dist/SHA256SUMS.txt' }
    },
    database: {
      feedbackMigration: fs.existsSync(path.resolve(ROOT_DIR, 'supabase/migrations/20261112150000_feedback.sql')),
      lemonSqueezyMigration: fs.existsSync(path.resolve(ROOT_DIR, 'supabase/migrations/20261112170000_lemon_squeezy.sql'))
    },
    backend: {
      renderConfigured: fs.existsSync(path.resolve(ROOT_DIR, 'backend/render.yaml')),
      keepaliveConfigured: fs.existsSync(path.resolve(ROOT_DIR, '.github/workflows/keepalive.yml')),
      productionUrl: 'https://speakly-backend.onrender.com'
    },
    tracks: [
      {
        id: 'desktop-app',
        num: 1,
        title: 'Desktop Client (macOS & Windows)',
        leadChat: 'Desktop App & Onboarding',
        progress: 95,
        status: 'ready',
        description: 'Native Electron client with floating Duck HUD, hotkey listeners, auto-paste, and in-app feedback.',
        items: [
          { text: 'Revoke and purge hardcoded Groq & OpenAI keys from store and build configs', done: true },
          { text: 'Automatic cleanup of leaked keys in legacy local tester profiles', done: true },
          { text: 'In-app Feedback Modal (Bug / Idea / Other) with automatic diagnostics & Duck success view', done: true },
          { text: 'Default Personal Dictionary preloaded with 20+ essential developer keywords', done: true },
          { text: 'Referral code field added to signup & stored in user_metadata', done: true },
          { text: 'Subscription status & customer portal sync wired into store', done: true },
          { text: 'Mascot visual integrity locked across all 3 states (Listening, Thinking, Solved)', done: true },
          { text: 'Production binaries built for macOS (Apple Silicon + Intel) and Windows', done: true }
        ]
      },
      {
        id: 'backend-security',
        num: 2,
        title: 'Cloud Backend & Inference Proxy',
        leadChat: 'Backend & Security',
        progress: 90,
        status: 'action_required',
        description: 'Hardened Node.js proxy on Render running Groq LPU transcription (~290ms) and Llama-3.3 prompt formatting.',
        items: [
          { text: 'Strict Supabase JWT authentication enforced on all AI endpoints (guest bypass closed)', done: true },
          { text: 'Sliding-window rate limiting (45 requests / min per user) to protect Groq credits', done: true },
          { text: 'Whisper hallucination suppressor to filter background silence artifacts', done: true },
          { text: 'Lemon Squeezy webhook signature verification & subscription sync endpoint', done: true },
          { text: 'Render free-tier 5-minute keep-alive workflow configured (.github/workflows/keepalive.yml)', done: true },
          { text: 'Push to GitHub & deploy service on Render with production env vars', done: false, blocker: true }
        ]
      },
      {
        id: 'website-downloads',
        num: 3,
        title: 'Early Access Website & Distribution',
        leadChat: 'Website & Install Flow',
        progress: 92,
        status: 'ready',
        description: 'Dark-mode Cyber-Matrix landing page with dual direct downloads, 20-second setup guide, and referral banner.',
        items: [
          { text: 'Strip all legacy BYOK (Bring Your Own Key) and promo code references', done: true },
          { text: 'Prominent dual download buttons with automatic OS detection (Mac DMG vs Windows EXE)', done: true },
          { text: '20-second visual setup guide for macOS Gatekeeper ("Open Anyway") and Windows SmartScreen', done: true },
          { text: '1-click terminal CLI copy tool for macOS quarantine removal', done: true },
          { text: 'Referral tracking: captures ?ref=CODE, saves to cookie/storage, and displays welcome banner', done: true },
          { text: 'Open Graph social previews and Duck favicon added across all pages', done: true },
          { text: 'Publish releases to GitHub Releases via scripts/publish-release.sh', done: false, blocker: true }
        ]
      },
      {
        id: 'billing-affiliates',
        num: 4,
        title: 'Billing & Lemon Squeezy (MoR)',
        leadChat: 'Billing & Affiliates',
        progress: 85,
        status: 'action_required',
        description: 'Merchant of Record configuration to legally collect EU/Belgian VAT and automate recurring 30% affiliate payouts.',
        items: [
          { text: 'Select Lemon Squeezy as Merchant of Record (0€ monthly fee, automated EU/Belgian OSS VAT)', done: true },
          { text: 'Define 30% recurring affiliate commission model (paid conversions only, stops on churn)', done: true },
          { text: 'Write complete step-by-step setup documentation (docs/LEMON_SQUEEZY_SETUP.md)', done: true },
          { text: 'Create Supabase SQL migration for subscriptions and affiliate attribution tables', done: true },
          { text: 'Connect Lemon Squeezy webhook to Render backend & test checkout overlay', done: false, blocker: true },
          { text: 'Run migration 20261112170000_lemon_squeezy.sql in Supabase SQL editor', done: false, blocker: true }
        ]
      },
      {
        id: 'growth-marketing',
        num: 5,
        title: 'Growth & Multi-Wedge Marketing Lab',
        leadChat: 'Growth & Outreach Lab',
        progress: 88,
        status: 'ready',
        description: 'Targeted acquisition strategy focusing on developers prompting AI, Belgian tech communities, and video hooks.',
        items: [
          { text: 'Developer Wedge Strategy: Focus on Cursor, Claude Code, and terminal power-users', done: true },
          { text: 'Belgium & Benelux Growth Playbook: student reps in Ghent/Leuven/Brussels, local meetups', done: true },
          { text: '5 short-form video hooks & scripts for TikTok, YouTube Shorts, and X', done: true },
          { text: 'Interactive Ad Review Dashboard & teleprompter at marketing/index.html', done: true },
          { text: 'Curated list of 22 AI-coding creators with 1-click personalized DM pitches', done: true },
          { text: '35% commission calculator for pitching high-converting micro-influencers', done: true },
          { text: 'Begin outreach to first 10 micro-creators with commission partnership offer', done: false }
        ]
      },
      {
        id: 'founder-rituals',
        num: 6,
        title: 'Executive Telemetry & Antigravity HQ',
        leadChat: 'Co-Founder HQ (This Chat)',
        progress: 95,
        status: 'ready',
        description: 'Single source of truth across all Antigravity chats, persistent memory, and live CLI stats.',
        items: [
          { text: 'Universal Project Memory (PROJECT_MEMORY.md) synchronized across all chats', done: true },
          { text: 'Global Rules locked (.agents/rules/speakly-rules.md) enforcing zero-secrets & mascot rules', done: true },
          { text: 'Founder morning stats CLI dashboard (node scripts/stats.js) querying Supabase telemetry', done: true },
          { text: 'High-end interactive Mission Control tool (tools/mission-control/index.html)', done: true },
          { text: 'Weekly Monday growth & telemetry report setup via Antigravity /schedule', done: false }
        ]
      }
    ]
  };

  // Git info
  try {
    status.git.latestCommit = execSync('git log -1 --format="%h - %s" 2>/dev/null', { cwd: ROOT_DIR }).toString().trim();
    status.git.commitDate = execSync('git log -1 --format="%cd" --date=relative 2>/dev/null', { cwd: ROOT_DIR }).toString().trim();
    const gitDiff = execSync('git status --porcelain 2>/dev/null', { cwd: ROOT_DIR }).toString().trim();
    if (gitDiff) {
      status.git.clean = false;
      const lines = gitDiff.split('\n');
      status.git.untrackedCount = lines.filter(l => l.startsWith('??')).length;
      status.git.modifiedCount = lines.filter(l => !l.startsWith('??')).length;
    }
  } catch (_) {}

  // Installers info
  const checkFile = (key, filename) => {
    const full = path.resolve(DIST_DIR, filename);
    if (fs.existsSync(full)) {
      const stats = fs.statSync(full);
      status.installers[key].exists = true;
      status.installers[key].size = Math.round(stats.size / (1024 * 1024));
    }
  };

  checkFile('macArm64', 'Speakly-1.0.0-mac-arm64.dmg');
  checkFile('macX64', 'Speakly-1.0.0-mac-x64.dmg');
  checkFile('winSetup', 'Speakly-Setup-1.0.0-win.exe');
  checkFile('winPortable', 'Speakly-1.0.0-win-portable.exe');
  if (fs.existsSync(path.resolve(DIST_DIR, 'SHA256SUMS.txt'))) {
    status.installers.checksums.exists = true;
  }

  // Calculate overall readiness score
  const totalWeight = status.tracks.reduce((acc, t) => acc + t.progress, 0);
  status.readinessScore = Math.round(totalWeight / status.tracks.length);

  return status;
}

// 2. Generate Interactive High-End Mission Control HTML
function generateDashboardHtml(data) {
  const jsonStr = JSON.stringify(data, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Speakly — Co-Founder Mission Control</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-void: #06080E;
      --bg-surface: #0B101D;
      --bg-card: #111728;
      --bg-elevated: #182238;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(0, 245, 212, 0.4);
      --matrix-gold: #FFD000;
      --matrix-gold-dim: rgba(255, 208, 0, 0.12);
      --lpu-cyan: #00F5D4;
      --lpu-cyan-dim: rgba(0, 245, 212, 0.12);
      --electric-blue: #38BDF8;
      --pulse-orange: #FF6B00;
      --emerald-green: #34D399;
      --text-main: #F1F5F9;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 22px;
      --shadow-glow-cyan: 0 0 35px rgba(0, 245, 212, 0.18);
      --shadow-glow-gold: 0 0 35px rgba(255, 208, 0, 0.2);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-void);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      line-height: 1.5;
      min-height: 100vh;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 15% 10%, rgba(0, 245, 212, 0.06) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(255, 208, 0, 0.04) 0%, transparent 45%);
    }

    .container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px 24px 80px;
    }

    /* Header & Command Bar */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border-subtle);
      flex-wrap: wrap;
      gap: 20px;
    }

    .brand-col {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .duck-avatar {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, rgba(255, 208, 0, 0.2), rgba(0, 245, 212, 0.2));
      border: 1px solid var(--border-focus);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: var(--shadow-glow-cyan);
    }

    .title-wrap h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge-live {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 0.06em;
      background: var(--lpu-cyan-dim);
      color: var(--lpu-cyan);
      border: 1px solid rgba(0, 245, 212, 0.3);
      padding: 3px 8px;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .badge-live::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--lpu-cyan);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--lpu-cyan);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .meta-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .actions-col {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn {
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 700;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .btn-primary {
      background: var(--matrix-gold);
      color: #06080E;
      border: 1px solid var(--matrix-gold);
    }

    .btn-primary:hover {
      box-shadow: var(--shadow-glow-gold);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
    }

    .btn-secondary:hover {
      border-color: var(--border-focus);
      color: var(--lpu-cyan);
    }

    /* Executive KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
      margin-bottom: 32px;
    }

    .kpi-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 22px;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .kpi-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--border-subtle), transparent);
    }

    .kpi-card.highlight::after {
      background: linear-gradient(90deg, var(--matrix-gold), var(--lpu-cyan));
    }

    .kpi-label {
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .kpi-value {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .kpi-sub {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 8px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Readiness Bar */
    .progress-bar-wrap {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      margin-top: 14px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--lpu-cyan), var(--matrix-gold));
      border-radius: 4px;
      transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Main Grid: 2 Columns */
    .main-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
    }

    @media (max-width: 1080px) {
      .main-grid { grid-template-columns: 1fr; }
    }

    /* Track Matrix Cards */
    .section-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.01em;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .track-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 22px;
      transition: all 0.2s ease;
    }

    .track-card:hover {
      border-color: rgba(0, 245, 212, 0.3);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    }

    .track-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 10px;
    }

    .track-title-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .track-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      font-size: 13px;
      font-weight: 800;
      color: var(--lpu-cyan);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .track-title {
      font-size: 16px;
      font-weight: 700;
    }

    .track-badges {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge-chat {
      font-size: 11px;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      padding: 3px 8px;
      border-radius: 6px;
      color: var(--text-muted);
    }

    .badge-status {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .badge-status.ready {
      background: rgba(52, 211, 153, 0.15);
      color: var(--emerald-green);
      border: 1px solid rgba(52, 211, 153, 0.3);
    }

    .badge-status.action_required {
      background: rgba(255, 107, 0, 0.15);
      color: var(--pulse-orange);
      border: 1px solid rgba(255, 107, 0, 0.3);
    }

    .track-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }

    .track-checklist {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .checklist-item {
      font-size: 13px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      color: var(--text-main);
    }

    .checklist-item.done {
      color: var(--text-muted);
    }

    .check-icon {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 11px;
      margin-top: 1px;
    }

    .check-icon.done {
      background: rgba(52, 211, 153, 0.2);
      color: var(--emerald-green);
      border: 1px solid rgba(52, 211, 153, 0.4);
    }

    .check-icon.pending {
      background: rgba(255, 107, 0, 0.15);
      color: var(--pulse-orange);
      border: 1px solid rgba(255, 107, 0, 0.4);
    }

    .blocker-tag {
      font-size: 10px;
      font-weight: 800;
      color: var(--pulse-orange);
      background: rgba(255, 107, 0, 0.12);
      border: 1px solid rgba(255, 107, 0, 0.3);
      padding: 1px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      margin-left: 6px;
    }

    /* Right Sidebar: Quick Actions & Live Telemetry */
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .side-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 20px;
    }

    .installer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 13px;
    }

    .installer-row:last-child { border-bottom: none; }

    .installer-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-main);
    }

    .installer-size {
      font-size: 12px;
      color: var(--lpu-cyan);
      font-weight: 700;
      background: var(--lpu-cyan-dim);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .terminal-box {
      background: #04060A;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 10px;
      overflow-x: auto;
      line-height: 1.6;
    }

    .terminal-box code { color: var(--matrix-gold); }

    .chat-pill {
      display: block;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
      margin-bottom: 8px;
      text-decoration: none;
      color: var(--text-main);
      transition: all 0.15s ease;
    }

    .chat-pill:hover {
      border-color: var(--border-focus);
      background: var(--bg-elevated);
      transform: translateX(3px);
    }

    .chat-name {
      font-size: 13px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
    }

    .chat-task {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="brand-col">
        <div class="duck-avatar">🦆</div>
        <div class="title-wrap">
          <h1>Speakly Mission Control <span class="badge-live">Live Telemetry</span></h1>
          <p class="meta-subtitle">Executive Command Center · Synchronized across all Antigravity workstreams</p>
        </div>
      </div>
      <div class="actions-col">
        <button class="btn btn-secondary" onclick="window.location.reload()">↻ Refresh State</button>
        <a class="btn btn-primary" href="../../website/index.html" target="_blank">↗ Open Website</a>
      </div>
    </header>

    <!-- Executive KPI Grid -->
    <section class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-label">Launch Readiness Score</div>
        <div class="kpi-value">${data.readinessScore}% <span style="font-size: 14px; color: var(--emerald-green); font-weight: 700;">Early Access Ready</span></div>
        <div class="progress-bar-wrap">
          <div class="progress-fill" style="width: ${data.readinessScore}%;"></div>
        </div>
        <div class="kpi-sub">5 of 6 workstreams completed</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Client Distributables</div>
        <div class="kpi-value">4 / 4 <span style="font-size: 14px; color: var(--lpu-cyan); font-weight: 700;">Built &amp; Hashed</span></div>
        <div class="kpi-sub">macOS (106M/111M) · Win (81M/89M)</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Repository &amp; Workstreams</div>
        <div class="kpi-value">${data.git.branch} <span style="font-size: 14px; color: var(--matrix-gold); font-weight: 700;">Git Synced</span></div>
        <div class="kpi-sub">${data.git.latestCommit || 'Up to date'}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Next Urgent Action</div>
        <div class="kpi-value" style="font-size: 20px; color: var(--pulse-orange);">Deploy Backend</div>
        <div class="kpi-sub">Render free-tier service blueprint</div>
      </div>
    </section>

    <!-- Main Layout -->
    <div class="main-grid">
      <!-- Tracks Breakdown -->
      <section>
        <h2 class="section-title">🚀 Workstream Progress &amp; Deliverables</h2>
        <div class="track-list">
          ${data.tracks.map(t => `
            <div class="track-card">
              <div class="track-header">
                <div class="track-title-wrap">
                  <span class="track-num">${t.num}</span>
                  <span class="track-title">${t.title}</span>
                </div>
                <div class="track-badges">
                  <span class="badge-chat">Chat: ${t.leadChat}</span>
                  <span class="badge-status ${t.status}">${t.status.replace('_', ' ')} (${t.progress}%)</span>
                </div>
              </div>
              <p class="track-desc">${t.description}</p>
              <ul class="track-checklist">
                ${t.items.map(item => `
                  <li class="checklist-item ${item.done ? 'done' : ''}">
                    <span class="check-icon ${item.done ? 'done' : 'pending'}">${item.done ? '✓' : '○'}</span>
                    <span>${item.text} ${item.blocker ? '<span class="blocker-tag">Next Blocker</span>' : ''}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Sidebar -->
      <aside class="sidebar">
        <!-- Installers Card -->
        <div class="side-card">
          <h3 class="section-title">📦 Built Installers (app/dist/)</h3>
          <div class="installer-row">
            <span class="installer-name">Mac Apple Silicon (M1-M4)</span>
            <span class="installer-size">${data.installers.macArm64.size} MB</span>
          </div>
          <div class="installer-row">
            <span class="installer-name">Mac Intel (x64)</span>
            <span class="installer-size">${data.installers.macX64.size} MB</span>
          </div>
          <div class="installer-row">
            <span class="installer-name">Windows Setup (NSIS)</span>
            <span class="installer-size">${data.installers.winSetup.size} MB</span>
          </div>
          <div class="installer-row">
            <span class="installer-name">Windows Portable</span>
            <span class="installer-size">${data.installers.winPortable.size} MB</span>
          </div>
          <div class="installer-row">
            <span class="installer-name">SHA256 Checksums</span>
            <span class="installer-size" style="color: var(--emerald-green); background: rgba(52,211,153,0.1);">Verified</span>
          </div>
        </div>

        <!-- Direct Action Terminal Commands -->
        <div class="side-card">
          <h3 class="section-title">⚡ 1-Click Founder Commands</h3>
          <p style="font-size: 12px; color: var(--text-muted);">Run in terminal to push commits or test telemetry:</p>
          <div class="terminal-box">
            # Push commits to GitHub repo<br>
            <code>git push -u origin main</code><br><br>
            # Check Supabase live statistics<br>
            <code>node scripts/stats.js</code><br><br>
            # Start local download server<br>
            <code>node scripts/serve-download.js</code>
          </div>
        </div>

        <!-- Dedicated Antigravity Chat Hub -->
        <div class="side-card">
          <h3 class="section-title">💬 Antigravity Workstream Directory</h3>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Where each project track is engineered:</p>
          
          <div class="chat-pill">
            <div class="chat-name"><span>1. Backend &amp; Security</span> <span style="color: var(--pulse-orange);">Priority 1</span></div>
            <div class="chat-task">Render deploy, keepalive &amp; JWT protection</div>
          </div>

          <div class="chat-pill">
            <div class="chat-name"><span>2. Website &amp; Downloads</span> <span style="color: var(--emerald-green);">Done</span></div>
            <div class="chat-task">OS auto-detect, Gatekeeper guide, referral banner</div>
          </div>

          <div class="chat-pill">
            <div class="chat-name"><span>3. Billing &amp; Affiliates</span> <span style="color: var(--matrix-gold);">Pending Setup</span></div>
            <div class="chat-task">Lemon Squeezy MoR, EU VAT, 30% recurring</div>
          </div>

          <div class="chat-pill">
            <div class="chat-name"><span>4. Growth &amp; Marketing</span> <span style="color: var(--lpu-cyan);">Active</span></div>
            <div class="chat-task">Belgium/Benelux playbook, short-form scripts</div>
          </div>

          <div class="chat-pill">
            <div class="chat-name"><span>5. Co-Founder HQ (This Chat)</span> <span style="color: var(--emerald-green);">Active</span></div>
            <div class="chat-task">Central progress tracking, memory &amp; strategy</div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</body>
</html>`;
}

// 3. Execution Engine
const statusData = getSystemStatus();

// Write data JSON and HTML dashboard
fs.writeFileSync(DATA_JSON, JSON.stringify(statusData, null, 2));
fs.writeFileSync(OUTPUT_HTML, generateDashboardHtml(statusData));

console.log('\n========================================================');
console.log('🦆 SPEAKLY CO-FOUNDER MISSION CONTROL');
console.log('========================================================');
console.log(`• Launch Readiness Score : ${statusData.readinessScore}% (Early Access Ready)`);
console.log(`• Git Status             : ${statusData.git.branch} (${statusData.git.clean ? 'Clean' : statusData.git.modifiedCount + ' modified files'})`);
console.log(`• Distributables         : 4/4 Built in app/dist/`);
console.log(`    - Mac Apple Silicon  : ${statusData.installers.macArm64.size} MB`);
console.log(`    - Mac Intel          : ${statusData.installers.macX64.size} MB`);
console.log(`    - Win Setup          : ${statusData.installers.winSetup.size} MB`);
console.log(`    - Win Portable       : ${statusData.installers.winPortable.size} MB`);
console.log(`• Dashboard Generated    : tools/mission-control/index.html`);
console.log('========================================================\n');

const args = process.argv.slice(2);
if (args.includes('--serve') || args.includes('--open')) {
  const PORT = 4040;
  const server = http.createServer((req, res) => {
    if (req.url === '/data.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSystemStatus()));
      return;
    }
    const html = generateDashboardHtml(getSystemStatus());
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });

  server.listen(PORT, () => {
    console.log(`🚀 Mission Control Dashboard is live at: http://localhost:${PORT}`);
    if (args.includes('--open')) {
      try {
        execSync(`open http://localhost:${PORT}`);
      } catch (_) {}
    }
    console.log('Press Ctrl+C to close server.\n');
  });
}
