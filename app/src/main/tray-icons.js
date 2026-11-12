const zlib = require('zlib');
const { nativeImage } = require('electron');

/**
 * Minimal pure-JS PNG encoder for Speakly Duck Tray & App Icon
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function blendPixel(rgba, idx, r, g, b, alpha) {
  const srcA = Math.max(0, Math.min(1, alpha / 255));
  if (srcA <= 0) return;
  const dstA = rgba[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;

  rgba[idx] = Math.round((r * srcA + rgba[idx] * dstA * (1 - srcA)) / outA);
  rgba[idx + 1] = Math.round((g * srcA + rgba[idx + 1] * dstA * (1 - srcA)) / outA);
  rgba[idx + 2] = Math.round((b * srcA + rgba[idx + 2] * dstA * (1 - srcA)) / outA);
  rgba[idx + 3] = Math.round(outA * 255);
}

function drawCircle(rgba, size, cx, cy, radius, r, g, b, a = 255) {
  for (let y = Math.max(0, Math.floor(cy - radius - 2)); y <= Math.min(size - 1, Math.ceil(cy + radius + 2)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius - 2)); x <= Math.min(size - 1, Math.ceil(cx + radius + 2)); x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - dist));
      if (coverage > 0) {
        const idx = (y * size + x) * 4;
        blendPixel(rgba, idx, r, g, b, a * coverage);
      }
    }
  }
}

function drawEllipse(rgba, size, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let y = Math.max(0, Math.floor(cy - ry - 2)); y <= Math.min(size - 1, Math.ceil(cy + ry + 2)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx - 2)); x <= Math.min(size - 1, Math.ceil(cx + rx + 2)); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = Math.hypot(dx, dy);
      const feather = 1 / Math.max(rx, ry);
      const coverage = Math.max(0, Math.min(1, (1 + feather * 0.6 - dist) / (feather * 1.2)));
      if (coverage > 0) {
        const idx = (y * size + x) * 4;
        blendPixel(rgba, idx, r, g, b, a * coverage);
      }
    }
  }
}

function drawRingArc(rgba, size, cx, cy, radius, thickness, startAngle, endAngle, r, g, b, a = 255) {
  const halfT = thickness / 2;
  const maxR = radius + halfT + 2;
  for (let y = Math.max(0, Math.floor(cy - maxR)); y <= Math.min(size - 1, Math.ceil(cy + maxR)); y++) {
    for (let x = Math.max(0, Math.floor(cx - maxR)); x <= Math.min(size - 1, Math.ceil(cx + maxR)); x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const radialDiff = Math.abs(dist - radius);
      if (radialDiff <= halfT + 1) {
        const angle = Math.atan2(y - cy, x - cx);
        if (angle >= startAngle && angle <= endAngle) {
          const cov = Math.max(0, Math.min(1, halfT + 0.6 - radialDiff));
          const idx = (y * size + x) * 4;
          blendPixel(rgba, idx, r, g, b, a * cov);
        }
      }
    }
  }
}

function drawRoundedRect(rgba, size, x0, y0, w, h, radius, r, g, b, a = 255) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.max(0, Math.floor(y0 - 1)); y <= Math.min(size - 1, Math.ceil(y1 + 1)); y++) {
    for (let x = Math.max(0, Math.floor(x0 - 1)); x <= Math.min(size - 1, Math.ceil(x1 + 1)); x++) {
      const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
      const dist = Math.hypot(dx, dy);
      const cov = Math.max(0, Math.min(1, radius + 0.6 - dist));
      if (cov > 0) {
        const idx = (y * size + x) * 4;
        blendPixel(rgba, idx, r, g, b, a * cov);
      }
    }
  }
}

function createTrayIcon({ recording = false } = {}) {
  const size = 36;
  const rgba = Buffer.alloc(size * size * 4, 0);

  // Cute Little Yellow Duck Silhouette for macOS Menu Bar & Windows Tray
  const duckYellow = recording ? [255, 107, 0] : [255, 208, 0];
  const wingGold = recording ? [230, 85, 0] : [245, 184, 0];
  const beakOrange = [255, 95, 0];

  // Tail
  drawEllipse(rgba, size, 27, 19, 4.5, 3, duckYellow[0], duckYellow[1], duckYellow[2], 255);
  // Body
  drawEllipse(rgba, size, 19, 22, 10.5, 7.5, duckYellow[0], duckYellow[1], duckYellow[2], 255);
  // Wing
  drawEllipse(rgba, size, 20, 22.5, 5.5, 3.6, wingGold[0], wingGold[1], wingGold[2], 255);
  // Beak (drawn behind head edge so it attaches cleanly)
  drawEllipse(rgba, size, 7.2, 14.5, 3.8, 2.2, beakOrange[0], beakOrange[1], beakOrange[2], 255);
  // Head
  drawCircle(rgba, size, 14, 13, 6.8, duckYellow[0], duckYellow[1], duckYellow[2], 255);
  // Eye
  drawCircle(rgba, size, 12.6, 11.8, 1.5, 15, 23, 42, 255);
  drawCircle(rgba, size, 12.1, 11.3, 0.6, 255, 255, 255, 255);

  const pngBuf = encodeRgbaToPng(size, size, rgba);
  const img = nativeImage.createFromBuffer(pngBuf, { scaleFactor: 2.0 });
  return img;
}

function createAppIconPngBuffer(size = 512) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const s = size / 100; // Map SVG 100x100 space to canvas size

  // Option 04 — LPU Cyber-Matrix:
  // Apple standard inset squircle (~82.4% of canvas) leaves room for subtle ambient drop shadow
  const sqX0 = 8.8 * s;
  const sqY0 = 8.8 * s;
  const sqW = 82.4 * s;
  const sqH = 82.4 * s;
  const sqR = 19.5 * s;

  // 1. Soft Floor Shadow & Ambient Cyan Underglow
  drawRoundedRect(rgba, size, sqX0, sqY0 + 2.5 * s, sqW, sqH, sqR, 0, 0, 0, 110);
  drawRoundedRect(rgba, size, sqX0 - 0.5 * s, sqY0 + 1.2 * s, sqW + 1.0 * s, sqH + 2.0 * s, sqR, 0, 245, 212, 35);

  // 2. Silicon Void Squircle Canvas (#06080E)
  drawRoundedRect(rgba, size, sqX0, sqY0, sqW, sqH, sqR, 6, 8, 14, 255);

  // Border Rim (#38BDF8, ~35% opacity)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(sqR - (x - sqX0), 0, (x - sqX0) - (sqW - sqR));
      const dy = Math.max(sqR - (y - sqY0), 0, (y - sqY0) - (sqH - sqR));
      const dist = Math.hypot(dx, dy);
      const borderDist = Math.abs(dist - sqR);
      if (dx > 0 || dy > 0 ? borderDist < 1.4 * s : (Math.abs(x - sqX0) < 1.4 * s || Math.abs(x - (sqX0 + sqW)) < 1.4 * s || Math.abs(y - sqY0) < 1.4 * s || Math.abs(y - (sqY0 + sqH)) < 1.4 * s)) {
        const idx = (y * size + x) * 4;
        blendPixel(rgba, idx, 56, 189, 248, 90);
      }
    }
  }

  // Coordinate helper mapping SVG [4..96] to [sqX0 .. sqX0 + sqW]
  const mapX = (vx) => sqX0 + ((vx - 4.0) / 92.0) * sqW;
  const mapY = (vy) => sqY0 + ((vy - 4.0) / 92.0) * sqH;
  const mapW = (vw) => (vw / 92.0) * sqW;
  const mapH = (vh) => (vh / 92.0) * sqH;

  // 3. Subtle LED Matrix Grid Dots (#1E293B)
  const dotR = 1.15 * s;
  const dotCols = [20, 35, 50, 65, 80];
  const dotRows = [20, 80];
  for (const gx of dotCols) {
    for (const gy of dotRows) {
      drawCircle(rgba, size, mapX(gx), mapY(gy), dotR, 30, 41, 59, 220);
    }
  }

  // 4. Orange Beak Capsule: x=13, y=38, w=13, h=6, rx=3 (#FF6B00)
  const bx = mapX(13);
  const by = mapY(38);
  const bw = mapW(13);
  const bh = mapH(6);
  drawRoundedRect(rgba, size, bx, by, bw, bh, bh / 2, 255, 107, 0, 255);

  // 5. Vertical Acoustic Frequency Columns (Duck Silhouette)
  const bars = [
    [27, 26, 6, 44, 255, 208, 0],   // Col 1 Gold
    [36, 21, 6, 54, 255, 208, 0],   // Col 2 Gold
    [45, 25, 6, 52, 255, 208, 0],   // Col 3 Gold
    [54, 44, 6, 33, 245, 158, 11],  // Col 4 Amber
    [63, 46, 6, 29, 245, 158, 11],  // Col 5 Amber
    [72, 42, 6, 26, 255, 208, 0]    // Col 6 Gold
  ];
  for (const [vx, vy, vw, vh, r, g, b] of bars) {
    const cx = mapX(vx);
    const cy = mapY(vy);
    const cw = mapW(vw);
    const ch = mapH(vh);
    drawRoundedRect(rgba, size, cx, cy, cw, ch, cw / 2, r, g, b, 255);
  }

  // 6. Cyan LPU Node Eye & Cutout
  // Cutout ring cx=39, cy=33, r=3.5 (#06080E)
  // Inner cyan node cx=39, cy=33, r=2.0 (#00F5D4)
  const ecx = mapX(39);
  const ecy = mapY(33);
  drawCircle(rgba, size, ecx, ecy, mapW(3.5), 6, 8, 14, 255);
  drawCircle(rgba, size, ecx, ecy, mapW(2.0), 0, 245, 212, 255);

  // 7. Live Waveform Pulse Right: x=81, y=48, w=4, h=14, rx=2 (#00F5D4)
  const px = mapX(81);
  const py = mapY(48);
  const pw = mapW(4);
  const ph = mapH(14);
  drawRoundedRect(rgba, size, px, py, pw, ph, pw / 2, 0, 245, 212, 255);

  return encodeRgbaToPng(size, size, rgba);
}

module.exports = {
  createTrayIcon,
  createAppIconPngBuffer
};
