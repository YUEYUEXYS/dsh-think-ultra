// branches-engine.js — Think 多分支推演·完整引擎
// 独立引擎文件：分支策略库 / 分支生成器 / 分支评分 / 剪枝算法 /
// 分支合并 / 分歧检测 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const BRANCH_STRATEGIES = [
  { id: 'optimistic', name: '乐观分支', description: '假设一切顺利，探索最优解路径', bias: 0.8 },
  { id: 'pessimistic', name: '悲观分支', description: '假设最坏情况，探索风险规避路径', bias: 0.3 },
  { id: 'conservative', name: '保守分支', description: '稳妥可靠，优先选择经过验证的方法', bias: 0.6 },
  { id: 'aggressive', name: '激进分支', description: '大胆尝试，探索非常规高风险高回报路径', bias: 0.5 },
  { id: 'analytical', name: '分析分支', description: '彻底分解问题，逐步精确求解', bias: 0.7 },
  { id: 'intuitive', name: '直觉分支', description: '基于整体直觉和模式匹配快速给出方案', bias: 0.55 },
  { id: 'first_principles', name: '第一性原理分支', description: '从基本公理出发，不依赖既有结论', bias: 0.75 },
  { id: 'analogical', name: '类比分支', description: '从其他领域迁移同构解法', bias: 0.6 },
];

export const BRANCH_TIERS = {
  light: { label: '轻', branchCount: 2, maxDepth: 2, keepTop: 2, tokenBudgetMultiplier: 1.5 },
  medium: { label: '中', branchCount: 3, maxDepth: 3, keepTop: 2, tokenBudgetMultiplier: 2.5 },
  heavy: { label: '重', branchCount: 4, maxDepth: 4, keepTop: 3, tokenBudgetMultiplier: 4.0 },
  extreme: { label: '极', branchCount: 5, maxDepth: 5, keepTop: 3, tokenBudgetMultiplier: 6.0 },
};

export const BRANCH_SCORE_DIMENSIONS = [
  { id: 'feasibility', name: '可行性', weight: 0.25 },
  { id: 'effectiveness', name: '有效性', weight: 0.25 },
  { id: 'risk', name: '风险控制', weight: 0.20 },
  { id: 'efficiency', name: '效率', weight: 0.15 },
  { id: 'robustness', name: '鲁棒性', weight: 0.15 },
];

export class BranchNode {
  constructor(id, text, strategy, parent = null) {
    this.id = id;
    this.text = text;
    this.strategy = strategy;
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.children = [];
    this.scores = {};
    this.totalScore = 0;
    this.pruned = false;
    this.path = parent ? [...parent.path, id] : [id];
  }
  addChild(c) { this.children.push(c); }
  getAncestors() { const a = []; let p = this.parent; while (p) { a.push(p); p = p.parent; } return a; }
}

export function scoreBranch(branch, allBranches = []) {
  if (!branch || !branch.text) return { ...branch, scores: {}, totalScore: 0 };
  const text = branch.text;
  const scores = {};
  let total = 0;
  for (const dim of BRANCH_SCORE_DIMENSIONS) {
    let s = heuristicBranchScore(dim.id, text, branch.strategy);
    const sameDepth = allBranches.filter((b) => b.depth === branch.depth && b.id !== branch.id);
    if (sameDepth.length > 0) {
      const avg = sameDepth.reduce((sum, b) => sum + (b.scores?.[dim.id] || 0.5), 0) / sameDepth.length;
      if (s > avg + 0.1) s = Math.min(1, s + 0.05);
      else if (s < avg - 0.1) s = Math.max(0, s - 0.05);
    }
    scores[dim.id] = Math.round(s * 100) / 100;
    total += s * dim.weight;
  }
  branch.scores = scores;
  branch.totalScore = Math.round(total * 100) / 100;
  return branch;
}

function heuristicBranchScore(dimId, text, strategy) {
  const len = text.length;
  const st = BRANCH_STRATEGIES.find((s) => s.id === strategy);
  const bias = st?.bias || 0.5;
  switch (dimId) {
    case 'feasibility':
      if (/步骤|具体|可执行|操作|运行/.test(text)) return 0.8 * bias + 0.1;
      if (len > 200) return 0.65 * bias + 0.1;
      return 0.5 * bias + 0.1;
    case 'effectiveness':
      if (/解决|完成|达到|实现|成功/.test(text)) return 0.8 * bias + 0.1;
      if (/可能|也许|大概/.test(text)) return 0.45;
      return 0.6 * bias + 0.05;
    case 'risk':
      if (/风险|注意|避免|备份|回滚|容错/.test(text)) return 0.85;
      if (st?.id === 'pessimistic' || st?.id === 'conservative') return 0.8;
      if (st?.id === 'aggressive') return 0.45;
      return 0.6;
    case 'efficiency':
      if (len < 300 && /步骤|方法/.test(text)) return 0.85;
      if (len < 800) return 0.7;
      return 0.5;
    case 'robustness':
      if (/边界|异常|错误处理|容错|降级|回退/.test(text)) return 0.85;
      if (st?.id === 'conservative' || st?.id === 'analytical') return 0.75;
      return 0.55;
    default:
      return 0.5;
  }
}

