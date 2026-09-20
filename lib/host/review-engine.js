// review-engine.js — Think 交付前复盘·完整引擎
// 独立引擎文件：复盘维度库 / 自检清单 / 差距分析 / 改进建议 /
// 质量评分 / 回炉机制 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const REVIEW_DIMENSIONS = [
  { id: 'completeness', name: '完整性', weight: 0.20, check: '是否覆盖了问题的所有方面，有无遗漏关键部分' },
  { id: 'correctness', name: '正确性', weight: 0.25, check: '事实、数字、逻辑、代码是否正确，有无硬伤' },
  { id: 'clarity', name: '清晰性', weight: 0.15, check: '表达是否清晰，结构是否合理，有无歧义' },
  { id: 'actionability', name: '可执行性', weight: 0.15, check: '方案是否可直接执行，步骤是否具体' },
  { id: 'depth', name: '深度', weight: 0.10, check: '是否深入本质，还是停留在表面' },
  { id: 'conciseness', name: '简洁性', weight: 0.10, check: '是否言简意赅，有无冗余废话' },
  { id: 'formatting', name: '格式规范', weight: 0.05, check: '格式是否规范，代码块/列表/引用是否正确' },
];

export const REVIEW_TIERS = {
  light: { label: '轻', dimensionCount: 4, maxReforgeRounds: 1, scoreThreshold: 0.6, tokenBudgetMultiplier: 1.3 },
  medium: { label: '中', dimensionCount: 6, maxReforgeRounds: 2, scoreThreshold: 0.7, tokenBudgetMultiplier: 1.8 },
  heavy: { label: '重', dimensionCount: 7, maxReforgeRounds: 3, scoreThreshold: 0.8, tokenBudgetMultiplier: 2.5 },
  extreme: { label: '极', dimensionCount: 7, maxReforgeRounds: 5, scoreThreshold: 0.9, tokenBudgetMultiplier: 3.5 },
};

export const SELF_CHECK_ITEMS = [
  '是否回答了用户的原始问题，而不是答非所问',
  '所有数字是否有来源或计算过程',
  '所有代码是否可直接运行，有无语法错误',
  '是否区分了"已查证"与"一方称"',
  '是否标注了不确定的部分',
  '有无逻辑跳跃或循环论证',
  '步骤是否按正确顺序排列',
  '是否考虑了边界条件和异常情况',
  '有无冗余重复的内容',
  '格式是否符合用户要求',
  '术语使用是否一致',
  '是否遗漏了用户明确要求的部分',
];

export function scoreReview(answer, dimensions) {
  if (!answer || typeof answer !== 'string') return { total: 0, dimensions: {}, passed: false };
  const scores = {};
  let weightedTotal = 0;
  for (const dim of dimensions) {
    let score = heuristicReviewScore(dim.id, answer);
    scores[dim.id] = Math.round(score * 100) / 100;
    weightedTotal += score * dim.weight;
  }
  return { total: Math.round(weightedTotal * 100) / 100, dimensions: scores, passed: weightedTotal >= 0.7 };
}

