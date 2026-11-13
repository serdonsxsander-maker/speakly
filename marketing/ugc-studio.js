/* =========================================================================
   SPEAKLY UGC STUDIO & VIDEO CREATOR ENGINE
   - Live Webcam & Microphone 9:16 Recording (MediaRecorder API)
   - Screen Capture Mode (Record live Cursor / Desktop HUD demos)
   - Overlaid Scrolling Teleprompter (Look directly into lens while speaking)
   - AI Cloud Models Generator (Google Veo 3.1, Seedance 2.0, Wan 2.5 via inference.sh)
   - ElevenLabs Developer Voiceover Synthesizer prompts
   ========================================================================= */

let ugcMediaStream = null;
let ugcMediaRecorder = null;
let ugcRecordedChunks = [];
let ugcRecordingTimer = null;
let ugcSecondsElapsed = 0;
let ugcTeleprompterTimer = null;
let ugcCurrentPacingWPM = 158;

// Hook & Script Presets for UGC Ads
const UGC_SCRIPTS_DATABASE = [
  {
    id: "ugc-1",
    wedge: "AI Coding (Cursor)",
    title: "The Silent Mechanical Keyboard Squeak",
    hook: "Stop typing 3 paragraphs into Cursor Composer.",
    visualHook: "Hold smartphone vertically, show keyboard furiously typing, sudden cut to duck squeak.",
    lines: [
      "Stop typing three paragraphs of context into Cursor Composer.",
      "If you're vibe-coding with Claude or Cursor all day, you're spending 40% of your time fixing typos in your prompts.",
      "Watch this: I just hold Right-Command and speak my messy stream-of-consciousness.",
      "'Create a responsive navbar with a glass blur and sticky mobile drawer.'",
      "In 0.29 seconds, Speakly cleans up the fluff and pastes clean code straight into my editor.",
      "Runs on Groq LPUs. Grab free early access at speakly.app."
    ],
    veoPrompt: "A 25-year-old software engineer sitting at a dark modern desk with dual curved monitors, speaking expressively directly into camera in 9:16 vertical format, high quality cinematic lighting, 4k."
  },
  {
    id: "ugc-2",
    wedge: "ADHD / Productivity",
    title: "15-Minute Blank Email Stare",
    hook: "If you have ADHD and get paralyzed writing a single email, watch this.",
    visualHook: "Front camera selfie, looking exasperated at a blank laptop screen.",
    lines: [
      "If you have ADHD and stare at a blank email for 15 minutes, this is for you.",
      "My brain thinks at 200 words a minute, but my fingers only type at 50.",
      "So I get stuck backspacing and rewriting the same first sentence forever.",
      "Now I just hold one hotkey and ramble my raw brain dump: tangents, stutters, everything.",
      "Speakly's AI strips the filler words and instantly pastes a polished, professional message.",
      "Zero typing paralysis. Link is in my bio for Mac and Windows."
    ],
    veoPrompt: "Vertical UGC selfie video of a creator talking to camera in a brightly lit home office, natural gestures, relatable and enthusiastic, ultra-realistic."
  },
  {
    id: "ugc-3",
    wedge: "Benelux / Agency",
    title: "Flemish Tech Jargon Siri Fail 🇧🇪",
    hook: "Waarom faalt Apple Dictation altijd zodra je Vlaams met Engels mixt?",
    visualHook: "Show phone screen with Siri typing nonsense, creator shakes head in disbelief.",
    lines: [
      "Waarom snapt Apple Dictation nooit hoe developers in Vlaanderen praten?",
      "We zeggen allemaal: 'Kun je die PR even mergen en checken of de endpoint up is?'.",
      "Apple dwingt je te kiezen tussen Nederlands of Engels, en maakt er pure soep van.",
      "Speakly switcht automatisch en naadloos tussen Nederlands en Engels vakjargon in 0,29 seconden.",
      "Gebouwd door een solo-dev in België. Vroege toegang is nu gratis op speakly.app."
    ],
    veoPrompt: "Casual Belgian tech founder speaking in front of modern brick loft office in Ghent, speaking directly to camera, 9:16 aspect ratio."
  },
  {
    id: "ugc-4",
    wedge: "Sales & CRM",
    title: "10-Second Post-Call Deal Logging",
    hook: "How top sales reps log 30-minute discovery calls in 10 seconds flat.",
    visualHook: "Clicking 'Leave Zoom Call' $\rightarrow$ deal record open in HubSpot.",
    lines: [
      "Stop wasting 15 minutes typing deal notes after every Zoom call.",
      "The second you hang up, open your CRM, hold one key, and talk out loud for 10 seconds.",
      "Speakly structures your messy debrief into clean bullet points: budget, timeline, and next steps.",
      "It auto-pastes directly into your deal record in 300 milliseconds.",
      "Get back to closing. Speakly early access is open now."
    ],
    veoPrompt: "Professional B2B account executive standing in modern corporate coworking space speaking to camera with tablet in hand, high energy."
  },
  {
    id: "ugc-5",
    wedge: "Developer Ergonomics",
    title: "RSI & Carpal Tunnel Relief",
    hook: "Your wrists weren't built for 10-hour prompt sessions.",
    visualHook: "Close-up of wrists shaking out fatigue, ergonomic split keyboard.",
    lines: [
      "Vibe coding with AI was supposed to make coding faster...",
      "Until your wrists feel like fire at 4 PM from typing 5,000 words of natural language prompts.",
      "Give your hands a rest. Speak your architecture thoughts aloud.",
      "Speakly formats your spoken thoughts into clean code prompts in 0.29s without lifting a hand.",
      "Save your wrists. Link in bio for Mac and Windows."
    ],
    veoPrompt: "Cinematic close-up of developer hands on keyboard with subtle wrist stretching, transitioning to confident engineer speaking to camera."
  }
];

