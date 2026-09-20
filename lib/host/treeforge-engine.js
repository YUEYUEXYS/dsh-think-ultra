// treeforge-engine.js — Think 思维树锻造·完整引擎
// 独立引擎文件：节点展开策略 / 多维度评分 / 剪枝算法 / 回溯机制 /
// 路径合成 / 深度广度控制 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

// ============================================================
// 一、节点展开策略（7 种真实不同的展开方式）
// ============================================================
export const EXPANSION_STRATEGIES = [
  {
    id: 'decompose',
    name: '分解展开',
    description: '把当前节点的问题拆成 2-4 个子问题，每个子问题独立求解',
    childCount: [2, 4],
    promptTemplate: (node) => `将以下问题/中间结论分解为 ${2 + Math.floor(Math.random() * 3)} 个独立子问题，每个子问题必须可独立求解且合起来覆盖原问题：\n\n${node.text}`,
  },
  {
    id: 'alternative',
    name: '替代方案展开',
    description: '为当前节点生成 2-3 种完全不同的解法/推理路径',
    childCount: [2, 3],
    promptTemplate: (node) => `为以下问题/中间结论生成 ${2 + Math.floor(Math.random() * 2)} 种完全不同的解法或推理路径，每种路径的核心假设和方法必须不同：\n\n${node.text}`,
  },
  {
    id: 'counterfactual',
    name: '反事实展开',
    description: '假设当前节点的关键前提不成立，推导会发生什么',
    childCount: [1, 2],
    promptTemplate: (node) => `假设以下结论的关键前提不成立（列出最可能不成立的 1-2 个前提），推导在反事实条件下会得出什么不同结论：\n\n${node.text}`,
  },
  {
    id: 'edge_case',
    name: '边界展开',
    description: '探索当前结论在边界条件（零/极值/空集/溢出）下的表现',
    childCount: [2, 3],
    promptTemplate: (node) => `探索以下结论在 ${2 + Math.floor(Math.random() * 2)} 种边界条件下的表现（零值、极值、空集、溢出、退化情况等），标注哪些边界下结论仍然成立、哪些会失效：\n\n${node.text}`,
  },
  {
    id: 'evidence',
    name: '证据展开',
    description: '为当前节点的每个关键断言寻找支持/反对证据',
    childCount: [2, 4],
    promptTemplate: (node) => `为以下结论中的每个关键断言分别寻找支持证据和反对证据（至少各一条），评估证据强度：\n\n${node.text}`,
  },
  {
    id: 'generalize',
    name: '泛化展开',
    description: '把当前节点的结论推广到更一般的情况，看是否仍然成立',
    childCount: [1, 3],
    promptTemplate: (node) => `将以下结论推广到 ${1 + Math.floor(Math.random() * 3)} 种更一般的情况（去掉限制条件、扩大适用范围、抽象化），判断推广后是否仍然成立：\n\n${node.text}`,
  },
  {
    id: 'synthesize',
    name: '综合展开',
    description: '综合当前节点和兄弟节点的结论，生成更高层次的综合结论',
    childCount: [1, 1],
    promptTemplate: (node, siblings) => `综合以下多个中间结论，生成一个更高层次的综合结论，指出它们之间的关系（一致/矛盾/互补/递进）：\n\n当前节点：${node.text}\n\n兄弟节点：\n${(siblings || []).map((s, i) => `${i + 1}. ${s.text}`).join('\n')}`,
  },
];

// ============================================================
// 二、节点评分维度（5 维真实打分）
// ============================================================
export const NODE_SCORE_DIMENSIONS = [
  { id: 'plausibility', name: '合理性', weight: 0.30, description: '推理是否合理，有无明显逻辑跳跃' },
  { id: 'progress', name: '进展度', weight: 0.25, description: '相比父节点，离最终答案近了多少' },
  { id: 'novelty', name: '新颖性', weight: 0.15, description: '是否提供了新的角度或信息，还是重复已有路径' },
  { id: 'verifiability', name: '可验证性', weight: 0.15, description: '结论是否可以被验证或证伪' },
  { id: 'risk', name: '风险度', weight: 0.15, description: '该路径出错的风险（反向计分，风险越低分越高）' },
];

// ============================================================
// 三、强度分级
// ============================================================
export const TREEFORGE_TIERS = {
  light: { label: '轻', maxDepth: 2, beamWidth: 2, expansionCount: 2, maxNodes: 8, tokenBudgetMultiplier: 2.5 },
  medium: { label: '中', maxDepth: 3, beamWidth: 3, expansionCount: 3, maxNodes: 20, tokenBudgetMultiplier: 4.0 },
  heavy: { label: '重', maxDepth: 4, beamWidth: 4, expansionCount: 4, maxNodes: 40, tokenBudgetMultiplier: 6.0 },
  extreme: { label: '极', maxDepth: 5, beamWidth: 5, expansionCount: 5, maxNodes: 80, tokenBudgetMultiplier: 9.0 },
};