export function pruneBranches(branches, keepTop) {
  const byDepth = {};
  for (const b of branches) { if (!byDepth[b.depth]) byDepth[b.depth] = []; byDepth[b.depth].push(b); }
  const kept = [];
  for (const depth of Object.keys(byDepth).sort((a, b) => a - b)) {
    const layer = byDepth[depth].sort((a, b) => b.totalScore - a.totalScore);
    const keep = layer.slice(0, keepTop);
    const prune = layer.slice(keepTop);
    for (const b of keep) { kept.push(b); b.pruned = false; }
    for (const b of prune) { b.pruned = true; }
  }
  return kept;
}

export function detectDivergence(branches) {
  if (branches.length < 2) return { divergent: false, pairs: [] };
  const pairs = [];
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      const a = branches[i], b = branches[j];
      const scoreDiff = Math.abs((a.totalScore || 0) - (b.totalScore || 0));
      const textSim = textSimilarity(a.text, b.text);
      if (scoreDiff > 0.2 || textSim < 0.3) {
        pairs.push({ branchA: a.strategy, branchB: b.strategy, scoreDiff, textSimilarity: textSim, divergent: scoreDiff > 0.2 && textSim < 0.5 });
      }
    }
  }
  return { divergent: pairs.some((p) => p.divergent), pairs, divergentCount: pairs.filter((p) => p.divergent).length };
}

function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const kwA = new Set(a.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z]{3,}/g) || []);
  const kwB = new Set(b.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z]{3,}/g) || []);
  if (kwA.size === 0 || kwB.size === 0) return 0;
  let overlap = 0;
  for (const k of kwA) if (kwB.has(k)) overlap++;
  return overlap / Math.min(kwA.size, kwB.size);
}

export function mergeBranches(branches, objective) {
  const top = [...branches].sort((a, b) => b.totalScore - a.totalScore).slice(0, 3);
  if (top.length === 0) return null;
  const best = top[0];
  const mergePrompt = [
    `【Think 多分支推演·分支合并】`,
    `以下是 ${top.length} 个独立推演分支的结果，请综合各分支的最优部分，合并成一个最终方案：`,
    ``,
    `问题/目标：${String(objective || '').slice(0, 300)}`,
    ``,
    ...top.map((b, i) => [`分支 ${i + 1}（策略：${b.strategy}，评分：${b.totalScore}）：`, `${String(b.text || '').slice(0, 1000)}`, ``].join('\n')),
    `合并要求：`,
    `1. 保留各分支中评分最高的部分`,
    `2. 解决分支间的矛盾和分歧`,
    `3. 合并后的方案必须是连贯统一的整体`,
    `4. 标注哪些部分来自哪个分支`,
  ].join('\n');
  return { bestBranch: best.strategy, bestScore: best.totalScore, mergePrompt, branches: top.map((b) => ({ strategy: b.strategy, score: b.totalScore })) };
}

export function buildBranchPrompt(objective, strategy, branchIndex, totalBranches) {
  const st = BRANCH_STRATEGIES.find((s) => s.id === strategy) || BRANCH_STRATEGIES[0];
  return [
    `【Think 多分支推演·分支 ${branchIndex}/${totalBranches}】`,
    `策略：${st.name}`,
    `策略说明：${st.description}`,
    ``,
    `问题/目标：${String(objective || '').slice(0, 400)}`,
    ``,
    `请严格按照"${st.name}"策略的视角独立推演完整方案，不参照其他分支。方案必须具体、可执行、有明确步骤。`,
  ].join('\n');
}

