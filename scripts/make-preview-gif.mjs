#!/usr/bin/env node
// scripts/make-preview-gif.mjs
//
// 从真实的桌宠 webm 素材（VP9 + alpha）生成 docs/preview.gif。
//
// 零依赖、零安装：只用 Node 内置 http 起一个本地服务，把 webm 原样喂给浏览器里的
// <video> + <canvas>，在页面里逐帧 seek / 裁边 / 量化 / 编码成 GIF，再 POST 回来落盘。
// 素材只读（createReadStream），输出只写一个 GIF 文件。
//
// 用法：
//   node scripts/make-preview-gif.mjs
//       自动：扫描整段动画 → 挑「动态最强、首尾最像」的一段 → 按 360px 宽编码 docs/preview.gif
//   node scripts/make-preview-gif.mjs --mode=inspect
//       只扫描并打印各时间段的动态评分，用来手动挑片段
//   node scripts/make-preview-gif.mjs --mode=encode --start=1.2 --dur=2.4 --fps=12
//       跳过自动挑选，按给定参数编码
//
// 参数（都可省略）：
//   --video=<webm 路径>   默认 ~/.dsh/dsh-pet/pet/gpt-animation/雀跃庆祝.webm
//   --out=<gif 路径>      默认 <repo>/docs/preview.gif
//   --width=360           输出宽度，高度按素材比例算
//   --dur=2.4             片段时长（秒）
//   --fps=12              帧率（超体积时会自动降到 10 / 8）
//   --colors=256          GIF 调色板颜色数（超体积时自动降到 160 / 96 / 64）
//   --maxBytes=1572864    体积预算，超过就降档重编
//   --bg=#11161d          GIF 没有 alpha，先铺一层不透明底色（默认接近 GitHub 深色主题）
//   --port=8798           本地服务端口
//
// 仓库里这张 docs/preview.gif 就是这样生成的（想复现或换动作，改这几个参数重跑）：
//   node scripts/make-preview-gif.mjs --mode=encode \
//     --video="$HOME/.dsh/dsh-pet/pet/gpt-animation/雀跃庆祝.webm" --start=3 --dur=2.4 --fps=12
//   → 360x393、29 帧、1,563,839 字节
//
// 跑法：脚本会打印一行 [ready] open http://127.0.0.1:<port>/…，用浏览器打开它，
// 页面自己跑完并把字节 POST 回来；服务端写完文件、打印真实字节数后退出。

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const expandHome = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

const mode = String(opt('mode', 'auto'));
const cfg = {
  mode: ['auto', 'inspect', 'encode'].includes(mode) ? mode : 'auto',
  video: expandHome(String(opt('video', '~/.dsh/dsh-pet/pet/gpt-animation/雀跃庆祝.webm'))),
  out: expandHome(String(opt('out', path.join(repoRoot, 'docs', 'preview.gif')))),
  port: Number(opt('port', 8798)),
  width: Number(opt('width', 360)),
  fps: Number(opt('fps', 12)),
  dur: Number(opt('dur', 2.4)),
  start: opt('start', null) === null ? null : Number(opt('start', 0)),
  colors: Number(opt('colors', 256)),
  maxBytes: Number(opt('maxBytes', 1572864)),
  bg: String(opt('bg', '#11161d')),
};

