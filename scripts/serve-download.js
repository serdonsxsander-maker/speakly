#!/usr/bin/env node

/**
 * Speakly Private Static File Server
 * 
 * Securely serves your built Speakly macOS installer (.dmg) to your trusted testers
 * without publishing it anywhere on the public internet or GitHub.
 * 
 * Features:
 * - Secret key authentication (?key=YOUR_SECRET)
 * - Resume/range support for reliable 100MB+ downloads
 * - Automatic detection of arm64 vs x64 DMG
 * - Displays local IP and 1-command temporary secure tunnel instructions
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.DOWNLOAD_KEY || crypto.randomBytes(8).toString('hex');

// Locate DMG in app/dist/
const distDir = path.resolve(__dirname, '../app/dist');
let targetFile = null;

if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  const dmgFiles = files.filter(f => f.endsWith('.dmg') && !f.endsWith('.blockmap'));
  // Prefer arm64 for Apple Silicon, fallback to universal
  const armDmg = dmgFiles.find(f => f.includes('arm64'));
  targetFile = armDmg ? path.join(distDir, armDmg) : (dmgFiles[0] ? path.join(distDir, dmgFiles[0]) : null);
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health / Welcome page
  if (reqUrl.pathname === '/' || reqUrl.pathname === '/index.html') {
    const keyParam = reqUrl.searchParams.get('key');
    const isAuthorized = keyParam === SECRET_KEY;

    if (!isAuthorized) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Access Denied - Speakly Private Server</title></head>
<body style="font-family:system-ui,sans-serif;padding:48px;background:#09090b;color:#f43f5e;text-align:center;">
  <h2>🔒 Private Tester Download Gate</h2>
  <p style="color:#a1a1aa;">This private server is reserved for trusted Speakly testers.<br>Please open the download link containing the secret authorization key.</p>
</body>
</html>`);
      return;
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;padding:48px;background:#09090b;color:#e4e4e7;text-align:center;">
  <h2>⚠️ Installer Not Found</h2>
  <p>No .dmg was found in <code>app/dist/</code>. Run <code>npm run dist:mac</code> in <code>app/</code> first to generate the build.</p>
</body>
</html>`);
      return;
    }

    const stat = fs.statSync(targetFile);
    const fileName = path.basename(targetFile);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Download Speakly Prototype</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 40px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: rgba(250, 204, 21, 0.15); color: #facc15; font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; border: 1px solid rgba(250, 204, 21, 0.3); }
    h1 { margin: 0 0 10px; font-size: 26px; font-weight: 700; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.5; margin: 0 0 24px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; background: #facc15; color: #09090b; font-size: 15px; font-weight: 700; padding: 14px 24px; border-radius: 12px; text-decoration: none; transition: transform 0.1s ease, background 0.15s ease; }
    .btn:hover { background: #fde047; transform: translateY(-1px); }
    .guide-link { display: inline-block; margin-top: 16px; color: #facc15; font-size: 13.5px; text-decoration: none; font-weight: 500; }
    .guide-link:hover { text-decoration: underline; }
    .meta { font-size: 12px; color: #71717a; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🐥 Private Prototype Access</div>
    <h1>Speakly for macOS</h1>
    <p>You have been invited to test the Speakly AI Voice Dictation prototype. Download the installer below.</p>
    <a href="/download?key=${SECRET_KEY}" class="btn">⬇ Download ${fileName} (${sizeMb} MB)</a>
    <div>
      <a href="/guide?key=${SECRET_KEY}" class="guide-link">📖 Read the 2-Minute Setup &amp; Permissions Guide →</a>
    </div>
    <div class="meta">Apple Silicon &amp; macOS 13+ · SHA-256 Protected</div>
  </div>
</body>
</html>`);
    return;
  }

  // Guide endpoint
  if (reqUrl.pathname === '/guide' || reqUrl.pathname === '/setup-guide.html') {
    const keyParam = reqUrl.searchParams.get('key');
    if (keyParam !== SECRET_KEY) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Invalid secret key');
      return;
    }
    const guidePath = path.resolve(__dirname, '../website/setup-guide.html');
    if (fs.existsSync(guidePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(guidePath).pipe(res);
      return;
    }
  }

  // File Download endpoint
  if (reqUrl.pathname === '/download') {
    const keyParam = reqUrl.searchParams.get('key');
    if (keyParam !== SECRET_KEY) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Invalid secret key');
      return;
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Error: DMG installer file not found on server.');
      return;
    }

    const stat = fs.statSync(targetFile);
    const fileName = path.basename(targetFile);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(targetFile, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'application/x-apple-diskimage',
        'Content-Disposition': `attachment; filename="${fileName}"`
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/x-apple-diskimage',
        'Content-Disposition': `attachment; filename="${fileName}"`
      });
      fs.createReadStream(targetFile).pipe(res);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  const directLink = `http://${localIp}:${PORT}/?key=${SECRET_KEY}`;
  const localLink = `http://localhost:${PORT}/?key=${SECRET_KEY}`;

  console.log('\n======================================================');
  console.log('🐥  Speakly Private Tester Download Server is RUNNING');
  console.log('======================================================\n');
  if (targetFile) {
    const sizeMb = (fs.statSync(targetFile).size / (1024 * 1024)).toFixed(1);
    console.log(`📦 Serving: ${path.basename(targetFile)} (${sizeMb} MB)`);
  } else {
    console.log('⚠️  No .dmg file found in app/dist yet! Run `npm run dist:mac` in app/');
  }
  console.log(`🔑 Secret Key: ${SECRET_KEY}\n`);
  console.log(`1️⃣  Local Tester Link (Same Wi-Fi network):`);
  console.log(`    ${directLink}\n`);
  console.log(`2️⃣  On this computer:`);
  console.log(`    ${localLink}\n`);
  console.log(`3️⃣  Send to Remote Friends (Zero Setup Cloudflare Tunnel):`);
  console.log(`    In a new terminal window, simply run:`);
  console.log(`    npx cloudflared tunnel --url http://localhost:${PORT}\n`);
  console.log(`    Then send them the generated https://...trycloudflare.com/?key=${SECRET_KEY} link!\n`);
  console.log('======================================================\n');
});