export class BranchesFuse {
  constructor(options = {}) {
    this.maxBranches = options.maxBranches || 20;
    this.maxDepth = options.maxDepth || 5;
    this.maxTokenBudget = options.maxTokenBudget || 25000;
    this.branchCount = 0;
    this.depthReached = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkBranch() {
    if (this.branchCount >= this.maxBranches) { this.trip(`分支数熔断：${this.maxBranches}`); return false; }
    this.branchCount++;
    return true;
  }
  checkDepth(depth) {
    if (depth > this.maxDepth) { this.trip(`深度熔断：${this.maxDepth}`); return false; }
    this.depthReached = Math.max(this.depthReached, depth);
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.branchCount = 0; this.depthReached = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { branchCount: this.branchCount, maxBranches: this.maxBranches, depthReached: this.depthReached, maxDepth: this.maxDepth, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class BranchesStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { treesGrown: 0, totalBranches: 0, totalPruned: 0, avgBestScore: 0, divergenceRate: 0, strategyUsage: {}, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordTree(id, branches, pruned, bestScore, divergence) {
    const s = this.getSession(id);
    s.treesGrown++;
    s.totalBranches += branches;
    s.totalPruned += pruned;
    s.avgBestScore = (s.avgBestScore * (s.treesGrown - 1) + bestScore) / s.treesGrown;
    s.divergenceRate = (s.divergenceRate * (s.treesGrown - 1) + (divergence ? 1 : 0)) / s.treesGrown;
  }
  recordStrategy(id, sid) { const s = this.getSession(id); s.strategyUsage[sid] = (s.strategyUsage[sid] || 0) + 1; }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    const topStrategies = Object.entries(s.strategyUsage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sid, c]) => { const st = BRANCH_STRATEGIES.find((x) => x.id === sid); return { name: st?.name || sid, count: c }; });
    return { treesGrown: s.treesGrown, totalBranches: s.totalBranches, totalPruned: s.totalPruned, avgBestScore: Math.round(s.avgBestScore * 100) / 100, divergenceRate: `${Math.round(s.divergenceRate * 100)}%`, topStrategies, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class BranchesEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = BRANCH_TIERS[this.intensity] || BRANCH_TIERS.medium;
    this.fuse = new BranchesFuse({ maxBranches: this.tier.branchCount * this.tier.maxDepth, maxDepth: this.tier.maxDepth });
    this.stats = new BranchesStats();
    this.nodeIdCounter = 0;
  }
  setIntensity(i) { if (BRANCH_TIERS[i]) { this.intensity = i; this.tier = BRANCH_TIERS[i]; } }
  async explore(sessionId, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    this.nodeIdCounter = 0;
    const shuffled = [...BRANCH_STRATEGIES].sort(() => Math.random() - 0.5);
    const strategies = shuffled.slice(0, this.tier.branchCount);
    const allBranches = [];
    let frontier = [];
    for (let i = 0; i < strategies.length; i++) {
      if (!this.fuse.checkBranch()) break;
      if (!this.fuse.checkToken(600)) break;
      this.stats.recordStrategy(sessionId, strategies[i].id);
      const prompt = buildBranchPrompt(objective, strategies[i].id, i + 1, strategies.length);
      if (typeof steerFn === 'function') {
        try {
          const result = await steerFn(prompt, 'branches-explore');
          const node = new BranchNode(++this.nodeIdCounter, result?.text || result?.content || '', strategies[i].id);
          allBranches.push(node);
          frontier.push(node);
        } catch (e) { /* 分支生成失败不阻断 */ }
      }
    }
    for (const b of allBranches) scoreBranch(b, allBranches);
    const kept = pruneBranches(allBranches, this.tier.keepTop);
    const prunedCount = allBranches.length - kept.length;
    const divergence = detectDivergence(kept);
    const merge = mergeBranches(kept, objective);
    const best = [...kept].sort((a, b) => b.totalScore - a.totalScore)[0];
    this.stats.recordTree(sessionId, allBranches.length, prunedCount, best?.totalScore || 0, divergence.divergent);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, branches: kept.map((b) => ({ id: b.id, strategy: b.strategy, score: b.totalScore, depth: b.depth, text: b.text.slice(0, 300) })), allBranchCount: allBranches.length, prunedCount, bestBranch: best?.strategy, bestScore: best?.totalScore, divergence, mergePlan: merge, fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); this.nodeIdCounter = 0; }
}

export function createBranchesPrompt(objective, intensity = 'medium') {
  const tier = BRANCH_TIERS[intensity] || BRANCH_TIERS.medium;
  return [`【Think 多分支推演·${tier.label}档激活】`, `并行展开 ${tier.branchCount} 条独立推演分支（乐观/悲观/保守/激进/分析/直觉等策略），每条分支独立求解。`, `5维评分（可行性/有效性/风险/效率/鲁棒性）后剪枝保留最优 ${tier.keepTop} 条，检测分支间分歧，最终合并最优部分。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
