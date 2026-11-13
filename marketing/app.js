/* =========================================================================
   SPEAKLY CENTRAL MARKETING OS — CORE CONTROLLER (app.js)
   Integrates:
   - Executive Dashboard KPIs (Reach, Spend, Paying Users, MRR)
   - Cross-Platform Channel Metrics (TikTok, YouTube, IG, X, Meta, Benelux)
   - Category / Wedge Ad Spend & ROAS Matrix
   - Client Pipeline & Supabase Referral CRM
   - API Vault & Credentials Manager (Local Storage)
   - Official Rubber Ducky SVG Mascot Generator
   ========================================================================= */

// 1. OFFICIAL RUBBER DUCKY SVG GENERATOR (Option 04 — LPU Cyber-Matrix)
function getOfficialRubberDuckySVG(state = "listening") {
  let stateExtras = "";
  if (state === "listening") {
    stateExtras = `
      <ellipse cx="32" cy="34" rx="4" ry="5.5" fill="#0F172A" />
      <circle cx="30.5" cy="32" r="1.8" fill="#FFFFFF" />
      <circle cx="33.5" cy="35.5" r="0.9" fill="#FFFFFF" />
      <path d="M22 34 C22 15, 50 15, 50 34" fill="none" stroke="#3B82F6" stroke-width="4.5" stroke-linecap="round" />
      <rect x="37" y="29" width="7.5" height="14" rx="3.75" fill="#2563EB" />
      <rect x="38.8" y="31.5" width="4" height="9" rx="2" fill="#60A5FA" />
    `;
  } else if (state === "thinking") {
    stateExtras = `
      <path d="M26 35 Q32 29 38 35" fill="none" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round" />
      <circle cx="58" cy="18" r="3.2" fill="#F59E0B" />
      <circle cx="67" cy="11" r="5" fill="#38BDF8" />
    `;
  } else if (state === "solved") {
    stateExtras = `
      <path d="M27 34 Q33 27 39 34" fill="none" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round" />
      <ellipse cx="28" cy="41" rx="4.5" ry="2.5" fill="#FF8A8A" opacity="0.8" />
      <path d="M68 8 L70 15 L77 17 L70 19 L68 26 L66 19 L59 17 L66 15 Z" fill="#FBBF24" />
    `;
  }

  return `
    <svg viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="52" cy="86" rx="30" ry="4" fill="#38BDF8" opacity="0.28" />
      <path d="M18 36 Q7 38 11 45 Q21 47 27 42 Z" fill="#FF6B00" />
      <ellipse cx="52" cy="62" rx="31" ry="23" fill="#FFD000" />
      <path d="M78 52 C88 42, 92 46, 82 62 Z" fill="#FFD000" />
      <circle cx="36" cy="37" r="20.5" fill="#FFD000" />
      <ellipse cx="34" cy="24" rx="10" ry="4.5" fill="#FFE866" opacity="0.55" />
      <path d="M39 58 Q50 49 65 60 Q54 74 39 70 Z" fill="#F59E0B" />
      ${stateExtras}
    </svg>
  `;
}

// 2. SOCIAL CHANNELS LIVE TELEMETRY
const CHANNELS_DATA = [
  {
    id: "tiktok",
    name: "TikTok",
    handle: "@speaklyapp",
    type: "tiktok",
    icon: "🎵",
    followers: "4,820",
    impressions: "142,500",
    clicks: "3,120",
    watchTimeAvg: "78%",
    topContent: "01. Stop Typing Cursor Prompts (24s)"
  },
  {
    id: "youtube",
    name: "YouTube Shorts",
    handle: "Speakly Dev",
    type: "youtube",
    icon: "▶️",
    followers: "1,450 Subs",
    impressions: "68,200",
    clicks: "1,890",
    watchTimeAvg: "74%",
    topContent: "RSI & Wrist Relief for Coders (28s)"
  },
  {
    id: "instagram",
    name: "Instagram Reels",
    handle: "@speakly.app",
    type: "instagram",
    icon: "📸",
    followers: "2,280",
    impressions: "51,400",
    clicks: "980",
    watchTimeAvg: "69%",
    topContent: "ADHD Brain Dump Mode"
  },
  {
    id: "x",
    name: "X (Twitter)",
    handle: "@speaklyapp",
    type: "x",
    icon: "𝕏",
    followers: "3,610",
    impressions: "210,000",
    clicks: "4,450",
    watchTimeAvg: "82% Thread Read",
    topContent: "Groq LPU 0.29s Latency Benchmark"
  },
  {
    id: "meta",
    name: "Meta / FB Ads",
    handle: "Speakly EU",
    type: "meta",
    icon: "♾️",
    followers: "Paid Ads",
    impressions: "38,000",
    clicks: "1,240",
    watchTimeAvg: "€0.24 CPC",
    topContent: "Cursor Vibe Coder Static Ad"
  },
  {
    id: "benelux",
    name: "Belgian Tech Hubs",
    handle: "Wintercircus & Tweakers",
    type: "benelux",
    icon: "🇧🇪",
    followers: "Direct Founders",
    impressions: "12,800",
    clicks: "890",
    watchTimeAvg: "Flemish/English",
    topContent: "Code-Switching Showcase"
  }
];

