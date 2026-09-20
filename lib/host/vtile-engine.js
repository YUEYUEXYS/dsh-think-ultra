// vtile-engine.js — Think 视觉切片·完整引擎
// 独立引擎文件：切片策略库 / 粒度控制 / 区域优先级 / 切片评分 /
// 重叠合并 / 焦点检测 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const TILING_STRATEGIES = [
  { id: 'grid', name: '网格切片', description: '均匀网格划分，适用于整体理解' },
  { id: 'pyramid', name: '金字塔切片', description: '多尺度金字塔，从粗到细逐层聚焦' },
  { id: 'focus', name: '焦点切片', description: '基于显著性检测的焦点区域优先切片' },
  { id: 'sliding', name: '滑动窗口', description: '带重叠的滑动窗口，适用于细节扫描' },
  { id: 'quadrant', name: '象限切片', description: '四象限+中心，适用于构图分析' },
  { id: 'adaptive', name: '自适应切片', description: '根据内容复杂度动态调整切片大小和数量' },
];

export const VTILE_TIERS = {
  light: { label: '轻', tileCount: 4, overlap: 0.1, granularity: 'coarse', tokenBudgetMultiplier: 1.5 },
  medium: { label: '中', tileCount: 9, overlap: 0.2, granularity: 'medium', tokenBudgetMultiplier: 2.5 },
  heavy: { label: '重', tileCount: 16, overlap: 0.3, granularity: 'fine', tokenBudgetMultiplier: 4.0 },
  extreme: { label: '极', tileCount: 25, overlap: 0.4, granularity: 'ultra_fine', tokenBudgetMultiplier: 6.0 },
};

export const REGION_PRIORITY = [
  { id: 'center', name: '中心区域', weight: 1.0, description: '图像中心，通常是主体所在' },
  { id: 'faces', name: '人脸区域', weight: 0.95, description: '检测到的人脸，优先级最高' },
  { id: 'text', name: '文字区域', weight: 0.9, description: '包含文字的区域，需要精确识别' },
  { id: 'high_contrast', name: '高对比度区域', weight: 0.7, description: '边缘、纹理丰富的区域' },
  { id: 'saliency', name: '显著区域', weight: 0.8, description: '视觉显著性高的区域' },
  { id: 'periphery', name: '边缘区域', weight: 0.3, description: '图像边缘，通常是背景' },
];

export class Tile {
  constructor(id, x, y, width, height, strategy, priority = 0.5) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.strategy = strategy;
    this.priority = priority;
    this.description = '';
    this.confidence = 0;
    this.analyzed = false;
    this.overlaps = [];
  }
  get area() { return this.width * this.height; }
  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }
  overlapsWith(other) {
    return !(this.x + this.width < other.x || other.x + other.width < this.x || this.y + this.height < other.y || other.y + other.height < this.y);
  }
  overlapArea(other) {
    const xOverlap = Math.max(0, Math.min(this.x + this.width, other.x + other.width) - Math.max(this.x, other.x));
    const yOverlap = Math.max(0, Math.min(this.y + this.height, other.y + other.height) - Math.max(this.y, other.y));
    return xOverlap * yOverlap;
  }
}

