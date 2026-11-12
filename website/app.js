/* =========================================================================
   SPEAKLY — APPLE KEYNOTE & INTERACTIVE PRODUCT SUITE SCRIPT
   Combines:
   - Official Rubber Ducky SVG Mascot (Listening / Thinking / Solved states)
   - Lenis Smooth Scroll + GSAP ScrollTrigger (Split-Text & Sticky Card Stack)
   - Live Push-to-Talk Sandbox (Hold Spacebar or click to simulate real-time dictation)
   - Multi-View Navigation (Overview, Live Desktop App Replica, 30s Films, Pricing)
   ========================================================================= */

// 1. OFFICIAL SPEAKLY RUBBER DUCKY SVG FACTORY (Proper Painter's Layering: Beak Behind Head, Eye & Headphones On Top)
function getRubberDuckySVG(state = "listening") {
  let stateExtras = "";

  if (state === "listening") {
    // Blue studio headphones + wide alert eye with double catchlight
    stateExtras = `
      <ellipse cx="32" cy="34" rx="4" ry="5.5" fill="#0F172A" />
      <circle cx="30.5" cy="32" r="1.8" fill="#FFFFFF" />
      <circle cx="33.5" cy="35.5" r="0.9" fill="#FFFFFF" />
      <path d="M22 34 C22 15, 50 15, 50 34" fill="none" stroke="#3B82F6" stroke-width="4.5" stroke-linecap="round" />
      <rect x="37" y="29" width="7.5" height="14" rx="3.75" fill="#2563EB" />
      <rect x="38.8" y="31.5" width="4" height="9" rx="2" fill="#60A5FA" />
    `;
  } else if (state === "thinking") {
    // Squinted thinking eye + floating cyan/gold thought bubbles
    stateExtras = `
      <path d="M26 35 Q32 29 38 35" fill="none" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round" />
      <circle cx="58" cy="18" r="3.2" fill="#F59E0B" />
      <circle cx="67" cy="11" r="5" fill="#38BDF8" />
    `;
  } else if (state === "solved") {
    // Happy arc eye + rosy blush + 4-point golden sparkle
    stateExtras = `
      <path d="M27 34 Q33 27 39 34" fill="none" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round" />
      <ellipse cx="28" cy="41" rx="4.5" ry="2.5" fill="#FF8A8A" opacity="0.8" />
      <path d="M68 8 L70 15 L77 17 L70 19 L68 26 L66 19 L59 17 L66 15 Z" fill="#FBBF24" />
    `;
  }

  return `
    <svg viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- Subtle Acoustic Water Ripple -->
      <ellipse cx="52" cy="86" rx="30" ry="4" fill="#38BDF8" opacity="0.28" />
      <!-- Orange Beak (Drawn behind head contour so colors never collide) -->
      <path d="M18 36 Q7 38 11 45 Q21 47 27 42 Z" fill="#FF6B00" />
      <!-- Body & Tail -->
      <ellipse cx="52" cy="62" rx="31" ry="23" fill="#FFD000" />
      <path d="M78 52 C88 42, 92 46, 82 62 Z" fill="#FFD000" />
      <!-- Head -->
      <circle cx="36" cy="37" r="20.5" fill="#FFD000" />
      <!-- Crown Highlight -->
      <ellipse cx="34" cy="24" rx="10" ry="4.5" fill="#FFE866" opacity="0.55" />
      <!-- Sculpted Wing -->
      <path d="M39 58 Q50 49 65 60 Q54 74 39 70 Z" fill="#F59E0B" />
      ${stateExtras}
    </svg>
  `;
}

// Mount initial Duck SVGs across the interface
function mountAllDuckIcons() {
  const navDuck = document.getElementById("nav-duck-svg");
  const hudMascot = document.getElementById("hud-mascot");
  const studioOrb = document.getElementById("studio-duck-orb");
  const inscreenIcon = document.getElementById("inscreen-duck-icon");
  const replicaDuck = document.getElementById("replica-sidebar-duck");
  const modalDuck = document.getElementById("modal-duck-svg");

  if (navDuck) navDuck.innerHTML = getRubberDuckySVG("solved");
  if (hudMascot) hudMascot.innerHTML = getRubberDuckySVG("listening");
  if (studioOrb) studioOrb.innerHTML = getRubberDuckySVG("solved");
  if (inscreenIcon) inscreenIcon.innerHTML = getRubberDuckySVG("listening");
  if (replicaDuck) replicaDuck.innerHTML = getRubberDuckySVG("solved");
  if (modalDuck) modalDuck.innerHTML = getRubberDuckySVG("solved");
}