// Initialize Studio
function initUgcStudio() {
  renderUgcScriptSelector();
  loadUgcScript(0);
}

// Render Script Options
function renderUgcScriptSelector() {
  const container = document.getElementById("ugc-script-dropdown");
  if (!container) return;
  container.innerHTML = "";
  UGC_SCRIPTS_DATABASE.forEach((s, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `[${s.wedge}] ${s.title}`;
    container.appendChild(opt);
  });
}

// Load Active Script into Studio
function loadUgcScript(idx) {
  const script = UGC_SCRIPTS_DATABASE[idx];
  if (!script) return;

  const hookDisplay = document.getElementById("ugc-hook-text");
  const linesContainer = document.getElementById("ugc-prompter-track");
  const cloudPromptBox = document.getElementById("cloud-ai-prompt-box");

  if (hookDisplay) hookDisplay.textContent = `"${script.hook}"`;

  if (linesContainer) {
    linesContainer.innerHTML = "";
    script.lines.forEach((line, lIdx) => {
      const p = document.createElement("div");
      p.className = `teleprompter-line ${lIdx === 0 ? 'highlight' : ''}`;
      p.id = `ugc-line-${lIdx}`;
      p.textContent = line;
      linesContainer.appendChild(p);
    });
  }

  // Populate Cloud AI model commands
  if (cloudPromptBox) {
    cloudPromptBox.value = `# 1. Generate Photorealistic Video via inference.sh CLI:\n` +
      `belt app run google/veo-3-1-fast --input '{"prompt": "${script.veoPrompt}"}'\n\n` +
      `# 2. Or Generate UGC Avatar via Seedance 2.0:\n` +
      `belt app run bytedance/seedance-2-0 --input '{"prompt": "${script.veoPrompt}", "duration": 15}'\n\n` +
      `# 3. ElevenLabs Narration Script:\n` +
      `"${script.lines.join(' ')}"`;
  }
}

// Start Live Webcam Feed (9:16 optimized)
async function startLiveCamera() {
  const videoEl = document.getElementById("ugc-live-video");
  const placeholder = document.getElementById("camera-placeholder-msg");
  const btnStart = document.getElementById("btn-camera-toggle");

  if (ugcMediaStream) {
    // Stop camera
    ugcMediaStream.getTracks().forEach(t => t.stop());
    ugcMediaStream = null;
    if (videoEl) videoEl.srcObject = null;
    if (placeholder) placeholder.style.display = "flex";
    if (btnStart) btnStart.textContent = "📷 Enable Camera Preview";
    showOsToast("Camera feed stopped.");
    return;
  }

  try {
    const constraints = {
      video: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        facingMode: "user"
      },
      audio: true
    };

    ugcMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoEl) {
      videoEl.srcObject = ugcMediaStream;
      videoEl.play();
    }
    if (placeholder) placeholder.style.display = "none";
    if (btnStart) btnStart.textContent = "⏹ Disable Camera";
    showOsToast("Camera active: 9:16 vertical capture enabled!");
  } catch (err) {
    console.error("Camera access error:", err);
    // Fallback without vertical constraints
    try {
      ugcMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoEl) {
        videoEl.srcObject = ugcMediaStream;
        videoEl.play();
      }
      if (placeholder) placeholder.style.display = "none";
      if (btnStart) btnStart.textContent = "⏹ Disable Camera";
      showOsToast("Camera connected (Standard resolution).");
    } catch (fallbackErr) {
      showOsToast("Could not access camera/microphone. Check permissions.");
    }
  }
}