// ============================================================
// 四、思维树节点类
// ============================================================
export class TreeNode {
  constructor(id, text, parent = null, strategy = 'root') {
    this.id = id;
    this.text = text;
    this.parent = parent;
    this.strategy = strategy;
    this.depth = parent ? parent.depth + 1 : 0;
    this.children = [];
    this.scores = {};
    this.totalScore = 0;
    this.visited = false;
    this.expanded = false;
    this.pruned = false;
    this.isSolution = false;
    this.solutionScore = 0;
    this.path = parent ? [...parent.path, id] : [id];
  }
  addChild(child) { this.children.push(child); }
  getAncestors() {
    const ancestors = [];
    let p = this.parent;
    while (p) { ancestors.push(p); p = p.parent; }
    return ancestors;
  }
  getSiblings() {
    if (!this.parent) return [];
    return this.parent.children.filter((c) => c.id !== this.id);
  }
}

// ============================================================
// 五、节点评分器
// ============================================================
export function scoreNode(node, allNodes = []) {
  if (!node || !node.text) return { ...node, scores: {}, totalScore: 0 };
  const text = node.text;
  const scores = {};
  let weightedTotal = 0;
  for (const dim of NODE_SCORE_DIMENSIONS) {
    let score = heuristicScore(dim.id, text, node);
    // 同行对比：如果该节点在某维度明显优于同层其他节点，加分
    const sameDepth = allNodes.filter((n) => n.depth === node.depth && n.id !== node.id);
    if (sameDepth.length > 0) {
      const peerAvg = sameDepth.reduce((s, n) => s + (n.scores?.[dim.id] || 0.5), 0) / sameDepth.length;
      if (score > peerAvg + 0.1) score = Math.min(1, score + 0.05);
      else if (score < peerAvg - 0.1) score = Math.max(0, score - 0.05);
    }
    scores[dim.id] = Math.round(score * 100) / 100;
    weightedTotal += score * dim.weight;
  }
  node.scores = scores;
  node.totalScore = Math.round(weightedTotal * 100) / 100;
  return node;
}

function heuristicScore(dimId, text, node) {
  const len = text.length;
  switch (dimId) {
    case 'plausibility':
      if (/因为|所以|因此|由于|导致|从而|推理|推导|证明/.test(text)) return 0.75;
      if (/可能|也许|大概|或许|不确定/.test(text)) return 0.45;
      if (len > 100) return 0.7;
      return 0.55;
    case 'progress':
      if (/答案|结论|最终|解决|完成|得到|得出/.test(text)) return 0.85;
      if (node.depth > 0 && len > node.parent?.text?.length) return 0.65;
      return 0.4;
    case 'novelty':
      if (/新的|不同|另一种|替代|反事实|边界|推广/.test(text)) return 0.8;
      if (node.strategy === 'decompose' || node.strategy === 'alternative') return 0.7;
      return 0.45;
    case 'verifiability':
      if (/\d+(\.\d+)?|等于|大于|小于|测试|验证|实验|计算/.test(text)) return 0.8;
      if (/主观|感受|体验|看法|认为/.test(text)) return 0.3;
      return 0.55;
    case 'risk':
      if (/假设|如果|可能|也许|大概|未验证|推测/.test(text)) return 0.35;
      if (/已验证|确定|证明|必然|一定|肯定/.test(text)) return 0.85;
      return 0.55;
    default:
      return 0.5;
  }
}

// ============================================================
// 六、剪枝算法（Beam Search + Best-First 混合）
// ============================================================
export function pruneNodes(nodes, beamWidth, maxDepth) {
  // 按深度分组
  const byDepth = {};
  for (const n of nodes) {
    if (!byDepth[n.depth]) byDepth[n.depth] = [];
    byDepth[n.depth].push(n);
  }
  // 每层只保留 beamWidth 个最高分节点
  const kept = [];
  for (const depth of Object.keys(byDepth).sort((a, b) => a - b)) {
    const layer = byDepth[depth].sort((a, b) => b.totalScore - a.totalScore);
    const keep = layer.slice(0, beamWidth);
    const prune = layer.slice(beamWidth);
    for (const n of keep) { kept.push(n); n.pruned = false; }
    for (const n of prune) { n.pruned = true; }
  }
  return kept;
}