// =========================================================================
// 2. LIVE INTERACTIVE PUSH-TO-TALK SAMPLES ("ONE LIVE THING")
// =========================================================================
const STUDIO_SAMPLES = {
  smart_polish: {
    targetApp: "2. PASTED INTO SLACK AT CURSOR",
    modeBadge: "Smart Polish Active",
    latency: "0.28s Groq LPU",
    saved: "Saved 24 sec on this message",
    rawHTML: `"Hey team <span class="filler-word">um</span> I just pushed the <del>macOS notarized build</del> <span class="filler-word">wait no</span> the universal DMG installer for Speakly v2.0, let's <del>deploy at 2pm</del> actually let's ship it at 4:30pm after QA finishes."`,
    cleanText: `Hey team — I just pushed the universal DMG installer for Speakly v2.0. Let's ship it at 4:30 PM after QA finishes.`
  },
  email: {
    targetApp: "2. PASTED INTO APPLE MAIL / GMAIL",
    modeBadge: "Professional Email Mode",
    latency: "0.31s Groq LPU",
    saved: "Saved 42 sec on this email",
    rawHTML: `"<span class="filler-word">Uh</span> reply toElena and tell her we reviewed the enterprise security questionnaire, <del>everything looks good</del> all SOC2 controls and Supabase RLS policies are documented, ask if Thursday at 11am works for a quick walkthrough."`,
    cleanText: `Hi Elena,\n\nWe finished reviewing the enterprise security questionnaire. All SOC2 controls and Supabase RLS policies are fully documented and attached.\n\nDoes Thursday at 11:00 AM work for a quick walkthrough?\n\nBest,\nXsander`
  },
  notes: {
    targetApp: "2. PASTED INTO NOTION / LINEAR",
    modeBadge: "Actionable Notes Mode",
    latency: "0.29s Groq LPU",
    saved: "Saved 38 sec on standup notes",
    rawHTML: `"Okay quick recap from sprint planning <span class="filler-word">like</span> first lock the Groq LPU fallback to OpenAI Whisper, second <del>update the icon</del> finalize the 30-second Remotion launch video, and third test clipboard restore on Windows 11."`,
    cleanText: `• **Inference Engine:** Lock automatic Groq LPU fallback to OpenAI Whisper\n• **Marketing Launch:** Finalize 30-second Remotion launch commercial\n• **Windows QA:** Verify 600ms clipboard restoration on Windows 11`
  },
  code: {
    targetApp: "2. PASTED INTO CURSOR / CLAUDE CODE",
    modeBadge: "AI Prompt / Dev Mode",
    latency: "0.27s Groq LPU",
    saved: "Saved 51 sec on engineering prompt",
    rawHTML: `"In <span class="filler-word">uh</span> audio recorder dot js refactor the media devices stream so it captures 16 kilohertz mono PCM and streams 60fps frequency bars to the floating pill IPC channel without blocking the main thread."`,
    cleanText: `Refactor \`audioRecorder.js\` audio capture pipeline:\n- Capture \`16kHz\` mono PCM via \`navigator.mediaDevices.getUserMedia\`\n- Stream 60fps \`AnalyserNode\` frequency data to the Floating Pill IPC channel\n- Keep encoding off the main Electron UI thread`
  },
  verbatim: {
    targetApp: "2. PASTED ANYWHERE AT CURSOR",
    modeBadge: "Fast Verbatim (0.18s)",
    latency: "0.18s Whisper Turbo",
    saved: "Pure acoustic transcription",
    rawHTML: `" Ship the release candidate to production as soon as the automated smoke tests pass on Apple Silicon."`,
    cleanText: `Ship the release candidate to production as soon as the automated smoke tests pass on Apple Silicon.`
  }
};

let currentStudioMode = "smart_polish";
let isSimulatingDictation = false;

function renderStudioMode(modeKey, animate = false) {
  currentStudioMode = modeKey;
  const sample = STUDIO_SAMPLES[modeKey];
  if (!sample) return;

  const rawBox = document.getElementById("live-raw-box");
  const cleanBox = document.getElementById("live-clean-box");
  const targetLabel = document.getElementById("clean-target-app");
  const modeBadge = document.getElementById("clean-mode-badge");
  const latencyNum = document.getElementById("studio-latency-num");
  const savedPill = document.getElementById("time-saved-pill");

  document.querySelectorAll(".mode-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sample === modeKey);
  });

  if (targetLabel) targetLabel.textContent = sample.targetApp;
  if (modeBadge) modeBadge.textContent = sample.modeBadge;
  if (latencyNum) latencyNum.textContent = sample.latency;
  if (savedPill) savedPill.textContent = sample.saved;

  if (!animate) {
    if (rawBox) rawBox.innerHTML = sample.rawHTML;
    if (cleanBox) cleanBox.textContent = sample.cleanText;
  } else {
    runLiveDictationAnimation(sample);
  }
}

function runLiveDictationAnimation(sample) {
  if (isSimulatingDictation) return;
  isSimulatingDictation = true;

  const pill = document.getElementById("floating-ducky-pill");
  const hudMascot = document.getElementById("hud-mascot");
  const hudStatus = document.getElementById("hud-status-text");
  const studioOrb = document.getElementById("studio-duck-orb");
  const rawBox = document.getElementById("live-raw-box");
  const cleanBox = document.getElementById("live-clean-box");
  const pttLabel = document.getElementById("ptt-btn-label");

  // Phase 1: Listening (0ms -> 1100ms)
  pill.className = "ducky-pill-hud state-listening";
  hudMascot.innerHTML = getRubberDuckySVG("listening");
  studioOrb.innerHTML = getRubberDuckySVG("listening");
  hudStatus.innerHTML = "Listening at <strong>158 WPM</strong>…";
  if (pttLabel) pttLabel.textContent = "Listening… (Speaking out loud)";

  if (rawBox) rawBox.innerHTML = `<span style="color:#94A3B8">🎙️ Capturing 16kHz PCM voice stream...</span>`;
  if (cleanBox) cleanBox.textContent = "Waiting for key release...";

  setTimeout(() => {
    if (rawBox) rawBox.innerHTML = sample.rawHTML;
    // Phase 2: Thinking / Groq LPU Polish (1100ms -> 1550ms)
    pill.className = "ducky-pill-hud state-thinking";
    hudMascot.innerHTML = getRubberDuckySVG("thinking");
    studioOrb.innerHTML = getRubberDuckySVG("thinking");
    hudStatus.innerHTML = "Thinking… <strong>Groq LPU 70B</strong>";
    if (pttLabel) pttLabel.textContent = "Stripping fillers & self-corrections…";
  }, 1050);

  setTimeout(() => {
    // Phase 3: Pasted at Cursor!
    pill.className = "ducky-pill-hud state-solved";
    hudMascot.innerHTML = getRubberDuckySVG("solved");
    studioOrb.innerHTML = getRubberDuckySVG("solved");
    hudStatus.innerHTML = "Pasted at cursor! ✨ <strong>(0.29s)</strong>";
    if (cleanBox) cleanBox.textContent = sample.cleanText;
    if (pttLabel) pttLabel.innerHTML = `Simulate Push-to-Talk (<kbd>Space</kbd>)`;

    // Also prepend to Live Desktop Replica History if user visits Playground
    prependReplicaHistory(sample.cleanText, sample.modeBadge);

    setTimeout(() => {
      pill.className = "ducky-pill-hud state-idle";
      hudMascot.innerHTML = getRubberDuckySVG("listening");
      hudStatus.innerHTML = `Hold <kbd>Space</kbd> or Click to Dictate`;
      isSimulatingDictation = false;
    }, 2200);
  }, 1550);
}