// Start Screen Capture Mode (Record Cursor / Desktop App Demo)
async function startScreenCapture() {
  const videoEl = document.getElementById("ugc-live-video");
  const placeholder = document.getElementById("camera-placeholder-msg");
  const btnStart = document.getElementById("btn-camera-toggle");

  try {
    if (ugcMediaStream) {
      ugcMediaStream.getTracks().forEach(t => t.stop());
    }

    ugcMediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: true
    });

    if (videoEl) {
      videoEl.srcObject = ugcMediaStream;
      videoEl.style.transform = "none"; // Don't mirror screen capture
      videoEl.play();
    }
    if (placeholder) placeholder.style.display = "none";
    if (btnStart) btnStart.textContent = "⏹ Stop Screen Share";
    showOsToast("Screen capture active. Switch to Cursor to record demo!");
  } catch (err) {
    console.error("Screen share error:", err);
  }
}

// Toggle In-Browser Recording
function toggleUgcRecording() {
  const recordBtn = document.getElementById("btn-record-main");
  const prompterHud = document.getElementById("ugc-teleprompter-hud");
  const timerBadge = document.getElementById("ugc-recording-timer");
  const previewBox = document.getElementById("recorded-preview-container");

  if (!ugcMediaStream) {
    showOsToast("Please enable camera or screen capture before recording.");
    return;
  }

  if (ugcMediaRecorder && ugcMediaRecorder.state === "recording") {
    // STOP RECORDING
    ugcMediaRecorder.stop();
    clearInterval(ugcRecordingTimer);
    clearInterval(ugcTeleprompterTimer);
    recordBtn.classList.remove("recording");
    if (prompterHud) prompterHud.classList.remove("active");
    showOsToast("Recording finished! Generating MP4/WebM preview...");
  } else {
    // START RECORDING
    ugcRecordedChunks = [];
    const options = { mimeType: "video/webm;codecs=vp9,opus" };

    try {
      ugcMediaRecorder = new MediaRecorder(ugcMediaStream, MediaRecorder.isTypeSupported(options.mimeType) ? options : undefined);
    } catch (e) {
      ugcMediaRecorder = new MediaRecorder(ugcMediaStream);
    }

    ugcMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        ugcRecordedChunks.push(event.data);
      }
    };

    ugcMediaRecorder.onstop = () => {
      const blob = new Blob(ugcRecordedChunks, { type: "video/webm" });
      const videoURL = URL.createObjectURL(blob);
      const downloadBtn = document.getElementById("btn-download-recorded-video");
      const previewVideo = document.getElementById("ugc-recorded-playback");

      if (previewVideo) {
        previewVideo.src = videoURL;
      }
      if (downloadBtn) {
        downloadBtn.onclick = () => {
          const a = document.createElement("a");
          a.href = videoURL;
          a.download = `speakly-ugc-${Date.now()}.webm`;
          a.click();
        };
      }
      if (previewBox) previewBox.style.display = "block";
    };

    ugcMediaRecorder.start(250); // Slice every 250ms
    recordBtn.classList.add("recording");

    // Activate Overlaid Teleprompter on Camera
    if (prompterHud) prompterHud.classList.add("active");

    ugcSecondsElapsed = 0;
    if (timerBadge) timerBadge.textContent = "00:00 (REC)";
    ugcRecordingTimer = setInterval(() => {
      ugcSecondsElapsed++;
      const mins = String(Math.floor(ugcSecondsElapsed / 60)).padStart(2, '0');
      const secs = String(ugcSecondsElapsed % 60).padStart(2, '0');
      if (timerBadge) timerBadge.textContent = `${mins}:${secs} (REC)`;
    }, 1000);

    // Auto-scroll teleprompter lines based on WPM
    scrollTeleprompterTrack();
    showOsToast("🔴 Recording started! Look directly into the camera lens.");
  }
}

// Auto-scroll teleprompter during recording
function scrollTeleprompterTrack() {
  const lines = document.querySelectorAll(".teleprompter-line");
  let currentLineIdx = 0;
  const lineIntervalSec = 3.5; // ~3.5 seconds per punchy line

  ugcTeleprompterTimer = setInterval(() => {
    currentLineIdx++;
    if (currentLineIdx < lines.length) {
      lines.forEach((l, i) => {
        l.classList.toggle("highlight", i === currentLineIdx);
      });
      const track = document.getElementById("ugc-prompter-track");
      if (track) {
        track.style.transform = `translateY(-${currentLineIdx * 32}px)`;
      }
    } else {
      clearInterval(ugcTeleprompterTimer);
    }
  }, lineIntervalSec * 1000);
}

// Copy Cloud AI Generation Prompt
function copyCloudPrompt() {
  const promptBox = document.getElementById("cloud-ai-prompt-box");
  if (!promptBox) return;
  navigator.clipboard.writeText(promptBox.value).then(() => {
    showOsToast("Cloud AI CLI commands & script copied to clipboard!");
  });
}
