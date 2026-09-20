// vision-fovea.js — Think 真·中央凹视觉管线（host 侧）
// 作用：把用户原图在宿主侧真切成「全局 + 高清局部 tile」，作为新的 image part 回灌给视觉模型，
//      突破 ViT 固定 visual-token 预算造成的分辨率墙。纯本地、无网络下载用户图以外的东西。
// 稳定性铁律：本模块任何异常 / Python 缺失 / 超时 / 超限，一律返回 null（fail-open），
//      上层退回原文本式视觉协议，绝不白屏、绝不卡死、绝不阻塞主请求。
import { spawn } from 'node:child_process';
import { promises as fsp, existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = path.resolve(__dirname, '..', 'native', 'vision_fovea.py');
const WORK_ROOT = path.join(os.tmpdir(), 'think-ultra-fovea');

// ---------- 双模型严格隔离的 fovea 强度档（先 Flash、再 Vision、再 Pro 逐级加深）----------
// gridTarget：期望宫格数（自适应宽高比后尽量贴近且不超过 maxTiles）；pyr：中心逼近金字塔边长比例；
// tileMax：每张 tile 长边；quality：jpeg；budgetMs：Python 子进程硬超时；maxBytes：全部 tile dataURI 总字节上限。
export const FOVEA_CAPS = {
  // Flash（V41 原生多模态）：主力读图档，宫格随 vscan 加密、vzoom 给中心逼近，力度拉满
  flash:  { maxTiles: 13, gridTarget: 10, pyr: [0.5, 0.3],  tileMax: 1152, quality: 80, budgetMs: 11000, maxBytes: 11_000_000 },
  // Vision（兼容旧模型名，同 Flash 档）
  vision: { maxTiles: 13, gridTarget: 10, pyr: [0.5, 0.3],  tileMax: 1152, quality: 80, budgetMs: 11000, maxBytes: 11_000_000 },
  // Pro：最深，最密宫格 + 两级中心逼近 + 更高清晰度，烧 token 换极限读准
  pro:    { maxTiles: 16, gridTarget: 13, pyr: [0.5, 0.25], tileMax: 1280, quality: 84, budgetMs: 14000, maxBytes: 14_000_000 },
};

export function foveaGroupOf(modelKey = '') {
  const k = String(modelKey || '').toLowerCase();
  if (/vision|vl|multimodal|-image/i.test(k)) return 'vision';
  if (/pro|reason|max|ultra/i.test(k)) return 'pro';
  if (/flash|turbo|lite|fast/i.test(k)) return 'flash';
  return null; // 非已知模型不擅自 fovea
}

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 依据宽高比把「目标格数」拆成 cols×rows，让每格尽量接近方形；竖图多切行、横图多切列
function gridShape(target, width, height) {
  const t = clampN(Math.round(target), 1, 12);
  const ar = width / height; // >1 横图
  let cols = Math.max(1, Math.round(Math.sqrt(t * ar)));
  let rows = Math.max(1, Math.round(t / cols));
  // 收敛到不超过 target+1
  while (cols * rows > t + 1 && (cols > 1 || rows > 1)) {
    if (cols >= rows && cols > 1) cols--; else if (rows > 1) rows--;
  }
  return { cols: clampN(cols, 1, 5), rows: clampN(rows, 1, 5) };
}

// 视觉杆位 → 在该模型 caps 内微调（不跨模型越界）
export function foveaPlanFor(group, sliders = {}, width = 1024, height = 1024) {
  const cap = FOVEA_CAPS[group];
  if (!cap) return null;
  const vscan = clampN(Number(sliders.vscan ?? sliders.vision ?? 0) || 0, 0, 5);
  const vzoom = clampN(Number(sliders.vzoom ?? 0) || 0, 0, 5);
  // vscan 0..5 把宫格目标从 1（仅全局）拉到 caps.gridTarget
  const density = vscan <= 0 ? 0 : vscan / 5;
  const target = Math.round(1 + (cap.gridTarget - 1) * density);
  const { cols, rows } = density === 0 ? { cols: 1, rows: 1 } : gridShape(target, width, height);
  // vzoom 决定中心逼近级数：0 不给，越高给越多（不超过 caps.pyr 长度）
  const pyrLevels = vzoom <= 0 ? 0 : clampN(Math.ceil((vzoom / 5) * cap.pyr.length + 0.001), 0, cap.pyr.length);
  const pyramid = cap.pyr.slice(0, pyrLevels);
  return {
    cap,
    grid: density === 0 ? null : { cols, rows, overlap: 0.12 },
    pyramid,
    globalTile: true,
    tileMax: cap.tileMax,
    quality: cap.quality,
    // 1 全局 + 宫格 + 金字塔，硬顶 maxTiles（视觉熔断第一层：数量）
    expectedTiles: Math.min(cap.maxTiles, 1 + (density === 0 ? 0 : cols * rows) + pyramid.length),
  };
}

// ---------- 从 agent 最新用户消息抽取图像来源 ----------
export function extractUserImages(agent) {
  const out = [];
  try {
    const events = agent?.session?.events || [];
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev?.type !== 'user/message') continue;
      const content = ev.data?.message?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part) continue;
          if (part.type === 'image_url' && part.image_url) {
            out.push(typeof part.image_url === 'string' ? part.image_url : (part.image_url.url || ''));
          } else if (part.type === 'image' && (part.url || part.source?.url || part.data)) {
            out.push(part.url || part.source?.url || part.data);
          }
        }
      }
      break; // 只看最新一条用户消息
    }
  } catch { /* contained */ }
  return out.filter(Boolean);
}