// =========================================================================
// 3. HARDWARE STAGE TARGET WINDOW SWITCHER (Cursor / Slack / Mail / Linear)
// =========================================================================
const TARGET_WINDOWS = {
  cursor: {
    appName: "Cursor",
    html: `<div style="color:#64748B;margin-bottom:8px;">// src/main/hotkeyManager.js — Cursor Composer Prompt</div>
<div style="color:#38BDF8;">&gt; Prompt pasted by Speakly (AI Prompt / Dev Mode):</div>
<div style="color:#F8FAFC;margin-top:6px;">"Refactor <code>main.js</code> hotkey registration so <code>Right Command</code> triggers push-to-talk on macOS and restores the user's previous clipboard buffer 600ms after native paste."<span style="display:inline-block;width:8px;height:15px;background:#FFD000;margin-left:4px;vertical-align:middle;"></span></div>`
  },
  slack: {
    appName: "Slack",
    html: `<div style="color:#94A3B8;margin-bottom:8px;">#product-launch · Thread with @sarah &amp; @marcus</div>
<div style="background:rgba(255,208,0,0.08);border-left:3px solid #FFD000;padding:10px 14px;border-radius:6px;color:#F8FAFC;">
  <strong>You (via Speakly Smart Polish · 0.28s):</strong><br/>
  "Hey Sarah, can we push the design review to 3:30 PM? I'm finishing the final Apple HIG spring transitions now."
</div>`
  },
  gmail: {
    appName: "Apple Mail",
    html: `<div style="color:#94A3B8;margin-bottom:8px;">To: marcus@acme.dev · Subject: Speakly v2.0 Universal DMG Build</div>
<div style="color:#F8FAFC;">Hi Marcus,<br/><br/>We shipped the notarized macOS v2.0 build this morning, bringing end-to-end Groq LPU latency down to 290ms.<br/><br/>Could your team run a quick test pass before Friday?<br/><br/>Best,<br/>Xsander</div>`
  },
  linear: {
    appName: "Linear",
    html: `<div style="color:#94A3B8;margin-bottom:8px;">SPK-142 · Release Checklist (Actionable Notes Mode)</div>
<div style="color:#F8FAFC;">
  • <strong>Supabase RLS:</strong> Lock dictionary sync policies today<br/>
  • <strong>Groq LPU Engine:</strong> Verify automatic Whisper fallback<br/>
  • <strong>Launch Video:</strong> Publish 30s Remotion &amp; iMessage spots
</div>`
  }
};

function renderTargetWindow(key) {
  const win = TARGET_WINDOWS[key];
  if (!win) return;
  const appNameEl = document.getElementById("menubar-app-name");
  const contentEl = document.getElementById("target-window-content");
  if (appNameEl) appNameEl.textContent = win.appName;
  if (contentEl) contentEl.innerHTML = win.html;

  document.querySelectorAll(".context-target-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.targetWindow === key);
  });
}

// =========================================================================
// 4. INTERACTIVE DESKTOP APP REPLICA ("PLAYGROUND" VIEW)
// =========================================================================
const INITIAL_HISTORY = [
  {
    text: "Hey Sarah, can we push the design review to 3:30 PM? I'm finishing the Figma tokens now.",
    mode: "Smart Polish",
    meta: "Just now · 24 words · 0.28s Groq LPU"
  },
  {
    text: "• Lock Supabase RLS policies today\n• Verify Groq LPU fallback to OpenAI Whisper\n• Ship 30s launch films",
    mode: "Actionable Notes",
    meta: "14 mins ago · 31 words · 0.31s Groq LPU"
  },
  {
    text: "Refactor audioRecorder.js to stream 60fps AnalyserNode frequency bars to the non-activating Electron pill.",
    mode: "AI Prompt / Dev",
    meta: "1 hr ago · 19 words · 0.27s Groq LPU"
  }
];

let totalDictatedWords = 14820;

function renderReplicaHistory() {
  const feed = document.getElementById("replica-history-feed");
  if (!feed) return;
  feed.innerHTML = INITIAL_HISTORY.map(
    (item) => `
    <div class="history-item">
      <div>
        <span class="bubble-tag gold">${item.mode}</span>
        <div class="history-text" style="white-space:pre-line;">${item.text}</div>
      </div>
      <span class="history-meta">${item.meta}</span>
    </div>
  `
  ).join("");
}

function prependReplicaHistory(text, modeLabel) {
  const wordCount = text.split(/\s+/).length;
  totalDictatedWords += wordCount;
  const wordsStat = document.getElementById("rep-stat-words");
  if (wordsStat) wordsStat.textContent = totalDictatedWords.toLocaleString();

  INITIAL_HISTORY.unshift({
    text,
    mode: modeLabel,
    meta: `Just now · ${wordCount} words · 0.29s Groq LPU`
  });
  renderReplicaHistory();
}

const DICTIONARY_WORDS = [
  "Speakly",
  "Rubber Ducky AI",
  "Groq LPU",
  "Supabase RLS",
  "Whisper v3 Turbo",
  "Llama 3.3 70B",
  "Antigravity",
  "Xsander",
  "Remotion",
  "Lenis"
];