const PAGE = String.raw`<!doctype html>
<html lang="zh"><meta charset="utf-8"><title>preview gif builder</title>
<style>
  html,body{margin:0;background:#11161d;color:#c9d1d9;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  #log{white-space:pre-wrap;padding:12px;margin:0}
  canvas{display:block;max-width:100%;height:auto;padding:0 12px 12px}
</style>
<pre id="log">booting…</pre>
<canvas id="c"></canvas>
<script type="module">
const cfg = window.__CFG__;
const logEl = document.getElementById('log');
const log = (...parts) => {
  const line = parts.map(String).join(' ');
  logEl.textContent += '\n' + line;
  fetch('/log', { method: 'POST', body: line }).catch(() => {});
};
const post = (url, body) => fetch(url, { method: 'POST', body });

try {
  // gifenc：纯 JS 的 GIF 编码器，按 ESM 从 CDN 加载（不落盘、不装包）
  const { GIFEncoder, quantize, applyPalette } = await import(
    'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js'
  );
  log('gifenc ready');

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = '/video';
  await new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('video error code=' + (video.error && video.error.code))), { once: true });
  });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : cfg.dur;
  log('meta ' + vw + 'x' + vh + ' duration=' + duration.toFixed(3) + 's');

  // seek 到指定时间并等画面真的换过去
  const seekTo = (t) => new Promise((resolve) => {
    const target = Math.min(Math.max(t, 0), Math.max(duration - 0.001, 0));
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = target;
    setTimeout(done, 5000); // 兜底，别卡死
  });

  // 素材带 alpha，GIF 只有 1 位透明：先铺不透明底色再画，避免糊成一团黑边
  const paint = (ctx, dx, dy, dw, dh, crop) => {
    ctx.fillStyle = cfg.bg;
    ctx.fillRect(dx, dy, dw, dh);
    if (crop) ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, dx, dy, dw, dh);
    else ctx.drawImage(video, dx, dy, dw, dh);
  };

  const meanDiff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) {
      s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return s / (a.length / 4) / 3;
  };

  // ---- 1. 低分辨率扫一遍，看哪段动作最明显、首尾最像（便于循环）----
  const HZ = 8;
  const PROBE = 96;
  const probe = document.createElement('canvas');
  probe.width = PROBE;
  probe.height = Math.max(1, Math.round((vh / vw) * PROBE));
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  const samples = [];
  for (let t = 0; t <= Math.max(duration - 1 / HZ, 0); t += 1 / HZ) {
    await seekTo(t);
    pctx.clearRect(0, 0, probe.width, probe.height);
    pctx.drawImage(video, 0, 0, probe.width, probe.height);
    samples.push({ t: Number(t.toFixed(3)), d: pctx.getImageData(0, 0, probe.width, probe.height).data });
  }
  const stepEnergy = [];
  for (let i = 1; i < samples.length; i++) stepEnergy.push(meanDiff(samples[i - 1].d, samples[i].d));
  log('scanned ' + samples.length + ' samples at ' + HZ + 'Hz');

  const win = Math.max(1, Math.round(cfg.dur * HZ));
  const ranked = [];
  for (let i = 0; i + win < samples.length; i++) {
    let energy = 0;
    for (let k = i; k < i + win; k++) energy += stepEnergy[k] ?? 0;
    energy /= win;
    const seam = meanDiff(samples[i].d, samples[i + win].d);
    ranked.push({
      start: samples[i].t,
      energy: Number(energy.toFixed(2)),
      seam: Number(seam.toFixed(2)),
      score: Number((energy - seam * 0.8).toFixed(2)),
    });
  }
  ranked.sort((a, b) => b.energy - a.energy);
  if (cfg.mode === 'inspect') {
    await post('/report', JSON.stringify({
      size: { w: vw, h: vh },
      duration: Number(duration.toFixed(3)),
      window: cfg.dur,
      sampleHz: HZ,
      top: ranked.slice(0, 10),
    }));
    throw new Error('inspect finished');
  }

  // 先按动态强度排序；GIF 会无限循环，所以只在这一批「够动」的候选里挑首尾最接近的
  const poolSize = Math.max(3, Math.ceil(ranked.length * 0.25));
  const pool = ranked.slice(0, poolSize).sort((a, b) => a.seam - b.seam);
  const best = pool[0] || { start: 0, energy: 0, seam: 0 };
  const chosenStart = cfg.start === null ? best.start : cfg.start;
  // --start 指定了起点时，报这一段自己的评分；否则报自动挑中的那一段
  const chosen = ranked.find((r) => Math.abs(r.start - chosenStart) < 1e-6) || best;
  log('windows by energy ' + JSON.stringify(ranked.slice(0, 6)));
  log('picked start=' + chosenStart + 's energy=' + chosen.energy + ' seam=' + chosen.seam
    + ' pool=' + poolSize + (cfg.start === null ? ' (auto)' : ' (--start)'));

  // ---- 2. 在真实分辨率上量出「有内容」的包围盒，裁掉四周空边，主体更大、字节更少 ----
  const frames = Math.max(1, Math.round(cfg.dur * cfg.fps));
  const frameTimes = Array.from({ length: frames }, (_, i) => chosenStart + i / cfg.fps);
  const full = document.createElement('canvas');
  full.width = vw;
  full.height = vh;
  const fctx = full.getContext('2d', { willReadFrequently: true });

  let bx0 = vw, by0 = vh, bx1 = 0, by1 = 0;
  for (const t of frameTimes) {
    await seekTo(t);
    fctx.clearRect(0, 0, vw, vh);
    fctx.drawImage(video, 0, 0);
    const d = fctx.getImageData(0, 0, vw, vh).data;
    for (let y = 0; y < vh; y += 2) {
      for (let x = 0; x < vw; x += 2) {
        if (d[(y * vw + x) * 4 + 3] > 16) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
  }
  const hasContent = bx1 > bx0 && by1 > by0;
  const pad = Math.round(Math.max(vw, vh) * 0.04);
  const crop = hasContent
    ? {
        x: Math.max(0, bx0 - pad),
        y: Math.max(0, by0 - pad),
        w: Math.min(vw, bx1 + pad) - Math.max(0, bx0 - pad),
        h: Math.min(vh, by1 + pad) - Math.max(0, by0 - pad),
      }
    : { x: 0, y: 0, w: vw, h: vh };
  log('content bbox ' + JSON.stringify({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }) + ' -> crop ' + JSON.stringify(crop));

  const W = cfg.width;
  const H = Math.max(1, Math.round((crop.h / crop.w) * W));

  // ---- 3. 逐帧量化编码；超过体积预算就自动降档重来 ----
  const canvas = document.getElementById('c');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const attempts = [{ fps: cfg.fps, colors: cfg.colors }];
  for (const [fps, colors] of [[Math.min(cfg.fps, 10), 192], [Math.min(cfg.fps, 10), 128], [8, 96], [8, 64]]) {
    if (!attempts.some((a) => a.fps === fps && a.colors === colors)) attempts.push({ fps, colors });
  }

  let result = null;
  for (const attempt of attempts) {
    const n = Math.max(1, Math.round(cfg.dur * attempt.fps));
    const gif = GIFEncoder();
    const delay = Math.round(1000 / attempt.fps);
    log('encode ' + W + 'x' + H + ' frames=' + n + ' fps=' + attempt.fps + ' colors=' + attempt.colors);
    for (let i = 0; i < n; i++) {
      await seekTo(chosenStart + i / attempt.fps);
      paint(ctx, 0, 0, W, H, crop);
      const rgba = ctx.getImageData(0, 0, W, H).data;
      const palette = quantize(rgba, attempt.colors, { format: 'rgb565' });
      const index = applyPalette(rgba, palette, 'rgb565');
      gif.writeFrame(index, W, H, { palette, delay, repeat: 0, transparent: false });
    }
    gif.finish();
    const bytes = gif.bytes();
    log('attempt fps=' + attempt.fps + ' colors=' + attempt.colors + ' bytes=' + bytes.length + ' (' + (bytes.length / 1048576).toFixed(2) + ' MiB)');
    result = { bytes, ...attempt, frames: n, W, H };
    if (bytes.length <= cfg.maxBytes) break;
    log('over budget (' + cfg.maxBytes + '), retrying with fewer colors');
  }

  log('RESULT ' + JSON.stringify({
    file: cfg.out,
    source: cfg.video,
    frameSize: { w: result.W, h: result.H },
    frames: result.frames,
    fps: result.fps,
    colors: result.colors,
    delayMs: Math.round(1000 / result.fps),
    startSec: chosenStart,
    durSec: cfg.dur,
    crop,
    bg: cfg.bg,
    bytes: result.bytes.length,
  }));

  await post('/gif', result.bytes);
  log('posted');
} catch (err) {
  const msg = String((err && err.message) || err);
  if (msg === 'inspect finished') { /* 正常收尾 */ }
  else {
    log('FAILED ' + (err && err.stack ? err.stack : msg));
    fetch('/fail', { method: 'POST', body: msg }).catch(() => {});
  }
}
</script>
</html>`;

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

