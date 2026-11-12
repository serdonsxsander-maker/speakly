(() => {
  const pillEl = document.getElementById('pill');
  const viewIdle = pillEl.querySelector('.view-idle');
  const viewRecording = pillEl.querySelector('.view-recording');
  const viewProcessing = pillEl.querySelector('.view-processing');
  const viewToast = pillEl.querySelector('.view-toast');

  const cancelRecBtn = document.getElementById('cancel-rec-btn');
  const toastTitleEl = document.getElementById('toast-title');
  const toastTextEl = document.getElementById('toast-text');
  const bars = Array.from(document.querySelectorAll('#waveform .bar'));

  let audioCtx = null;
  let mediaStream = null;
  let sourceNode = null;
  let analyserNode = null;
  let processorNode = null;
  let pcmChunks = [];
  let inputSampleRate = 48000;
  let recordingStartMs = 0;
  let rmsPeak = 0;
  let rafId = null;
  let toastTimeout = null;
  let isCapturing = false;
  let stopRequestedDuringInit = false;

  function setView(stateName) {
    if (toastTimeout && stateName !== 'toast') {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    pillEl.className = `pill state-${stateName}`;
    pillEl.dataset.state = stateName;
    viewIdle.hidden = stateName !== 'idle';
    viewRecording.hidden = stateName !== 'recording';
    viewProcessing.hidden = stateName !== 'processing';
    viewToast.hidden = stateName !== 'toast';
  }

  function playChime(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // friendly rubber ducky chirp tone!

      if (type === 'start') {
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.11);
      } else {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.08);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.11);
      }

      setTimeout(() => ctx.close().catch(() => {}), 240);
    } catch {
      // Audio synth optional
    }
  }

  function downsampleBuffer(buffer, inRate, outRate) {
    if (outRate >= inRate) return buffer;
    const ratio = inRate / outRate;
    const newLen = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLen);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  let currentSensitivity = 'high';

  function encodeWav16kMono(chunks, inRate, sensitivity = 'high') {
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    if (totalLen === 0) return new ArrayBuffer(0);

    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    const targetRate = 16000;
    const rawSamples = downsampleBuffer(merged, inRate, targetRate);

    // Smart Peak Detection
    let maxAbs = 0;
    for (let i = 0; i < rawSamples.length; i++) {
      const a = Math.abs(rawSamples[i]);
      if (a > maxAbs) maxAbs = a;
    }

    // Trim leading & trailing silence (keeping 220ms pad) so Whisper never hallucinates during dead air
    let samples = rawSamples;
    if (maxAbs > 0.0002 && rawSamples.length > targetRate * 0.6) {
      const silenceGate = Math.max(0.0003, maxAbs * 0.035);
      const padSamples = Math.round(targetRate * 0.22); // 220ms padding
      let firstActive = 0;
      let lastActive = rawSamples.length - 1;

      while (firstActive < rawSamples.length && Math.abs(rawSamples[firstActive]) < silenceGate) {
        firstActive++;
      }
      while (lastActive > firstActive && Math.abs(rawSamples[lastActive]) < silenceGate) {
        lastActive--;
      }

      const startIdx = Math.max(0, firstActive - padSamples);
      const endIdx = Math.min(rawSamples.length, lastActive + padSamples);
      if (endIdx - startIdx >= Math.round(targetRate * 0.25)) {
        samples = rawSamples.subarray(startIdx, endIdx);
      }
    }

    // Smart Peak Normalization (Auto-Gain Boost for distant / quiet voices)
    const maxBoost = sensitivity === 'high' ? 18.0 : sensitivity === 'low' ? 4.0 : 10.0;
    const normGain = maxAbs > 0.00015 && maxAbs < 0.85 ? Math.min(maxBoost, 0.85 / maxAbs) : 1.0;

    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeStr = (pos, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(pos + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let bytePos = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i] * normGain));
      view.setInt16(bytePos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      bytePos += 2;
    }

    return buffer;
  }

  function updateWaveformLoop() {
    if (!isCapturing || !analyserNode) return;
    const freqData = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(freqData);

    const bands = [3, 6, 11, 6, 3];
    for (let i = 0; i < bands.length; i++) {
      const raw = freqData[bands[i]] || 0;
      const normalized = Math.min(1, Math.max(0.18, (raw / 220) ** 1.15));
      if (bars[i]) {
        bars[i].style.setProperty('--bar-level', normalized.toFixed(3));
      }
    }

    rafId = requestAnimationFrame(updateWaveformLoop);
  }

  async function cleanupAudioGraph() {
    isCapturing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (processorNode) {
      try {
        processorNode.disconnect();
        processorNode.onaudioprocess = null;
      } catch {}
      processorNode = null;
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {}
      sourceNode = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (audioCtx) {
      try {
        await audioCtx.close();
      } catch {}
      audioCtx = null;
    }
  }

  async function startCapture(opts = {}) {
    // 1. Show the rubber ducky Listening view and play chime IMMEDIATELY (0ms UI delay!)
    // while strictly only activating the hardware microphone on button press for privacy!
    stopRequestedDuringInit = false;
    currentSensitivity = opts.micSensitivity || 'high';
    await cleanupAudioGraph();
    pcmChunks = [];
    rmsPeak = 0;
    setView('recording');
    if (opts.audioFeedback !== false) {
      playChime('start');
    }

    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch {
        try {
          // Robust fallback 1: basic audio constraint
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (fallbackErr) {
          // Robust fallback 2: If macOS Continuity Camera (iPhone mic) or stale default device caused
          // "Requested device not found", enumerate all audioinput devices and pick the built-in mic!
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
            // Sort built-in MacBook / system mics ahead of sleeping iPhone Continuity mics
            mics.sort((a, b) => {
              const aIphone = /iphone|ipad|continuity/i.test(a.label || '') ? 1 : 0;
              const bIphone = /iphone|ipad|continuity/i.test(b.label || '') ? 1 : 0;
              return aIphone - bIphone;
            });
            for (const mic of mics) {
              try {
                stream = await navigator.mediaDevices.getUserMedia({
                  audio: { deviceId: { exact: mic.deviceId } }
                });
                if (stream) break;
              } catch {}
            }
          }
          if (!stream) throw fallbackErr;
        }
      }

      // If the user already released the hotkey while macOS/Windows was opening the microphone,
      // immediately close the stream and reset state so it NEVER gets stuck in 'processing'!
      if (stopRequestedDuringInit) {
        stream.getTracks().forEach((t) => t.stop());
        setView('idle');
        window.pillBridge.sendAudioCaptured({ wavBytes: new ArrayBuffer(0), durationSeconds: 0, rmsPeak: 0 });
        return;
      }

      mediaStream = stream;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      inputSampleRate = audioCtx.sampleRate || 48000;
      sourceNode = audioCtx.createMediaStreamSource(mediaStream);

      const preAmpNode = audioCtx.createGain();
      preAmpNode.gain.value = currentSensitivity === 'high' ? 2.4 : currentSensitivity === 'low' ? 1.0 : 1.6;

      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 64;
      analyserNode.smoothingTimeConstant = 0.65;

      processorNode = audioCtx.createScriptProcessor(1024, 1, 1);
      processorNode.onaudioprocess = (event) => {
        if (!isCapturing) return;
        const input = event.inputBuffer.getChannelData(0);
        pcmChunks.push(new Float32Array(input));

        let sumSq = 0;
        for (let i = 0; i < input.length; i += 4) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / (input.length / 4));
        if (rms > rmsPeak) rmsPeak = rms;
      };

      sourceNode.connect(preAmpNode);
      preAmpNode.connect(analyserNode);
      preAmpNode.connect(processorNode);
      processorNode.connect(audioCtx.destination);

      isCapturing = true;
      recordingStartMs = performance.now();
      updateWaveformLoop();
    } catch (err) {
      await cleanupAudioGraph();
      setView('idle');
      window.pillBridge.sendCaptureError(
        err && err.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : err?.message || 'Microphone unavailable'
      );
    }
  }

  async function stopCapture(opts = {}) {
    if (!isCapturing) {
      stopRequestedDuringInit = true;
      await cleanupAudioGraph();
      setView('idle');
      window.pillBridge.sendAudioCaptured({
        wavBytes: new ArrayBuffer(0),
        durationSeconds: 0,
        rmsPeak: 0
      });
      return;
    }
    const durationSeconds = Math.max(0, (performance.now() - recordingStartMs) / 1000);
    const capturedChunks = pcmChunks.slice();
    const capturedRate = inputSampleRate;
    const peak = rmsPeak;
    const sens = opts.micSensitivity || currentSensitivity || 'high';

    await cleanupAudioGraph();

    if (opts.audioFeedback !== false) {
      playChime('stop');
    }

    setView('processing');
    const wavBuffer = encodeWav16kMono(capturedChunks, capturedRate, sens);
    window.pillBridge.sendAudioCaptured({
      wavBytes: wavBuffer,
      durationSeconds,
      rmsPeak: peak
    });
  }

  async function cancelCapture() {
    await cleanupAudioGraph();
    setView('idle');
  }

  function showToast({ kind = 'success', message = 'Done' }) {
    if (kind === 'success') {
      toastTitleEl.textContent = 'Pasted! ✨';
      toastTextEl.textContent = message;
    } else if (kind === 'warning') {
      toastTitleEl.textContent = 'Copied';
      toastTextEl.textContent = message;
    } else if (kind === 'error') {
      toastTitleEl.textContent = 'Oops!';
      toastTextEl.textContent = message;
    } else {
      toastTitleEl.textContent = 'Speakly';
      toastTextEl.textContent = message;
    }

    setView('toast');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      setView('idle');
    }, kind === 'error' ? 2400 : 1500);
  }

  cancelRecBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.pillBridge.cancelRecording();
  });

  pillEl.addEventListener('click', () => {
    if (pillEl.dataset.state === 'idle') {
      window.pillBridge.toggleRecording();
    }
  });

  window.pillBridge.onStartCapture((opts) => {
    startCapture(opts);
  });

  window.pillBridge.onStopCapture((opts) => {
    stopCapture(opts);
  });

  window.pillBridge.onCancelCapture(() => {
    cancelCapture();
  });

  window.pillBridge.onToast((data) => {
    showToast(data);
  });
})();
