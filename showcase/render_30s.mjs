import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('/Users/xsanderserdons/.npm/_npx/702923228c2ce1e6/node_modules/puppeteer-core');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOWCASE_DIR = '/Users/xsanderserdons/Documents/voice/showcase';

const JOBS = [
  {
    name: '02-remotion-30s',
    htmlPath: path.join(SHOWCASE_DIR, '02-remotion-30s.html'),
    outMp4: path.join(SHOWCASE_DIR, 'videos/02-remotion-30s.mp4'),
    duration: 30,
    fps: 24,
  },
  {
    name: '03-ad-creative-30s',
    htmlPath: path.join(SHOWCASE_DIR, '03-ad-creative-30s.html'),
    outMp4: path.join(SHOWCASE_DIR, 'videos/03-ad-creative-30s.mp4'),
    duration: 30,
    fps: 24,
  },
];

async function renderJob(browser, job) {
  console.log(`\n🎬 Rendering 30s Ad: ${job.name} -> ${job.outMp4}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`file://${job.htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

  const totalFrames = job.duration * job.fps;

  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', String(job.fps),
    '-i', '-',
    '-f', 'lavfi',
    '-i', `sine=frequency=528:sample_rate=44100:duration=${job.duration}`,
    '-filter_complex', '[1:a]volume=0.03,afade=t=in:st=0:d=0.6,afade=t=out:st=28.5:d=1.5[a]',
    '-map', '0:v:0',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',
    '-crf', '21',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    job.outMp4,
  ]);

  let ffmpegErr = '';
  ffmpeg.stderr.on('data', (d) => {
    ffmpegErr += d.toString();
  });

  for (let f = 0; f < totalFrames; f++) {
    const t = f / job.fps;
    await page.evaluate((timeSec) => {
      if (typeof window.setVideoTime === 'function') {
        window.setVideoTime(timeSec);
      }
    }, t);

    const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
    const canWrite = ffmpeg.stdin.write(buf);
    if (!canWrite) {
      await new Promise((r) => ffmpeg.stdin.once('drain', r));
    }
  }

  ffmpeg.stdin.end();
  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${ffmpegErr.slice(-400)}`));
    });
  });

  await page.close();
  console.log(`✅ Completed 30s Ad: ${job.name}`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });

  try {
    for (const job of JOBS) {
      await renderJob(browser, job);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