function heuristicReviewScore(dimId, text) {
  const len = text.length;
  switch (dimId) {
    case 'completeness':
      if (len > 500 && /步骤|方面|部分|首先|其次|最后|第一|第二/.test(text)) return 0.8;
      if (len > 200) return 0.6;
      return 0.4;
    case 'correctness':
      if (/根据|来源|验证|计算|测试|已查证/.test(text)) return 0.8;
      if (/可能|也许|大概|不确定/.test(text)) return 0.5;
      return 0.65;
    case 'clarity':
      if (/^#|^\d+\.|^- /.test(text) || /\n\n/.test(text)) return 0.8;
      if (len > 300) return 0.6;
      return 0.5;
    case 'actionability':
      if (/步骤|操作|执行|运行|命令|代码|具体/.test(text)) return 0.8;
      if (/建议|应该|可以/.test(text)) return 0.6;
      return 0.45;
    case 'depth':
      if (/本质|根本|深层|底层|第一性原理|机制|原理/.test(text)) return 0.85;
      if (/因为|由于|导致|引起/.test(text)) return 0.65;
      return 0.5;
    case 'conciseness':
      if (len < 300) return 0.9;
      if (len < 800) return 0.7;
      if (len < 1500) return 0.55;
      return 0.4;
    case 'formatting':
      if (/```|^\d+\.|^- |^#|^\|/.test(text)) return 0.85;
      return 0.6;
    default:
      return 0.5;
  }
}

export function gapAnalysis(answer, objective, dimensions) {
  const gaps = [];
  const objKeywords = String(objective || '').match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{4,}/g) || [];
  for (const kw of objKeywords.slice(0, 10)) {
    if (!String(answer || '').toLowerCase().includes(kw.toLowerCase())) {
      gaps.push({ type: 'missing_keyword', keyword: kw, severity: 'medium', description: `答案中未提及关键词"${kw}"` });
    }
  }
  const score = scoreReview(answer, dimensions);
  for (const dim of dimensions) {
    if ((score.dimensions[dim.id] || 0) < 0.6) {
      gaps.push({ type: 'low_dimension', dimension: dim.name, score: score.dimensions[dim.id], threshold: 0.6, description: `${dim.name}得分过低（${score.dimensions[dim.id]}），${dim.check}` });
    }
  }
  return { gaps, gapCount: gaps.length, criticalGaps: gaps.filter((g) => g.severity === 'high').length, overallScore: score.total };
}

export function generateImprovementPrompt(answer, objective, gaps, dimensions) {
  const gapList = gaps.slice(0, 5).map((g, i) => `${i + 1}. [${g.severity}] ${g.description}`).join('\n');
  const dimList = dimensions.map((d) => `- ${d.name}：${d.check}`).join('\n');
  return [
    `【Think 交付前复盘·改进回炉】`,
    `以下答案经复盘发现 ${gaps.length} 个问题，请针对性改进：`,
    ``,
    `问题/目标：${String(objective || '').slice(0, 300)}`,
    ``,
    `当前答案：`,
    `${String(answer || '').slice(0, 2000)}`,
    ``,
    `发现的问题：`,
    gapList,
    ``,
    `复盘维度：`,
    dimList,
    ``,
    `改进要求：`,
    `1. 针对每个问题给出具体的修正`,
    `2. 不允许只是加"可能/大概"稀释，必须实质性改进`,
    `3. 改进后重新声明"复盘通过，可交付"`,
    `4. 附"复盘维度得分 + 改进说明"小结`,
  ].join('\n');
}

export class ReviewFuse {
  constructor(options = {}) {
    this.maxReviews = options.maxReviews || 8;
    this.maxReforge = options.maxReforge || 5;
    this.maxTokenBudget = options.maxTokenBudget || 15000;
    this.reviewCount = 0;
    this.reforgeCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkReview() {
    if (this.reviewCount >= this.maxReviews) { this.trip(`复盘次数熔断：${this.maxReviews}`); return false; }
    this.reviewCount++;
    return true;
  }
  checkReforge() {
    if (this.reforgeCount >= this.maxReforge) { this.trip(`回炉次数熔断：${this.maxReforge}`); return false; }
    this.reforgeCount++;
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.reviewCount = 0; this.reforgeCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { reviewCount: this.reviewCount, maxReviews: this.maxReviews, reforgeCount: this.reforgeCount, maxReforge: this.maxReforge, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class ReviewStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { reviewsRun: 0, gapsFound: 0, reforges: 0, avgScore: 0, passRate: 0, dimensionBreakdown: {}, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordReview(id, score, gaps, reforge) {
    const s = this.getSession(id);
    s.reviewsRun++;
    s.gapsFound += gaps?.length || 0;
    if (reforge) s.reforges++;
    s.avgScore = (s.avgScore * (s.reviewsRun - 1) + score) / s.reviewsRun;
    s.passRate = (s.passRate * (s.reviewsRun - 1) + (score >= 0.7 ? 1 : 0)) / s.reviewsRun;
  }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    return { reviewsRun: s.reviewsRun, gapsFound: s.gapsFound, reforges: s.reforges, avgScore: Math.round(s.avgScore * 100) / 100, passRate: `${Math.round(s.passRate * 100)}%`, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class ReviewEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = REVIEW_TIERS[this.intensity] || REVIEW_TIERS.medium;
    this.fuse = new ReviewFuse();
    this.stats = new ReviewStats();
  }
  setIntensity(i) { if (REVIEW_TIERS[i]) { this.intensity = i; this.tier = REVIEW_TIERS[i]; } }
  async review(sessionId, answer, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    if (!this.fuse.checkReview()) return { ok: false, reason: this.fuse.tripReason };
    const dimensions = REVIEW_DIMENSIONS.slice(0, this.tier.dimensionCount);
    const score = scoreReview(answer, dimensions);
    const gaps = gapAnalysis(answer, objective, dimensions);
    let reforgeCount = 0;
    let currentAnswer = answer;
    if (gaps.gapCount > 0 && score.total < this.tier.scoreThreshold) {
      while (reforgeCount < this.tier.maxReforgeRounds && !this.fuse.tripped) {
        if (!this.fuse.checkReforge()) break;
        if (!this.fuse.checkToken(500)) break;
        const prompt = generateImprovementPrompt(currentAnswer, objective, gaps.gaps, dimensions);
        if (typeof steerFn === 'function') {
          try {
            const result = await steerFn(prompt, 'review-reforge');
            currentAnswer = result?.text || result?.content || currentAnswer;
            reforgeCount++;
            const newScore = scoreReview(currentAnswer, dimensions);
            if (newScore.total >= this.tier.scoreThreshold) break;
          } catch (e) { break; }
        } else break;
      }
    }
    this.stats.recordReview(sessionId, score.total, gaps.gaps, reforgeCount > 0);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    const finalScore = scoreReview(currentAnswer, dimensions);
    return { ok: true, initialScore: score.total, finalScore: finalScore.total, dimensions: finalScore.dimensions, gaps: gaps.gaps, gapCount: gaps.gapCount, reforgeCount, improved: reforgeCount > 0 && finalScore.total > score.total, passed: finalScore.total >= this.tier.scoreThreshold, selfCheckItems: SELF_CHECK_ITEMS, fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

export function createReviewPrompt(objective, intensity = 'medium') {
  const tier = REVIEW_TIERS[intensity] || REVIEW_TIERS.medium;
  return [`【Think 交付前复盘·${tier.label}档激活】`, `答案生成后，按 ${tier.dimensionCount} 个维度自动复盘（${REVIEW_DIMENSIONS.slice(0, tier.dimensionCount).map((d) => d.name).join('、')}）。`, `得分低于 ${tier.scoreThreshold} 自动回炉改进（最多 ${tier.maxReforgeRounds} 轮）。`, `交付前附"复盘得分 + 改进说明"。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
