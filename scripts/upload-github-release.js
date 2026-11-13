#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  try {
    const creds = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill', { encoding: 'utf8' });
    const match = creds.match(/password=([^\n]+)/);
    if (match) return match[1].trim();
  } catch (err) {
    console.error('Failed to get token from git credential:', err.message);
  }
  throw new Error('No GitHub token found. Set GITHUB_TOKEN or authenticate via git credential.');
}

const OWNER = 'serdonsxsander-maker';
const REPO = 'speakly';
const TAG = 'v1.0.0';
const DIST_DIR = path.resolve(__dirname, '../app/dist');

const FILES = [
  'Speakly-1.0.0-mac-arm64.dmg',
  'Speakly-1.0.0-mac-x64.dmg',
  'Speakly-Setup-1.0.0-win.exe',
  'Speakly-1.0.0-win-portable.exe',
  'SHA256SUMS.txt'
];

async function main() {
  const token = getGitHubToken();
  console.log(`Authenticated with GitHub as owner: ${OWNER}`);

  const checksumPath = path.join(DIST_DIR, 'SHA256SUMS.txt');
  const checksums = fs.existsSync(checksumPath) ? fs.readFileSync(checksumPath, 'utf8') : '';

  const releasePayload = JSON.stringify({
    tag_name: TAG,
    target_commitish: 'main',
    name: `Speakly ${TAG} (Early Access)`,
    body: `### Speakly ${TAG} Early Access Release

- **High-Speed Voice-to-Text**: Groq LPU transcription (~290ms latency)
- **AI Formatting Engine**: Llama-3.3-70b-versatile prompt polish & grammar cleanup
- **Smart Modes**: Cursor Prompting, Casual Chat, Email, Raw Verbatim
- **Platform Support**: macOS (Apple Silicon + Intel) and Windows (Installer + Portable)

#### Checksums (SHA-256):
\`\`\`
${checksums.trim()}
\`\`\`
`,
    draft: false,
    prerelease: false
  });

  // Check or create release
  let release = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, null, token);
  if (!release || release.message === 'Not Found') {
    console.log(`Creating release ${TAG} on GitHub...`);
    release = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, releasePayload, token);
  } else {
    console.log(`Release ${TAG} already exists (id: ${release.id}).`);
  }

  if (!release.id) {
    throw new Error(`Failed to obtain release: ${JSON.stringify(release)}`);
  }

  console.log(`Release URL: ${release.html_url}`);
  console.log(`Upload URL template: ${release.upload_url}`);

  const existingAssets = release.assets || [];

  for (const filename of FILES) {
    const filePath = path.join(DIST_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`File missing: ${filePath}`);
      continue;
    }

    const stat = fs.statSync(filePath);
    const existing = existingAssets.find(a => a.name === filename);
    if (existing) {
      if (existing.size === stat.size) {
        console.log(`✓ ${filename} already uploaded (${(stat.size / 1024 / 1024).toFixed(1)} MB) - skipping.`);
        continue;
      } else {
        console.log(`Deleting existing mismatched asset ${filename}...`);
        await apiRequest('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, null, token);
      }
    }

    console.log(`Uploading ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);
    await uploadAsset(release.id, filename, filePath, stat.size, token);
    console.log(`✓ Successfully uploaded ${filename}`);
  }

  console.log('\n--- ALL ASSETS UPLOADED SUCCESSFULLY ---');
}

function apiRequest(method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      method: method,
      headers: {
        'User-Agent': 'Speakly-Deployer',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (_) {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function uploadAsset(releaseId, name, filePath, size, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'uploads.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      method: 'POST',
      headers: {
        'User-Agent': 'Speakly-Deployer',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': size
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Asset upload failed (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);

    const stream = fs.createReadStream(filePath);
    stream.pipe(req);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