function renderDictionaries() {
  const landingList = document.getElementById("landing-dict-pills");
  const replicaCloud = document.getElementById("rep-dict-cloud");

  const html = DICTIONARY_WORDS.map(
    (w) => `<span class="dict-vocab-tag">${w}</span>`
  ).join("");

  if (landingList) landingList.innerHTML = html;
  if (replicaCloud) replicaCloud.innerHTML = html;
}

// =========================================================================
// 4B. 6 RUBBER DUCKY BRANDING KIT & APP ICON OPTIONS (WITH 5-STAR RATING)
// =========================================================================
const BRANDING_KIT_OPTIONS = [
  {
    id: "option-1",
    number: "OPTION 01 · RECOMMENDED DEFAULT",
    name: "Acoustic Sovereign",
    tagline: "Apple Obsidian & Studio Gold · High-Contrast Dark Mode",
    svgFile: "assets/logos/concept-1-acoustic-sovereign.svg",
    rationale:
      "Pairs our signature golden-yellow Rubber Ducky wearing cobalt studio headphones against a deep obsidian-slate squircle (#0C0D12). Eliminates all yellow-on-yellow collision and pops on both light and dark macOS Docks.",
    typography: "SF Pro Display + JetBrains Mono",
    showcaseStyle: "THE VOID / FROSTED HORIZON (Dark)",
    themeVars: {
      "--duck-yellow": "#FFD000",
      "--duck-gold": "#F59E0B",
      "--duck-beak": "#FF6B00"
    },
    swatches: [
      { name: "Duck Yellow", hex: "#FFD000" },
      { name: "Beak Orange", hex: "#FF6B00" },
      { name: "Studio Blue", hex: "#2563EB" },
      { name: "Obsidian", hex: "#0C0D12" }
    ],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g1" cx="48%" cy="40%" r="65%"><stop offset="0%" stop-color="#22283A"/><stop offset="100%" stop-color="#0C0D12"/></radialGradient><linearGradient id="b1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE135"/><stop offset="65%" stop-color="#FFD000"/><stop offset="100%" stop-color="#F59E0B"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="22" fill="url(#g1)" stroke="#FFD000" stroke-opacity="0.45" stroke-width="1.5"/><ellipse cx="52" cy="83" rx="27" ry="3.5" fill="#38BDF8" opacity="0.32"/><ellipse cx="52" cy="83" rx="18" ry="2" fill="#FFD000" opacity="0.48"/><path d="M21 41 Q10 43 14 49 Q24 51 29 46 Z" fill="#FF6B00"/><ellipse cx="54" cy="63" rx="26.5" ry="19.5" fill="url(#b1)"/><path d="M75 54 C85 44, 89 48, 79 63 Z" fill="url(#b1)"/><circle cx="38" cy="40" r="18" fill="url(#b1)"/><ellipse cx="36" cy="28" rx="9" ry="4" fill="#FFF3B0" opacity="0.55"/><path d="M43 59 Q53 51 66 61 Q56 73 43 69 Z" fill="#D97706"/><ellipse cx="30" cy="46" rx="4" ry="2.2" fill="#FF8A8A" opacity="0.8"/><ellipse cx="33.5" cy="37" rx="3.6" ry="4.8" fill="#0F172A"/><circle cx="32.2" cy="35.3" r="1.6" fill="#FFFFFF"/><circle cx="34.8" cy="38.5" r="0.8" fill="#FFFFFF"/><path d="M24 37 C24 19, 51 19, 51 37" fill="none" stroke="#3B82F6" stroke-width="3.6" stroke-linecap="round"/><rect x="39" y="25" width="3" height="10" rx="1.5" fill="#3B82F6"/><rect x="37" y="33" width="7" height="12" rx="3.5" fill="#2563EB"/><rect x="38.8" y="35.2" width="3.4" height="7.6" rx="1.7" fill="#60A5FA"/></svg>`
  },
  {
    id: "option-2",
    number: "OPTION 02 · ANTHROPIC EDITORIAL",
    name: "Editorial Warmth",
    tagline: "Alabaster Paper, Terracotta & Sage · Human-Centered AI",
    svgFile: "assets/logos/concept-2-editorial-warmth.svg",
    rationale:
      "Inspired by the brand-guidelines skill (#FAF9F5 Alabaster, #141413 Warm Ink, #D97757 Terracotta, #788C5D Sage). Frames the Rubber Ducky as an intelligent editorial writing companion with crisp architectural ink lines.",
    typography: "Poppins + Lora Editorial Serif",
    showcaseStyle: "EDITORIAL PAPER (Light)",
    themeVars: {
      "--duck-yellow": "#D97757",
      "--duck-gold": "#788C5D",
      "--duck-beak": "#D97757"
    },
    swatches: [
      { name: "Alabaster", hex: "#FAF9F5" },
      { name: "Terracotta", hex: "#D97757" },
      { name: "Editorial Sage", hex: "#788C5D" },
      { name: "Warm Ink", hex: "#141413" }
    ],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="22" fill="#FAF9F5" stroke="#141413" stroke-width="2"/><circle cx="62" cy="32" r="12" fill="#D97757" opacity="0.22"/><path d="M18 78 Q35 73 52 78 T84 78" fill="none" stroke="#788C5D" stroke-width="2.5" stroke-linecap="round"/><path d="M22 41 Q11 42 15 48 Q24 50 28 45 Z" fill="#D97757" stroke="#141413" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="54" cy="61" rx="25" ry="18" fill="#FFD000" stroke="#141413" stroke-width="2.4"/><circle cx="38" cy="40" r="16.5" fill="#FFD000" stroke="#141413" stroke-width="2.4"/><path d="M44 58 Q55 51 66 60 Q55 70 44 66 Z" fill="#FAF9F5" stroke="#141413" stroke-width="2.2" stroke-linejoin="round"/><circle cx="34" cy="37" r="3" fill="#141413"/></svg>`
  },
  {
    id: "option-3",
    number: "OPTION 03 · SWISS FLAT GRID",
    name: "Swiss Bauhaus",
    tagline: "International Yellow, Signal Orange & Pure Carbon Geometry",
    svgFile: "assets/logos/concept-3-swiss-bauhaus.svg",
    rationale:
      "Constructs the Rubber Ducky from pure mathematical primitives (a 16px circle head, a 28px semicircle torso, and a negative-space quarter-circle wing) on a high-impact International Yellow (#FFD000) canvas.",
    typography: "Inter Tight Black + Space Mono",
    showcaseStyle: "SWISS FLAT (High Contrast)",
    themeVars: {
      "--duck-yellow": "#FFD000",
      "--duck-gold": "#FF5500",
      "--duck-beak": "#FF5500"
    },
    swatches: [
      { name: "Signal Yellow", hex: "#FFD000" },
      { name: "Bauhaus Carbon", hex: "#0A0A0A" },
      { name: "Intl Orange", hex: "#FF5500" },
      { name: "Grid White", hex: "#FFFFFF" }
    ],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="22" fill="#FFD000"/><line x1="4" y1="50" x2="96" y2="50" stroke="#0A0A0A" stroke-opacity="0.1" stroke-width="1"/><line x1="50" y1="4" x2="50" y2="96" stroke="#0A0A0A" stroke-opacity="0.1" stroke-width="1"/><rect x="13" y="36" width="18" height="9" rx="4.5" fill="#FF5500"/><path d="M26 52 A28 28 0 0 0 82 52 Z" fill="#0A0A0A"/><circle cx="38" cy="38" r="16" fill="#0A0A0A"/><path d="M44 56 A14 14 0 0 0 72 56 Z" fill="#FFD000"/><circle cx="34" cy="35" r="3.5" fill="#FFFFFF"/><circle cx="76" cy="26" r="5" fill="#FF5500"/></svg>`
  },
  {
    id: "option-4",
    number: "OPTION 04 · HARDWARE WAVEFORM",
    name: "LPU Cyber-Matrix",
    tagline: "60fps Acoustic Capsule Bars · Groq LPU Silicon Aesthetic",
    svgFile: "assets/logos/concept-4-lpu-matrix.svg",
    rationale:
      "Uses the Capsule Dot-Matrix pattern from logo-generator: 6 vertical frequency bars dynamically sculpt the Rubber Ducky silhouette while doubling as a live equalizer visualization.",
    typography: "JetBrains Mono + Space Grotesk",
    showcaseStyle: "LED MATRIX (Digital Hardware)",
    themeVars: {
      "--duck-yellow": "#00F5D4",
      "--duck-gold": "#FFD000",
      "--duck-beak": "#FF6B00"
    },
    swatches: [
      { name: "Matrix Gold", hex: "#FFD000" },
      { name: "LPU Cyan", hex: "#00F5D4" },
      { name: "Pulse Orange", hex: "#FF6B00" },
      { name: "Silicon Void", hex: "#06080E" }
    ],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="22" fill="#06080E" stroke="#38BDF8" stroke-opacity="0.35" stroke-width="1.5"/><g fill="#1E293B"><circle cx="20" cy="20" r="1.2"/><circle cx="35" cy="20" r="1.2"/><circle cx="50" cy="20" r="1.2"/><circle cx="65" cy="20" r="1.2"/><circle cx="80" cy="20" r="1.2"/><circle cx="20" cy="80" r="1.2"/><circle cx="35" cy="80" r="1.2"/><circle cx="50" cy="80" r="1.2"/><circle cx="65" cy="80" r="1.2"/><circle cx="80" cy="80" r="1.2"/></g><rect x="13" y="38" width="13" height="6" rx="3" fill="#FF6B00"/><rect x="27" y="26" width="6" height="44" rx="3" fill="#FFD000"/><rect x="36" y="21" width="6" height="54" rx="3" fill="#FFD000"/><rect x="45" y="25" width="6" height="52" rx="3" fill="#FFD000"/><rect x="54" y="44" width="6" height="33" rx="3" fill="#F59E0B"/><rect x="63" y="46" width="6" height="29" rx="3" fill="#F59E0B"/><rect x="72" y="42" width="6" height="26" rx="3" fill="#FFD000"/><circle cx="39" cy="33" r="3.5" fill="#06080E"/><circle cx="39" cy="33" r="2" fill="#00F5D4"/><rect x="81" y="48" width="4" height="14" rx="2" fill="#00F5D4"/></svg>`
  },
  {
    id: "option-5",
    number: "OPTION 05 · APPLE VISION GLASS",
    name: "Iridescent Frosted Glass",
    tagline: "Titanium Silver, Translucent Glass Wing & Warm Amber",
    svgFile: "assets/logos/concept-5-iridescent-glass.svg",
    rationale:
      "Designed for macOS Sequoia & visionOS lovers. Features a sandblasted silver-titanium squircle with holographic indigo/amber light refraction and a frosted glass wing overlay.",
    typography: "SF Pro Rounded + SF Mono",
    showcaseStyle: "IRIDESCENT FROST (Optical)",
    themeVars: {
      "--duck-yellow": "#F59E0B",
      "--duck-gold": "#6366F1",
      "--duck-beak": "#EA580C"
    },
    swatches: [
      { name: "Solar Amber", hex: "#F59E0B" },
      { name: "Frost Titanium", hex: "#E2E8F0" },
      { name: "Optical Indigo", hex: "#6366F1" },
      { name: "Deep Slate", hex: "#0F172A" }
    ],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="c5b" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F8FAFC"/><stop offset="50%" stop-color="#E2E8F0"/><stop offset="100%" stop-color="#CBD5E1"/></linearGradient><linearGradient id="c5d" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE033"/><stop offset="60%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#EA580C"/></linearGradient><linearGradient id="c5g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.88"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.35"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="22" fill="url(#c5b)" stroke="#FFFFFF" stroke-width="2"/><circle cx="65" cy="35" r="20" fill="#6366F1" opacity="0.18"/><circle cx="35" cy="68" r="22" fill="#F59E0B" opacity="0.22"/><path d="M20 40 Q10 42 14 48 Q23 50 28 45 Z" fill="#EA580C"/><ellipse cx="53" cy="62" rx="26" ry="19" fill="url(#c5d)"/><path d="M74 53 C84 43, 88 47, 78 62 Z" fill="url(#c5d)"/><circle cx="38" cy="40" r="17.5" fill="url(#c5d)"/><path d="M40 56 Q54 46 69 58 Q57 74 40 69 Z" fill="url(#c5g)" stroke="#FFFFFF" stroke-width="1.5"/><circle cx="34" cy="37" r="3.5" fill="#0F172A"/><circle cx="32.8" cy="35.8" r="1.3" fill="#FFFFFF"/></svg>`
  },
  {
    id: "option-6",
    number: "OPTION 06 · BROADCAST EMBLEM",
    name: "Studio Seal Crest",
    tagline: "British Racing Studio Green, Acoustic Ring & Classic Gold",
    svgFile: "assets/logos/concept-6-studio-crest.svg",
    rationale:
      "Applies the Emblem & Concentric Ring pattern from svg-logo-designer. Frames the Rubber Ducky inside a precision dashed acoustic broadcast ring on deep vintage studio green (#0B1F17).",
    typography: "Fraunces Display + Inter",
    showcaseStyle: "STUDIO SPOTLIGHT (Crest)",
    themeVars: {
      "--duck-yellow": "#FFD000",
      "--duck-gold": "#34D399",
      "--duck-beak": "#FF6B00"
    },
    swatches: [
      { name: "Crest Gold", hex: "#FFD000" },
      { name: "Studio Green", hex: "#0B1F17" },
      { name: "Emerald Ring", hex: "#123125" },
      { name: "Beak Coral", hex: "#FF6B00" }
    ],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="22" fill="#0B1F17" stroke="#FFD000" stroke-opacity="0.45" stroke-width="1.5"/><circle cx="50" cy="50" r="36" fill="none" stroke="#FFD000" stroke-width="2" stroke-dasharray="6 4" opacity="0.65"/><circle cx="50" cy="50" r="30" fill="#123125" stroke="#F59E0B" stroke-width="1.5"/><path d="M26 42 Q18 43 21 48 Q28 50 32 46 Z" fill="#FF6B00"/><ellipse cx="53" cy="58" rx="19" ry="14" fill="#FFD000"/><circle cx="40" cy="42" r="13" fill="#FFD000"/><path d="M45 55 Q53 49 63 56 Q54 66 45 63 Z" fill="#F59E0B"/><circle cx="37" cy="39.5" r="2.6" fill="#0B1F17"/><circle cx="36.2" cy="38.7" r="1" fill="#FFFFFF"/></svg>`
  }
];

let selectedBrandKitId = "option-4";
const brandKitRatings = {
  "option-1": 4,
  "option-2": 3,
  "option-3": 4,
  "option-4": 5,
  "option-5": 4,
  "option-6": 3
};

function renderBrandingKitStudio() {
  const dockShelf = document.getElementById("brandkit-dock-shelf");
  const cardsGrid = document.getElementById("brandkit-cards-grid");
  const activeIndicator = document.getElementById("active-kit-indicator");
  const summaryText = document.getElementById("brandkit-rating-summary-text");

  if (!dockShelf || !cardsGrid) return;

  // Render macOS Dock Preview Shelf
  dockShelf.innerHTML = BRANDING_KIT_OPTIONS.map((opt, idx) => {
    const isAct = opt.id === selectedBrandKitId;
    return `
      <button type="button" class="dock-app-item ${isAct ? "active" : ""}" data-select-kit="${opt.id}">
        <div class="dock-icon-frame">${opt.svgMarkup}</div>
        <span class="dock-app-label">Option 0${idx + 1}</span>
        <span class="dock-active-dot"></span>
      </button>
    `;
  }).join("");

  // Render 6 Detailed Branding Kit Cards
  cardsGrid.innerHTML = BRANDING_KIT_OPTIONS.map((opt) => {
    const isAct = opt.id === selectedBrandKitId;
    const rating = brandKitRatings[opt.id] || 0;
    const starsHtml = [1, 2, 3, 4, 5]
      .map(
        (star) =>
          `<button type="button" class="star-btn ${star <= rating ? "filled" : ""}" data-rate-kit="${opt.id}" data-star="${star}" aria-label="Rate ${opt.name} ${star} stars">★</button>`
      )
      .join("");

    const swatchesHtml = opt.swatches
      .map(
        (s) => `
        <div class="bk-swatch-chip">
          <span class="bk-swatch-color" style="background:${s.hex};"></span>
          <div class="bk-swatch-meta">
            <span class="bk-swatch-name">${s.name}</span>
            <span class="bk-swatch-hex">${s.hex}</span>
          </div>
        </div>
      `
      )
      .join("");

    return `
      <article class="brandkit-card ${isAct ? "is-selected" : ""}" id="card-${opt.id}">
        <div class="bk-card-top">
          <div class="bk-identity-lockup">
            <div class="bk-svg-preview">${opt.svgMarkup}</div>
            <div>
              <span class="bk-option-kicker">${opt.number}</span>
              <h3>${opt.name}</h3>
              <span class="bk-tagline">${opt.tagline}</span>
            </div>
          </div>

          <div class="bk-star-widget">
            <div class="star-buttons-row">${starsHtml}</div>
            <span class="star-score-label">${rating > 0 ? `Rated ${rating}/5 ★` : "Click to rate"}</span>
          </div>
        </div>

        <p class="bk-rationale">${opt.rationale}</p>

        <div class="bk-swatches-row">${swatchesHtml}</div>

        <div class="bk-meta-specs">
          <span><strong>Typography:</strong> ${opt.typography}</span>
          <span><strong>Showcase Style:</strong> ${opt.showcaseStyle}</span>
        </div>

        <div class="bk-actions-row">
          <button type="button" class="btn-secondary-glass" data-apply-kit="${opt.id}">
            ${isAct ? "✓ Applied to Live Preview" : "Preview Icon & Theme Live"}
          </button>
          <a href="${opt.svgFile}" download class="film-dl-link">⬇ Download SVG</a>
        </div>
      </article>
    `;
  }).join("");

  const currentOpt = BRANDING_KIT_OPTIONS.find((o) => o.id === selectedBrandKitId);
  if (activeIndicator && currentOpt) {
    activeIndicator.textContent = `Currently Previewing: ${currentOpt.name}`;
  }

  // Update Ratings Summary Text
  if (summaryText) {
    const ratedList = BRANDING_KIT_OPTIONS.filter((o) => brandKitRatings[o.id] > 0)
      .sort((a, b) => brandKitRatings[b.id] - brandKitRatings[a.id])
      .map((o) => `${o.name} (${brandKitRatings[o.id]}/5 ★)`);
    summaryText.textContent =
      ratedList.length > 0
        ? `Your Current Rankings: ${ratedList.join("  ·  ")}`
        : "Click the stars (★) on any option above to rate it from 1 to 5.";
  }

  // Bind events
  dockShelf.querySelectorAll("[data-select-kit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrandKitLive(btn.dataset.selectKit);
    });
  });

  cardsGrid.querySelectorAll("[data-apply-kit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrandKitLive(btn.dataset.applyKit);
    });
  });

  cardsGrid.querySelectorAll("[data-rate-kit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kitId = btn.dataset.rateKit;
      const star = Number(btn.dataset.star);
      brandKitRatings[kitId] = star;
      renderBrandingKitStudio();
    });
  });
}

function applyBrandKitLive(kitId) {
  selectedBrandKitId = kitId;
  const opt = BRANDING_KIT_OPTIONS.find((o) => o.id === kitId);
  if (opt) {
    Object.entries(opt.themeVars).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v);
    });
    const navDuck = document.getElementById("nav-duck-svg");
    const replicaDuck = document.getElementById("replica-sidebar-duck");
    if (navDuck) navDuck.innerHTML = opt.svgMarkup;
    if (replicaDuck) replicaDuck.innerHTML = opt.svgMarkup;
  }
  renderBrandingKitStudio();
}

// =========================================================================
// 5. MULTI-VIEW NAVIGATION SWITCHER (Overview / BrandKit / Playground / Films / Pricing)
// =========================================================================
function switchView(viewName) {
  const views = ["landing", "brandkit", "playground", "films", "pricing"];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === viewName) {
        el.hidden = false;
        el.classList.add("active");
      } else {
        el.hidden = true;
        el.classList.remove("active");
      }
    }
  });

  document.querySelectorAll(".view-tab").forEach((tab) => {
    const active = tab.dataset.view === viewName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (window.ScrollTrigger) {
    setTimeout(() => window.ScrollTrigger.refresh(), 100);
  }
}

// =========================================================================
// 6. CINEMATIC SCROLL STORYTELLING (Lenis + GSAP Split-Text + Sticky Stack)
// =========================================================================
function initCinematicScroll() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced || typeof gsap === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  // Initialize Lenis Smooth Scroll
  if (typeof Lenis !== "undefined") {
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  // Sticky Card Stack depth scaling (from cinematic-scroll-storytelling SKILL.md)
  const cards = gsap.utils.toArray(".sticky-mode-card");
  cards.forEach((card, i) => {
    if (i === cards.length - 1) return;
    gsap.to(card, {
      scale: 0.94,
      opacity: 0.55,
      ease: "none",
      scrollTrigger: {
        trigger: cards[i + 1],
        start: "top bottom",
        end: "top 120px",
        scrub: true
      }
    });
  });
}

// =========================================================================
// 7. INITIALIZE ALL EVENT LISTENERS ON DOM READY
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  mountAllDuckIcons();
  renderStudioMode("smart_polish", false);
  renderTargetWindow("cursor");
  renderReplicaHistory();
  renderDictionaries();
  applyBrandKitLive("option-4");
  initCinematicScroll();

  const copyRatingsBtn = document.getElementById("copy-ratings-btn");
  if (copyRatingsBtn) {
    copyRatingsBtn.addEventListener("click", () => {
      const summary = BRANDING_KIT_OPTIONS.map(
        (o) => `${o.name}: ${brandKitRatings[o.id] || 0}/5 stars`
      ).join("\n");
      navigator.clipboard?.writeText(summary);
      copyRatingsBtn.textContent = "Copied Ratings Summary! ✓";
      setTimeout(() => {
        copyRatingsBtn.textContent = "Copy My Ratings Summary";
      }, 1800);
    });
  }

  // Mode chips in Hero Live Studio
  document.querySelectorAll(".mode-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderStudioMode(btn.dataset.sample, true);
    });
  });

  // Push-to-talk simulation triggers
  const pttBtn = document.getElementById("studio-ptt-btn");
  const floatingPill = document.getElementById("floating-ducky-pill");
  const replicaTrigger = document.getElementById("replica-trigger-dictation");

  if (pttBtn) {
    pttBtn.addEventListener("click", () => {
      renderStudioMode(currentStudioMode, true);
    });
  }
  if (floatingPill) {
    floatingPill.addEventListener("click", () => {
      renderStudioMode(currentStudioMode, true);
    });
  }
  if (replicaTrigger) {
    replicaTrigger.addEventListener("click", () => {
      renderStudioMode(currentStudioMode, true);
    });
  }

  // Global Spacebar Push-to-Talk simulation (when not typing in an input/textarea)
  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      renderStudioMode(currentStudioMode, true);
    }
  });

  // Copy Clean Output button
  const copyCleanBtn = document.getElementById("copy-clean-output");
  if (copyCleanBtn) {
    copyCleanBtn.addEventListener("click", () => {
      const text = document.getElementById("live-clean-box")?.textContent || "";
      navigator.clipboard?.writeText(text);
      copyCleanBtn.textContent = "Copied! ✓";
      setTimeout(() => {
        copyCleanBtn.textContent = "Copy Output";
      }, 1600);
    });
  }

  // Hardware Stage Target Window Switcher
  document.querySelectorAll(".context-target-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderTargetWindow(btn.dataset.targetWindow);
    });
  });

  // View Switcher Tabs & Navigation Buttons
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchView(tab.dataset.view);
    });
  });

  document.querySelectorAll("[data-open-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.openView);
    });
  });

  const watchFilmBtn = document.getElementById("hero-watch-film-btn");
  if (watchFilmBtn) {
    watchFilmBtn.addEventListener("click", () => {
      switchView("films");
    });
  }

  // Interactive Desktop Replica Sidebar Tabs
  document.querySelectorAll(".replica-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.replicaTab;
      document.querySelectorAll(".replica-nav-btn").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      ["home", "modes", "dictionary", "settings"].forEach((t) => {
        const panel = document.getElementById(`replica-tab-${t}`);
        if (panel) panel.hidden = t !== targetTab;
      });
    });
  });

  // Interactive Desktop Replica Mode Selector
  document.querySelectorAll(".rep-mode-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".rep-mode-item").forEach((i) =>
        i.classList.toggle("active", i === item)
      );
      renderStudioMode(item.dataset.repMode, true);
    });
  });

  // Dictionary Forms (Landing + Replica)
  const landingDictForm = document.getElementById("landing-dict-form");
  if (landingDictForm) {
    landingDictForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("landing-dict-input");
      const val = input?.value.trim();
      if (val && !DICTIONARY_WORDS.includes(val)) {
        DICTIONARY_WORDS.push(val);
        renderDictionaries();
        input.value = "";
      }
    });
  }

  const repDictForm = document.getElementById("rep-dict-form");
  if (repDictForm) {
    repDictForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("rep-dict-input");
      const val = input?.value.trim();
      if (val && !DICTIONARY_WORDS.includes(val)) {
        DICTIONARY_WORDS.push(val);
        renderDictionaries();
        input.value = "";
      }
    });
  }

  // Settings Engine & Hotkey Selectors in Replica
  const engineSelect = document.getElementById("rep-engine-select");
  if (engineSelect) {
    engineSelect.addEventListener("change", () => {
      const statEngine = document.getElementById("rep-stat-engine");
      const hudBadge = document.getElementById("hud-engine-badge");
      if (statEngine) statEngine.textContent = engineSelect.value;
      if (hudBadge) {
        hudBadge.textContent =
          engineSelect.value === "Groq LPU" ? "Groq 0.3s" : "OpenAI Cloud";
      }
    });
  }

  const hotkeySelect = document.getElementById("rep-hotkey-select");
  if (hotkeySelect) {
    hotkeySelect.addEventListener("change", () => {
      const activeHk = document.getElementById("replica-active-hotkey");
      if (activeHk) activeHk.textContent = hotkeySelect.value;
    });
  }

  // OS Auto-Detection for Hero CTA
  const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
  const isWindows = /Windows NT/i.test(navigator.userAgent);
  const heroBtn = document.querySelector(".btn-hero-primary");
  if (heroBtn) {
    if (isMac) {
      heroBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.33c.64-.78 1.08-1.86.96-2.94-.93.04-2.06.62-2.72 1.4-.58.68-1.1 1.79-.96 2.84 1.04.08 2.08-.52 2.72-1.3z"/></svg>
        Download for macOS
      `;
    } else if (isWindows) {
      heroBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801"/></svg>
        Download for Windows
      `;
    }
  }

  // Download Sheet Modal
  const modal = document.getElementById("download-modal");
  const closeModalBtn = document.getElementById("close-modal-btn");

  // Dynamic Release CDN Resolution (Localhost uses local files; production uses GitHub Releases CDN)
  const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const macDownloadLink = document.getElementById("dl-mac-btn");
  const winDownloadLink = document.getElementById("dl-win-btn");
  const githubRepo = window.SPEAKLY_GITHUB_REPO || "https://github.com/speakly-ai/speakly";
  const releaseTag = "v1.0.0";

  if (!isLocalHost && macDownloadLink && winDownloadLink) {
    macDownloadLink.href = `${githubRepo}/releases/download/${releaseTag}/Speakly-1.0.0-mac-arm64.dmg`;
    winDownloadLink.href = `${githubRepo}/releases/download/${releaseTag}/Speakly-Setup-1.0.0-win.exe`;
  }

  document.querySelectorAll("[data-open-modal='download']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hidden = false;
    });
  });

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (modal) modal.hidden = true;
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  }

  // Auto-close modal after user clicks download
  document.querySelectorAll(".modal-os-card").forEach((link) => {
    link.addEventListener("click", () => {
      setTimeout(() => {
        if (modal) modal.hidden = true;
      }, 1500);
    });
  });
});