// 3. AD SPEND & CATEGORIES MATRIX DATA
const AD_SPEND_CATEGORIES = [
  {
    id: "cat-1",
    wedge: "AI Coding (Cursor / Claude)",
    status: "active",
    budget: 350,
    spend: 210,
    cpc: 0.18,
    signups: 420,
    cpa: 0.50,
    proSubscribers: 58,
    cac: 3.62,
    roas: "3.8x"
  },
  {
    id: "cat-2",
    wedge: "ADHD Brain Dump Workers",
    status: "pilot",
    budget: 200,
    spend: 115,
    cpc: 0.22,
    signups: 210,
    cpa: 0.55,
    proSubscribers: 26,
    cac: 4.42,
    roas: "3.1x"
  },
  {
    id: "cat-3",
    wedge: "Belgian / Benelux Agencies",
    status: "pilot",
    budget: 150,
    spend: 85,
    cpc: 0.32,
    signups: 95,
    cpa: 0.89,
    proSubscribers: 19,
    cac: 4.47,
    roas: "4.0x"
  },
  {
    id: "cat-4",
    wedge: "Sales Reps & CRM Logging",
    status: "queued",
    budget: 100,
    spend: 0,
    cpc: 0.00,
    signups: 0,
    cpa: 0.00,
    proSubscribers: 0,
    cac: 0.00,
    roas: "N/A"
  },
  {
    id: "cat-5",
    wedge: "Product Managers & Spec Writers",
    status: "queued",
    budget: 100,
    spend: 0,
    cpc: 0.00,
    signups: 0,
    cpa: 0.00,
    proSubscribers: 0,
    cac: 0.00,
    roas: "N/A"
  }
];

// 4. CLIENT PIPELINE & PARTNER REFERRAL CRM
const PARTNER_REFERRAL_DATA = [
  { code: "COLEMEDIN", owner: "Cole Medin (YouTube)", wedge: "AI Coding", signups: 340, proPaying: 48, commissionOwed: 235.20, status: "Active" },
  { code: "WINTERCIRCUS", owner: "Wintercircus Startups", wedge: "Benelux Hub", signups: 85, proPaying: 18, commissionOwed: 88.20, status: "Active" },
  { code: "EXTRAADHD", owner: "Jesse Anderson (ADHD)", wedge: "ADHD", signups: 195, proPaying: 29, commissionOwed: 142.10, status: "Active" },
  { code: "BECENTRAL", owner: "BeCentral Brussels", wedge: "Benelux Hub", signups: 62, proPaying: 12, commissionOwed: 58.80, status: "Active" },
  { code: "RILEYBROWN", owner: "Riley Brown (X)", wedge: "AI Coding", signups: 210, proPaying: 32, commissionOwed: 156.80, status: "Active" }
];

// INITIALIZATION
window.addEventListener("DOMContentLoaded", () => {
  // Mount header duck
  const duckMount = document.getElementById("header-duck-mount");
  if (duckMount) duckMount.innerHTML = getOfficialRubberDuckySVG("solved");

  // Render initial components
  renderChannelsGrid();
  renderAdSpendTable();
  renderPartnerReferralTable();
  loadApiVaultSettings();

  // Initialize UGC Studio
  if (typeof initUgcStudio === "function") {
    initUgcStudio();
  }
});