async function sourceToBuffer(src) {
  if (!src) return null;
  try {
    if (src.startsWith('data:')) {
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(src);
      if (!m) return null;
      return Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
    }
    if (/^https?:\/\//i.test(src)) {
      const ctrl = AbortSignal.timeout(8000);
      const r = await fetch(src, { signal: ctrl });
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    }
    if (existsSync(src)) return fsp.readFile(src);
  } catch { /* contained */ }
  return null;
}

function findPython() {
  const candidates = [process.env.TU_PYTHON, 'python', 'py', 'python3'].filter(Boolean);
  return candidates;
}

function runPython(scriptPath, planPath, budgetMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const tryNext = (idx) => {
      if (idx >= findPython().length) return finish(null);
      const exe = findPython()[idx];
      let stdout = '', stderr = '';
      let child;
      try {
        child = spawn(exe, [scriptPath, planPath], { windowsHide: true });
      } catch { return tryNext(idx + 1); }
      const to = setTimeout(() => { try { child.kill(); } catch { /* */ } finish(null); }, budgetMs);
      child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
      child.on('error', () => { clearTimeout(to); tryNext(idx + 1); });
      child.on('close', (code) => {
        clearTimeout(to);
        if (code !== 0) return tryNext(idx + 1);
        try { const j = JSON.parse(stdout.trim()); finish(j.ok ? j : null); }
        catch { tryNext(idx + 1); }
      });
    };
    tryNext(0);
  });
}

// 结果缓存：同图同 plan 不重复切（省算力、减延迟）。key=图像hash+plan签名
const _cache = new Map();
const CACHE_MAX = 12;

function mimeOf(fmt) { return fmt === 'png' ? 'image/png' : 'image/jpeg'; }

/**
 * 主入口。返回 { parts:[{type:'image_url',image_url:{url:dataURI}}], guide, stats } 或 null。
 * opts: { modelKey, sliders, modules, log }
 */