export function generateTiles(strategy, count, imageWidth = 100, imageHeight = 100, overlap = 0.2) {
  const tiles = [];
  let idCounter = 0;
  const st = TILING_STRATEGIES.find((s) => s.id === strategy) || TILING_STRATEGIES[0];
  switch (strategy) {
    case 'grid': {
      const cols = Math.ceil(Math.sqrt(count * (imageWidth / imageHeight)));
      const rows = Math.ceil(count / cols);
      const tw = imageWidth / cols;
      const th = imageHeight / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (tiles.length >= count) break;
          const ox = c > 0 ? tw * overlap * 0.5 : 0;
          const oy = r > 0 ? th * overlap * 0.5 : 0;
          tiles.push(new Tile(++idCounter, c * tw - ox, r * th - oy, tw * (1 + overlap), th * (1 + overlap), 'grid', 0.5));
        }
      }
      break;
    }
    case 'pyramid': {
      const levels = Math.min(3, Math.ceil(Math.log2(count)));
      for (let level = 0; level < levels; level++) {
        const div = Math.pow(2, level);
        const tw = imageWidth / div;
        const th = imageHeight / div;
        for (let r = 0; r < div; r++) {
          for (let c = 0; c < div; c++) {
            if (tiles.length >= count) break;
            tiles.push(new Tile(++idCounter, c * tw, r * th, tw, th, 'pyramid', 1 - level * 0.2));
          }
        }
      }
      break;
    }
    case 'quadrant': {
      const cx = imageWidth / 2, cy = imageHeight / 2;
      const hw = imageWidth / 2, hh = imageHeight / 2;
      tiles.push(new Tile(++idCounter, 0, 0, hw, hh, 'quadrant', 0.6));
      tiles.push(new Tile(++idCounter, hw, 0, hw, hh, 'quadrant', 0.6));
      tiles.push(new Tile(++idCounter, 0, hh, hw, hh, 'quadrant', 0.6));
      tiles.push(new Tile(++idCounter, hw, hh, hw, hh, 'quadrant', 0.6));
      tiles.push(new Tile(++idCounter, cx - hw * 0.3, cy - hh * 0.3, hw * 0.6, hh * 0.6, 'quadrant', 1.0));
      break;
    }
    case 'sliding': {
      const step = Math.max(1, Math.floor(Math.sqrt(count)));
      const tw = imageWidth / step * (1 + overlap);
      const th = imageHeight / step * (1 + overlap);
      for (let r = 0; r < step; r++) {
        for (let c = 0; c < step; c++) {
          if (tiles.length >= count) break;
          tiles.push(new Tile(++idCounter, c * (imageWidth / step), r * (imageHeight / step), tw, th, 'sliding', 0.5));
        }
      }
      break;
    }
    case 'focus':
    case 'adaptive':
    default: {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const tw = imageWidth / cols;
      const th = imageHeight / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (tiles.length >= count) break;
          const distFromCenter = Math.sqrt(Math.pow(c - cols / 2, 2) + Math.pow(r - rows / 2, 2));
          const priority = Math.max(0.3, 1 - distFromCenter / (Math.max(cols, rows) / 2));
          tiles.push(new Tile(++idCounter, c * tw, r * th, tw, th, strategy, priority));
        }
      }
      break;
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i].overlapsWith(tiles[j])) {
        const oa = tiles[i].overlapArea(tiles[j]);
        if (oa > 0) {
          tiles[i].overlaps.push({ tileId: tiles[j].id, area: oa });
          tiles[j].overlaps.push({ tileId: tiles[i].id, area: oa });
        }
      }
    }
  }
  return tiles.sort((a, b) => b.priority - a.priority);
}

export function scoreTile(tile, imageFeatures = {}) {
  if (!tile) return 0;
  let score = tile.priority;
  if (imageFeatures.saliencyMap) {
    const cx = Math.floor(tile.centerX), cy = Math.floor(tile.centerY);
    score += (imageFeatures.saliencyMap[cy]?.[cx] || 0) * 0.3;
  }
  if (imageFeatures.edgeDensity) {
    score += Math.min(0.3, tile.overlaps.length * 0.05);
  }
  if (tile.area > 0.5) score -= 0.1;
  return Math.min(1, Math.max(0, score));
}

export function mergeOverlappingTiles(tiles, threshold = 0.5) {
  const merged = [];
  const used = new Set();
  for (let i = 0; i < tiles.length; i++) {
    if (used.has(tiles[i].id)) continue;
    let current = { ...tiles[i] };
    for (let j = i + 1; j < tiles.length; j++) {
      if (used.has(tiles[j].id)) continue;
      const overlap = current.overlapArea(tiles[j]);
      const minArea = Math.min(current.area, tiles[j].area);
      if (minArea > 0 && overlap / minArea > threshold) {
        const nx = Math.min(current.x, tiles[j].x);
        const ny = Math.min(current.y, tiles[j].y);
        const nw = Math.max(current.x + current.width, tiles[j].x + tiles[j].width) - nx;
        const nh = Math.max(current.y + current.height, tiles[j].y + tiles[j].height) - ny;
        current = new Tile(current.id, nx, ny, nw, nh, current.strategy, Math.max(current.priority, tiles[j].priority));
        used.add(tiles[j].id);
      }
    }
    merged.push(current);
    used.add(tiles[i].id);
  }
  return merged;
}

export function buildTileAnalysisPrompt(tile, imageContext, index, total) {
  return [
    `【Think 视觉切片·区域 ${index}/${total}】`,
    `切片策略：${TILING_STRATEGIES.find((s) => s.id === tile.strategy)?.name || tile.strategy}`,
    `区域坐标：x=${tile.x.toFixed(1)}, y=${tile.y.toFixed(1)}, w=${tile.width.toFixed(1)}, h=${tile.height.toFixed(1)}`,
    `区域优先级：${(tile.priority * 100).toFixed(0)}%`,
    ``,
    `图像整体上下文：${String(imageContext || '').slice(0, 300)}`,
    ``,
    `请详细描述这个区域的内容，包括：`,
    `1. 可见的物体、人物、文字、符号`,
    `2. 颜色、纹理、光影`,
    `3. 与整体图像的关系`,
    `4. 任何异常或值得注意的细节`,
    `5. 对该区域描述的置信度（0-100%）`,
  ].join('\n');
}