let closing = false;
const finish = (code) => {
  if (closing) return;
  closing = true;
  setTimeout(() => {
    server.close(() => process.exit(code));
    setTimeout(() => process.exit(code), 500);
  }, 150);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${cfg.port}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(PAGE.replace('window.__CFG__', JSON.stringify(cfg)));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/video') {
      // 素材只读；支持 Range，Chrome 逐帧 seek 更稳
      const st = await stat(cfg.video);
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m && m[1] ? Number(m[1]) : 0;
        const end = m && m[2] ? Number(m[2]) : st.size - 1;
        res.writeHead(206, {
          'content-type': 'video/webm',
          'content-length': end - start + 1,
          'content-range': `bytes ${start}-${end}/${st.size}`,
          'accept-ranges': 'bytes',
          'cache-control': 'no-store',
        });
        createReadStream(cfg.video, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'content-type': 'video/webm',
          'content-length': st.size,
          'accept-ranges': 'bytes',
          'cache-control': 'no-store',
        });
        createReadStream(cfg.video).pipe(res);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/log') {
      console.log('[page] ' + (await readBody(req)).toString('utf8'));
      res.end('ok');
      return;
    }

    if (req.method === 'POST' && url.pathname === '/report') {
      console.log('[report] ' + (await readBody(req)).toString('utf8'));
      res.end('ok');
      finish(0);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/fail') {
      console.log('[fail] ' + (await readBody(req)).toString('utf8'));
      res.end('ok');
      finish(1);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/gif') {
      const body = await readBody(req);
      await mkdir(path.dirname(cfg.out), { recursive: true });
      await writeFile(cfg.out, body);
      console.log('[gif] wrote ' + cfg.out + ' bytes=' + body.length);
      res.end('ok');
      finish(0);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  } catch (err) {
    console.error('[server] ' + (err && err.stack ? err.stack : err));
    try {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String((err && err.message) || err));
    } catch {}
    finish(1);
  }
});

// 兜底：页面一直没来（浏览器没开 / CDN 不通）时自己退出，别把终端挂死
setTimeout(() => {
  console.error('[server] timeout: nothing finished within 600s');
  finish(2);
}, 600_000).unref?.();

readFile(cfg.video).then((buf) => {
  console.log('[cfg] video=' + cfg.video);
  console.log('[cfg] videoBytes=' + buf.length + ' mode=' + cfg.mode + ' width=' + cfg.width + ' fps=' + cfg.fps + ' dur=' + cfg.dur + ' start=' + cfg.start + ' colors=' + cfg.colors + ' bg=' + cfg.bg);
  console.log('[cfg] out=' + cfg.out);
  server.listen(cfg.port, '127.0.0.1', () => {
    console.log('[ready] open http://127.0.0.1:' + cfg.port + '/?mode=' + encodeURIComponent(cfg.mode));
  });
}).catch((err) => {
  console.error('[cfg] cannot read video: ' + ((err && err.message) || err));
  process.exit(1);
});

server.on('error', (err) => {
  console.error('[server] ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