// ============================================================
// 七、路径合成器（从根到最优解节点的路径合成最终答案）
// ============================================================
export function synthesizePath(solutionNode) {
  if (!solutionNode) return null;
  const path = [solutionNode, ...solutionNode.getAncestors()].reverse();
  const synthesisPrompt = [
    `【Think 思维树锻造·路径合成】`,
    `以下是从根问题到最优解的完整推理路径（共 ${path.length} 层），请综合成一个连贯、完整、可直接交付的最终答案：`,
    ``,
    ...path.map((n, i) => [
      `第 ${i} 层（策略：${n.strategy}，评分：${n.totalScore}）：`,
      n.text.slice(0, 800),
      ``,
    ].join('\n')),
    `合成要求：`,
    `1. 保留路径中所有有效的推理步骤和关键结论`,
    `2. 去除被剪枝或评分低的分支的影响`,
    `3. 最终答案必须是连贯统一的整体，不是简单拼接`,
    `4. 标注哪些结论是高置信（评分>0.7），哪些是中等置信`,
  ].join('\n');
  return {
    path: path.map((n) => ({ id: n.id, depth: n.depth, strategy: n.strategy, score: n.totalScore, text: n.text.slice(0, 200) })),
    synthesisPrompt,
    solutionScore: solutionNode.totalScore,
    solutionDepth: solutionNode.depth,
  };
}

// ============================================================
// 八、熔断保护器
// ============================================================
export class TreeForgeFuse {
  constructor(options = {}) {
    this.maxNodes = options.maxNodes || 40;
    this.maxExpansions = options.maxExpansions || 20;
    this.maxTokenBudget = options.maxTokenBudget || 25000;
    this.nodeCount = 0;
    this.expansionCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkNode() {
    if (this.nodeCount >= this.maxNodes) { this.trip(`节点数熔断：已达上限 ${this.maxNodes}`); return false; }
    this.nodeCount++;
    return true;
  }
  checkExpansion() {
    if (this.expansionCount >= this.maxExpansions) { this.trip(`展开次数熔断：已达上限 ${this.maxExpansions}`); return false; }
    this.expansionCount++;
    return true;
  }
  checkToken(estimate) {
    this.tokenEstimate += estimate || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token 预算熔断：已达上限 ${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(reason) { this.tripped = true; this.tripReason = reason; }
  reset() { this.nodeCount = 0; this.expansionCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() {
    return { nodeCount: this.nodeCount, maxNodes: this.maxNodes, expansionCount: this.expansionCount, maxExpansions: this.maxExpansions, tokenEstimate: this.tokenEstimate, maxTokenBudget: this.maxTokenBudget, tripped: this.tripped, tripReason: this.tripReason };
  }
}

// ============================================================
// 九、统计记录器
// ============================================================
export class TreeForgeStats {
  constructor() { this.sessions = new Map(); }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { treesGrown: 0, totalNodes: 0, totalExpansions: 0, totalPruned: 0, avgDepth: 0, avgSolutionScore: 0, strategyUsage: {}, fuseTrips: 0, startTime: Date.now() });
    }
    return this.sessions.get(sessionId);
  }
  recordTree(sessionId, nodes, expansions, pruned, solution) {
    const s = this.getSession(sessionId);
    s.treesGrown++;
    s.totalNodes += nodes;
    s.totalExpansions += expansions;
    s.totalPruned += pruned;
    if (solution) {
      s.avgSolutionScore = (s.avgSolutionScore * (s.treesGrown - 1) + solution.totalScore) / s.treesGrown;
      s.avgDepth = (s.avgDepth * (s.treesGrown - 1) + solution.depth) / s.treesGrown;
    }
  }
  recordStrategy(sessionId, strategyId) {
    const s = this.getSession(sessionId);
    s.strategyUsage[strategyId] = (s.strategyUsage[strategyId] || 0) + 1;
  }
  recordFuseTrip(sessionId) { this.getSession(sessionId).fuseTrips++; }
  summary(sessionId) {
    const s = this.getSession(sessionId);
    const topStrategies = Object.entries(s.strategyUsage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, count]) => { const st = EXPANSION_STRATEGIES.find((x) => x.id === id); return { name: st?.name || id, count }; });
    return { treesGrown: s.treesGrown, totalNodes: s.totalNodes, totalExpansions: s.totalExpansions, totalPruned: s.totalPruned, avgDepth: Math.round(s.avgDepth * 10) / 10, avgSolutionScore: Math.round(s.avgSolutionScore * 100) / 100, topStrategies, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

// ============================================================
// 十、主引擎入口
// ============================================================
export class TreeForgeEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = TREEFORGE_TIERS[this.intensity] || TREEFORGE_TIERS.medium;
    this.fuse = new TreeForgeFuse({ maxNodes: this.tier.maxNodes, maxExpansions: this.tier.maxDepth * this.tier.beamWidth, maxTokenBudget: options.maxTokenBudget || 25000 });
    this.stats = new TreeForgeStats();
    this.nodeIdCounter = 0;
  }
  setIntensity(intensity) {
    if (TREEFORGE_TIERS[intensity]) { this.intensity = intensity; this.tier = TREEFORGE_TIERS[intensity]; }
  }
  async grow(sessionId, rootText, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason, tree: null, solution: null };
    this.nodeIdCounter = 0;
    const root = new TreeNode(++this.nodeIdCounter, rootText, null, 'root');
    const allNodes = [root];
    let expansions = 0;
    let pruned = 0;
    // Beam Search 主循环
    let frontier = [root];
    for (let depth = 0; depth < this.tier.maxDepth; depth++) {
      if (this.fuse.tripped) break;
      if (!this.fuse.checkExpansion()) break;
      const nextFrontier = [];
      for (const node of frontier) {
        if (node.pruned || node.expanded) continue;
        if (depth >= this.tier.maxDepth) { node.isSolution = true; continue; }
        // 选择展开策略
        const strategy = EXPANSION_STRATEGIES[Math.floor(Math.random() * (EXPANSION_STRATEGIES.length - 1))]; // 排除 synthesize
        const childCount = strategy.childCount[0] + Math.floor(Math.random() * (strategy.childCount[1] - strategy.childCount[0] + 1));
        this.stats.recordStrategy(sessionId, strategy.id);
        // 真实触发模型生成子节点
        if (typeof steerFn === 'function') {
          try {
            const prompt = strategy.promptTemplate(node, node.getSiblings());
            const result = await steerFn(prompt, 'treeforge-expand');
            const childTexts = parseChildOutput(result?.text || result?.content || '', childCount);
            for (const ct of childTexts) {
              if (!this.fuse.checkNode()) break;
              if (!this.fuse.checkToken(300)) break;
              const child = new TreeNode(++this.nodeIdCounter, ct, node, strategy.id);
              node.addChild(child);
              allNodes.push(child);
              nextFrontier.push(child);
            }
          } catch (e) { /* 展开失败不阻断 */ }
        }
        node.expanded = true;
        expansions++;
      }
      // 评分 + 剪枝
      for (const n of allNodes) scoreNode(n, allNodes);
      const kept = pruneNodes(nextFrontier, this.tier.beamWidth, this.tier.maxDepth);
      pruned += nextFrontier.length - kept.length;
      frontier = kept.filter((n) => !n.pruned);
      if (frontier.length === 0) break;
    }
    // 找最优解
    const solutions = allNodes.filter((n) => n.depth >= this.tier.maxDepth - 1 || n.isSolution);
    const sorted = solutions.sort((a, b) => b.totalScore - a.totalScore);
    const solution = sorted[0] || allNodes.sort((a, b) => b.totalScore - a.totalScore)[0];
    if (solution) solution.isSolution = true;
    // 统计
    this.stats.recordTree(sessionId, allNodes.length, expansions, pruned, solution);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    // 路径合成
    const synthesis = synthesizePath(solution);
    return {
      ok: true,
      root,
      allNodes,
      solution,
      synthesis,
      expansions,
      pruned,
      maxDepth: this.tier.maxDepth,
      beamWidth: this.tier.beamWidth,
      fuseStatus: this.fuse.status(),
    };
  }
  getStats(sessionId) { return this.stats.summary(sessionId); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); this.nodeIdCounter = 0; }
}