export class VTileFuse {
  constructor(options = {}) {
    this.maxTiles = options.maxTiles || 25;
    this.maxAnalysisRounds = options.maxAnalysisRounds || 3;
    this.maxTokenBudget = options.maxTokenBudget || 20000;
    this.tileCount = 0;
    this.analysisCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkTile() {
    if (this.tileCount >= this.maxTiles) { this.trip(`切片数熔断：${this.maxTiles}`); return false; }
    this.tileCount++;
    return true;
  }
  checkAnalysis() {
    if (this.analysisCount >= this.maxAnalysisRounds) { this.trip(`分析轮次熔断：${this.maxAnalysisRounds}`); return false; }
    this.analysisCount++;
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.tileCount = 0; this.analysisCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { tileCount: this.tileCount, maxTiles: this.maxTiles, analysisCount: this.analysisCount, maxAnalysisRounds: this.maxAnalysisRounds, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class VTileStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { imagesAnalyzed: 0, totalTiles: 0, totalMerged: 0, avgConfidence: 0, strategyUsage: {}, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordImage(id, tiles, merged, avgConf, strategy) {
    const s = this.getSession(id);
    s.imagesAnalyzed++;
    s.totalTiles += tiles;
    s.totalMerged += merged;
    s.avgConfidence = (s.avgConfidence * (s.imagesAnalyzed - 1) + avgConf) / s.imagesAnalyzed;
    s.strategyUsage[strategy] = (s.strategyUsage[strategy] || 0) + 1;
  }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    const topStrategies = Object.entries(s.strategyUsage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sid, c]) => { const st = TILING_STRATEGIES.find((x) => x.id === sid); return { name: st?.name || sid, count: c }; });
    return { imagesAnalyzed: s.imagesAnalyzed, totalTiles: s.totalTiles, totalMerged: s.totalMerged, avgConfidence: Math.round(s.avgConfidence * 100) / 100, topStrategies, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class VTileEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = VTILE_TIERS[this.intensity] || VTILE_TIERS.medium;
    this.fuse = new VTileFuse({ maxTiles: this.tier.tileCount });
    this.stats = new VTileStats();
  }
  setIntensity(i) { if (VTILE_TIERS[i]) { this.intensity = i; this.tier = VTILE_TIERS[i]; } }
  async analyze(sessionId, imageContext, imageWidth, imageHeight, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    const strategies = ['grid', 'pyramid', 'focus', 'quadrant', 'sliding', 'adaptive'];
    const strategy = strategies[Math.floor(Math.random() * Math.min(3, strategies.length))];
    const tiles = generateTiles(strategy, this.tier.tileCount, imageWidth, imageHeight, this.tier.overlap);
    const merged = mergeOverlappingTiles(tiles, 0.6);
    const analyzed = [];
    let totalConf = 0;
    for (let i = 0; i < Math.min(merged.length, 8); i++) {
      if (!this.fuse.checkTile()) break;
      if (!this.fuse.checkToken(400)) break;
      const prompt = buildTileAnalysisPrompt(merged[i], imageContext, i + 1, Math.min(merged.length, 8));
      if (typeof steerFn === 'function') {
        try {
          const result = await steerFn(prompt, 'vtile-analyze');
          const text = result?.text || result?.content || '';
          const confMatch = text.match(/置信度[^0-9]*([0-9]+(?:\.[0-9]+)?)/);
          const conf = confMatch ? parseFloat(confMatch[1]) / 100 : 0.6;
          merged[i].description = text.slice(0, 500);
          merged[i].confidence = conf;
          merged[i].analyzed = true;
          totalConf += conf;
          analyzed.push(merged[i]);
        } catch (e) { /* 分析失败不阻断 */ }
      }
    }
    const avgConf = analyzed.length > 0 ? totalConf / analyzed.length : 0;
    this.stats.recordImage(sessionId, tiles.length, merged.length, avgConf, strategy);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, strategy, strategyName: TILING_STRATEGIES.find((s) => s.id === strategy)?.name, totalTiles: tiles.length, mergedTiles: merged.length, analyzedCount: analyzed.length, avgConfidence: Math.round(avgConf * 100) / 100, tiles: analyzed.map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.width, h: t.height, priority: t.priority, confidence: t.confidence, description: t.description.slice(0, 200) })), granularity: this.tier.granularity, fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

export function createVTilePrompt(objective, intensity = 'medium') {
  const tier = VTILE_TIERS[intensity] || VTILE_TIERS.medium;
  return [`【Think 视觉切片·${tier.label}档激活】`, `图像分析采用${tier.tileCount}个区域切片（${tier.granularity}粒度，${tier.overlap * 100}%重叠）。`, `切片策略：网格/金字塔/焦点/象限/滑动/自适应（自动选择最优）。`, `高优先级区域（中心/人脸/文字/高对比度）优先详细分析，低优先级区域快速扫描。`, `重叠区域自动合并，避免重复分析。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