// Switch Tab Panes
function switchAppTab(tabId) {
  document.querySelectorAll(".tab-content-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));

  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add("active");

  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add("active");
}

// Render Social Channel Overview
function renderChannelsGrid() {
  const container = document.getElementById("channels-grid-container");
  if (!container) return;
  container.innerHTML = "";

  CHANNELS_DATA.forEach(ch => {
    const card = document.createElement("div");
    card.className = "channel-card";
    card.innerHTML = `
      <div class="channel-top">
        <div class="channel-badge ${ch.type}">
          <div class="icon">${ch.icon}</div>
          <div>
            <div>${ch.name}</div>
            <div style="font-size: 11px; color: var(--text-dim); font-family: monospace;">${ch.handle}</div>
          </div>
        </div>
        <span class="badge-live-pill">LIVE</span>
      </div>

      <div class="channel-stats-row">
        <div class="ch-stat-item">
          <span class="lbl">Audience</span>
          <span class="num">${ch.followers}</span>
        </div>
        <div class="ch-stat-item">
          <span class="lbl">Impressions</span>
          <span class="num">${ch.impressions}</span>
        </div>
        <div class="ch-stat-item">
          <span class="lbl">Site Clicks</span>
          <span class="num" style="color: var(--lpu-cyan);">${ch.clicks}</span>
        </div>
      </div>

      <div class="channel-footer-action">
        <span style="color: var(--text-muted); font-size: 11px;">Top: ${ch.topContent}</span>
        <button class="btn-cyber" style="padding: 4px 10px; font-size: 11px;" onclick="switchAppTab('tab-publisher')">Publish 🚀</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Ad Spend & Category Matrix
function renderAdSpendTable() {
  const tbody = document.getElementById("ad-spend-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  AD_SPEND_CATEGORIES.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${item.wedge}</strong></td>
      <td><span class="status-badge-chip ${item.status}">${item.status.toUpperCase()}</span></td>
      <td>€${item.budget} / mo</td>
      <td><strong>€${item.spend}</strong></td>
      <td>€${item.cpc.toFixed(2)}</td>
      <td style="color: var(--lpu-cyan);"><strong>${item.signups}</strong> (€${item.cpa.toFixed(2)})</td>
      <td style="color: var(--emerald-green); font-weight: 700;">${item.proSubscribers} Pro</td>
      <td>€${item.cac.toFixed(2)}</td>
      <td><strong style="color: var(--matrix-gold);">${item.roas}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Partner Referrals & Client Pipeline Table
function renderPartnerReferralTable() {
  const tbody = document.getElementById("partner-referral-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  PARTNER_REFERRAL_DATA.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--matrix-gold);">${p.code}</span>
      </td>
      <td>${p.owner}</td>
      <td><span style="font-size: 12px; color: var(--text-muted);">${p.wedge}</span></td>
      <td><strong>${p.signups}</strong></td>
      <td style="color: var(--emerald-green); font-weight: 700;">${p.proPaying} Pro (14.1%)</td>
      <td style="color: var(--lpu-cyan); font-family: monospace; font-weight: 700;">€${p.commissionOwed.toFixed(2)}</td>
      <td><span class="badge-live-pill" style="font-size: 10px;">${p.status}</span></td>
      <td>
        <button class="btn-cyber" style="padding: 4px 10px; font-size: 11px;" onclick="copyPartnerMagicLink('${p.code}')">Copy Ref Link</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function copyPartnerMagicLink(code) {
  const link = `https://speakly.app/?ref=${code}`;
  navigator.clipboard.writeText(link).then(() => {
    showOsToast(`Partner link copied: ${link}`);
  });
}

// API Vault Settings Management
function saveApiVaultSettings() {
  const fields = [
    "supabase_url", "supabase_anon", "lemonsqueezy_key",
    "meta_token", "tiktok_token", "youtube_token",
    "elevenlabs_key", "inference_sh_key", "webhook_url"
  ];

  fields.forEach(f => {
    const input = document.getElementById(`api-input-${f}`);
    if (input) {
      localStorage.setItem(`speakly_api_${f}`, input.value.trim());
    }
  });

  showOsToast("✅ API Credentials saved securely to your local browser storage!");
  updateApiStatusBadges();
}

function loadApiVaultSettings() {
  const fields = [
    "supabase_url", "supabase_anon", "lemonsqueezy_key",
    "meta_token", "tiktok_token", "youtube_token",
    "elevenlabs_key", "inference_sh_key", "webhook_url"
  ];

  fields.forEach(f => {
    const input = document.getElementById(`api-input-${f}`);
    const saved = localStorage.getItem(`speakly_api_${f}`);
    if (input && saved) {
      input.value = saved;
    }
  });

  updateApiStatusBadges();
}

function updateApiStatusBadges() {
  const supabaseVal = localStorage.getItem("speakly_api_supabase_anon");
  const badgeSupabase = document.getElementById("badge-status-supabase");
  if (badgeSupabase) {
    badgeSupabase.textContent = supabaseVal ? "CONNECTED" : "UNLINKED";
    badgeSupabase.className = `badge-live-pill ${supabaseVal ? 'active' : ''}`;
  }

  const webhookVal = localStorage.getItem("speakly_api_webhook_url");
  const badgeWebhook = document.getElementById("badge-status-webhook");
  if (badgeWebhook) {
    badgeWebhook.textContent = webhookVal ? "CONNECTED" : "UNLINKED";
  }
}

function purgeApiVault() {
  if (confirm("Are you sure you want to remove all saved API keys from your browser?")) {
    const fields = [
      "supabase_url", "supabase_anon", "lemonsqueezy_key",
      "meta_token", "tiktok_token", "youtube_token",
      "elevenlabs_key", "inference_sh_key", "webhook_url"
    ];
    fields.forEach(f => localStorage.removeItem(`speakly_api_${f}`));
    loadApiVaultSettings();
    showOsToast("All API credentials purged from browser storage.");
  }
}

// Toast Helper
function showOsToast(msg) {
  const toast = document.getElementById("os-toast");
  const msgEl = document.getElementById("os-toast-msg");
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3400);
}