function parseChildOutput(text, expectedCount) {
  if (!text) return [];
  // 尝试按编号分割
  const numbered = text.match(/(?:^|\n)\s*\d+[.、:：]\s*.+/g);
  if (numbered && numbered.length > 0) {
    return numbered.slice(0, expectedCount).map((s) => s.replace(/^\s*\d+[.、:：]\s*/, '').trim()).filter(Boolean);
  }
  // 按段落分割
  const paragraphs = text.split(/\n\n+/).map((s) => s.trim()).filter((s) => s.length > 20);
  if (paragraphs.length > 0) return paragraphs.slice(0, expectedCount);
  return [text.slice(0, 500)];
}

// ============================================================
// 十一、兼容函数
// ============================================================
export function createTreeForgePrompt(objective, intensity = 'medium') {
  const tier = TREEFORGE_TIERS[intensity] || TREEFORGE_TIERS.medium;
  return [
    `【Think 思维树锻造·${tier.label}档激活】`,
    `采用思维树（Tree of Thoughts）推理：将问题展开为 ${tier.beamWidth} 条并行推理路径，每条路径深度 ${tier.maxDepth} 层，每层用 Beam Search 保留最优 ${tier.beamWidth} 个节点，剪枝弱路径。`,
    `展开策略：分解展开 / 替代方案 / 反事实 / 边界探索 / 证据检索 / 泛化推广。`,
    `最终从最优路径合成答案，标注各节点置信度。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}

export function treeforgeCadence(deepTier) {
  return Math.max(1, 4 - Math.min(3, Math.round(Number(deepTier) || 0)));
}