export async function runFovea(agent, opts = {}) {
  try {
    const group = foveaGroupOf(opts.modelKey);
    if (!group) return null;
    const sources = extractUserImages(agent);
    if (!sources.length) return null;
    const buf = await sourceToBuffer(sources[0]); // 第一幅图（多图场景逐版再扩）
    if (!buf || buf.length < 256) return null;

    // 先用轻量方式读尺寸：交给 Python 算，这里先给占位，plan 的网格需要尺寸 -> 先探测一次
    // 为省一次往返：直接让 Python 第一遍产出时，Node 侧先用 buffer 头解析 PNG/JPEG 宽高
    const dim = sniffSize(buf);
    const plan0 = foveaPlanFor(group, opts.sliders, dim.w, dim.h);
    if (!plan0 || plan0.expectedTiles <= 1) {
      // vscan/vision 全关：不做物理切片（保持零影响）
      return null;
    }

    const imgHash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const planSig = JSON.stringify([group, plan0.grid, plan0.pyramid, plan0.tileMax, plan0.quality]);
    const cacheKey = createHash('sha1').update(imgHash + planSig).digest('hex').slice(0, 16);
    if (_cache.has(cacheKey)) return _cache.get(cacheKey);

    const dir = path.join(WORK_ROOT, cacheKey);
    await fsp.mkdir(dir, { recursive: true });
    const srcPath = path.join(dir, 'source' + guessExt(buf));
    await fsp.writeFile(srcPath, buf);
    const plan = {
      src: srcPath, outDir: path.join(dir, 'tiles'),
      grid: plan0.grid, pyramid: plan0.pyramid, rois: [],
      tileMax: plan0.tileMax, quality: plan0.quality, fmt: 'jpeg', globalTile: plan0.globalTile,
    };
    const planPath = path.join(dir, 'plan.json');
    await fsp.writeFile(planPath, JSON.stringify(plan), 'utf8');
    if (!existsSync(PY_SCRIPT)) { try { opts.log?.warn?.('fovea', 'py script missing'); } catch { /* */ } return null; }

    const man = await runPython(PY_SCRIPT, planPath, plan0.cap.budgetMs);
    if (!man || !Array.isArray(man.tiles) || !man.tiles.length) return null;

    // 熔断第二层：数量硬顶 + 总字节顶（按 global→grid→pyramid 顺序优先保留）
    const order = { global: 0, grid: 1, roi: 2, pyramid: 3 };
    const picked = man.tiles.slice().sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)).slice(0, plan0.cap.maxTiles);
    const parts = [];
    const labels = [];
    let total = 0;
    for (const t of picked) {
      try {
        const tb = await fsp.readFile(t.file);
        total += tb.length;
        if (total > plan0.cap.maxBytes) break;
        const url = 'data:' + mimeOf('jpeg') + ';base64,' + tb.toString('base64');
        parts.push({ type: 'image_url', image_url: { url }, _tuFovea: true });
        labels.push(t.label + '(' + t.bbox.map((n) => n.toFixed(2)).join(',') + ')');
      } catch { /* skip tile */ }
    }
    if (!parts.length) return null;

    const guide = buildGuide(group, picked, man.width, man.height, labels);
    const result = {
      parts, guide,
      stats: { group, tiles: parts.length, dropped: (man.dropped || []).length, srcSize: buf.length, w: man.width, h: man.height },
    };
    if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
    _cache.set(cacheKey, result);
    try { opts.log?.info?.('fovea', group + ' tiles=' + result.stats.tiles + ' src=' + man.width + 'x' + man.height); } catch { /* */ }
    return result;
  } catch { return null; }
}

function buildGuide(group, tiles, W, H, labels) {
  const head = {
    flash: '【Ultra 视觉增强·迅析】已把原图切成下列高清局部（先看 GLOBAL 全局，再逐格核对，每格只报告该格真实可见内容，读不出就明说，禁止用常识脑补）：',
    vision: '【Ultra 中央凹视觉·逐格】下列第一张为全局，其余是按坐标切出并放大的高清局部。请逐格精读：物体/文字/数字/方向/空间关系，跨格同一对象要合并一致；任何读数标注它来自哪一格（label），无格证据的推断标记为“待核”。局部坐标（相对整图，归一化）：',
    pro: '【Ultra 中央凹视觉·深读】下列含全局、宫格高清局部与中心逐级逼近。执行多尺度交叉读数：同一目标在全局与局部读数不一致时，以更高倍率局部为准并记录分歧；逐字誊抄文字/数字/刻度，不确定字符标 ⍰ 绝不猜；最后给“结论—证据格坐标—置信度”三列。局部坐标：',
  }[group] || '';
  return head + '\n' + labels.join('；') + '。（整图分辨率 ' + W + '×' + H + '，局部 tile 已放大到 ViT 舒适尺寸）';
}

// ---- 无第三方依赖的 PNG/JPEG 尺寸嗅探（仅用于规划网格，失败回退方形）----
function sniffSize(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG 扫 marker
      let o = 2;
      while (o < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const m = buf[o + 1];
        if (m >= 0xc0 && m <= 0xc3) { return { w: buf.readUInt16BE(o + 5), h: buf.readUInt16BE(o + 7) }; }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
    if (buf[0] === 0x52 && buf[1] === 0x49) { // WEBP 简易
      const f = buf.toString('ascii', 12, 16);
      if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    }
  } catch { /* */ }
  return { w: 1024, h: 1024 };
}
function guessExt(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return '.webp';
  return '.jpg';
}

export function clearFoveaCache() { _cache.clear(); }
