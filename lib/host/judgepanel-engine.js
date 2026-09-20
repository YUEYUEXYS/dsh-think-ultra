// judgepanel-engine.js — Think 多裁判投票·完整引擎
// 独立引擎文件：裁判角色库 / 评分维度 / 投票机制 / 分歧调解 /
// 置信度聚合 / 少数派报告 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

// ============================================================
// 一、裁判角色库（8 种真实不同的裁判视角）
// ============================================================
export const JUDGE_ROLES = [
  {
    id: 'logician',
    name: '逻辑学家',
    persona: '你是一位严格的逻辑学家，只关心推理是否严谨、有无逻辑谬误、前提是否充分。你对任何跳步、循环论证、偷换概念零容忍。',
    weight: 0.18,
    focus: '逻辑严谨性',
  },
  {
    id: 'empiricist',
    name: '经验主义者',
    persona: '你是一位经验主义者，只关心结论是否有事实/数据/实验支撑。你对纯理论推演、无证据断言、"显然可知"持怀疑态度。',
    weight: 0.15,
    focus: '事实证据',
  },
  {
    id: 'engineer',
    name: '工程师',
    persona: '你是一位实战工程师，只关心方案是否可执行、可维护、可扩展。你对纸上谈兵、忽略边界条件、没有错误处理的方案打低分。',
    weight: 0.15,
    focus: '可执行性',
  },
  {
    id: 'skeptic',
    name: '怀疑论者',
    persona: '你是一位极端怀疑论者，默认所有结论都是错的，除非能说服你。你主动寻找反例、隐藏假设、未考虑的可能性。',
    weight: 0.15,
    focus: '反例与漏洞',
  },
  {
    id: 'domain_expert',
    name: '领域专家',
    persona: '你是该问题所在领域的资深专家，对领域内的最佳实践、常见陷阱、前沿进展非常熟悉。你用领域标准来评判答案质量。',
    weight: 0.15,
    focus: '领域专业性',
  },
  {
    id: 'simplifier',
    name: '简化者',
    persona: '你是一位极简主义者，只关心答案是否简洁、清晰、直击本质。你对冗余、过度复杂、"用大炮打蚊子"的方案打低分。',
    weight: 0.10,
    focus: '简洁性',
  },
  {
    id: 'creative',
    name: '创新者',
    persona: '你是一位创新者，欣赏新颖的角度、非常规的解法、跨领域的灵感。你对平庸的、教科书式的、毫无新意的答案打低分。',
    weight: 0.07,
    focus: '创新性',
  },
  {
    id: 'devils_advocate',
    name: '魔鬼代言人',
    persona: '你是魔鬼代言人，专门站在对立立场攻击答案。你不是为了否定而否定，而是通过最锋利的攻击来检验答案的真正强度。',
    weight: 0.05,
    focus: '抗压能力',
  },
];

// ============================================================
// 二、评分维度（6 维，每个裁判按自己的侧重打分）
// ============================================================
export const JUDGE_SCORE_DIMENSIONS = [
  { id: 'correctness', name: '正确性', weight: 0.25 },
  { id: 'completeness', name: '完整性', weight: 0.20 },
  { id: 'logic', name: '逻辑性', weight: 0.20 },
  { id: 'clarity', name: '清晰性', weight: 0.15 },
  { id: 'depth', name: '深度', weight: 0.10 },
  { id: 'originality', name: '原创性', weight: 0.10 },
];

// ============================================================
// 三、强度分级
// ============================================================
export const JUDGEPANEL_TIERS = {
  light: { label: '轻', judgeCount: 3, maxRounds: 1, requireConsensus: false, tokenBudgetMultiplier: 2.0 },
  medium: { label: '中', judgeCount: 5, maxRounds: 2, requireConsensus: false, tokenBudgetMultiplier: 3.5 },
  heavy: { label: '重', judgeCount: 7, maxRounds: 3, requireConsensus: true, tokenBudgetMultiplier: 5.5 },
  extreme: { label: '极', judgeCount: 8, maxRounds: 4, requireConsensus: true, tokenBudgetMultiplier: 8.0 },
};

// ============================================================
// 四、单裁判评分器
// ============================================================
export function buildJudgePrompt(judge, answer, objective) {
  return [
    `【Think 多裁判投票·${judge.name}评分】`,
    `${judge.persona}`,
    ``,
    `你的评判侧重：${judge.focus}`,
    `你的权重：${judge.weight}`,
    ``,
    `问题/目标：${String(objective || '').slice(0, 300)}`,
    ``,
    `待评判答案：`,
    `${String(answer || '').slice(0, 2000)}`,
    ``,
    `请按以下 6 个维度分别打分（0-10 分，允许小数），并给出简短理由：`,
    ...JUDGE_SCORE_DIMENSIONS.map((d, i) => `${i + 1}. ${d.name}（权重 ${d.weight}）：[分数] — [理由]`),
    ``,
    `最后给出：`,
    `总分：[加权总分，0-10]`,
    `总体评价：[一句话总结]`,
    `是否通过：[通过/不通过/有条件通过]`,
  ].join('\n');
}

export function parseJudgeScore(text) {
  if (!text) return { total: 0, dimensions: {}, passed: false, comment: '' };
  const dimensions = {};
  for (const dim of JUDGE_SCORE_DIMENSIONS) {
    const pattern = new RegExp(`${dim.name}[^0-9]*([0-9]+(?:\\.[0-9]+)?)`, 'i');
    const match = text.match(pattern);
    if (match) dimensions[dim.id] = Math.min(10, Math.max(0, parseFloat(match[1])));
  }
  const totalMatch = text.match(/总分[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
  const total = totalMatch ? Math.min(10, Math.max(0, parseFloat(totalMatch[1]))) : 0;
  const passed = /通过/.test(text) && !/不通过/.test(text);
  const commentMatch = text.match(/总体评价[：:]\s*([^\n]+)/i);
  return { total, dimensions, passed, comment: commentMatch ? commentMatch[1].slice(0, 200) : '' };
}

// ============================================================
// 五、投票聚合器（加权投票 + 共识检测 + 分歧识别）
// ============================================================
export function aggregateVotes(judgeResults) {
  if (!judgeResults || judgeResults.length === 0) {
    return { avgScore: 0, consensus: false, passed: false, dimensions: {}, dissenters: [], agreement: 0 };
  }
  // 加权平均
  let totalWeight = 0;
  let weightedSum = 0;
  const dimSums = {};
  const passedCount = judgeResults.filter((r) => r.score?.passed).length;
  for (const r of judgeResults) {
    const w = r.judge?.weight || 0.1;
    totalWeight += w;
    weightedSum += (r.score?.total || 0) * w;
    for (const dim of JUDGE_SCORE_DIMENSIONS) {
      if (!dimSums[dim.id]) dimSums[dim.id] = { sum: 0, weight: 0 };
      dimSums[dim.id].sum += (r.score?.dimensions?.[dim.id] || 0) * w;
      dimSums[dim.id].weight += w;
    }
  }
  const avgScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
  const dimensions = {};
  for (const dim of JUDGE_SCORE_DIMENSIONS) {
    dimensions[dim.id] = dimSums[dim.id].weight > 0
      ? Math.round((dimSums[dim.id].sum / dimSums[dim.id].weight) * 100) / 100
      : 0;
  }
  // 共识检测：标准差
  const scores = judgeResults.map((r) => r.score?.total || 0);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const consensus = stdDev < 1.5; // 标准差小于1.5视为共识
  const agreement = Math.max(0, 100 - Math.round(stdDev * 20));
  // 分歧者识别：评分偏离均值超过1.5个标准差
  const dissenters = judgeResults
    .filter((r) => Math.abs((r.score?.total || 0) - mean) > 1.5 * stdDev && stdDev > 0)
    .map((r) => ({ judge: r.judge?.name, score: r.score?.total, comment: r.score?.comment }));
  const passed = passedCount / judgeResults.length >= 0.6;
  return { avgScore, consensus, passed, dimensions, dissenters, agreement, stdDev: Math.round(stdDev * 100) / 100, passedCount, totalJudges: judgeResults.length };
}

// ============================================================
// 六、分歧调解器（共识未达成时，让裁判看彼此的评分再投一轮）
// ============================================================
export function buildMediationPrompt(judge, allResults, aggregate) {
  const otherScores = allResults
    .filter((r) => r.judge?.id !== judge.id)
    .map((r) => `  - ${r.judge?.name}：${r.score?.total}分（${r.score?.passed ? '通过' : '不通过'}）— ${r.score?.comment || '无评论'}`)
    .join('\n');
  return [
    `【Think 多裁判投票·分歧调解·第2轮】`,
    `你是 ${judge.name}。第一轮投票未达成共识（共识度 ${aggregate.agreement}%，标准差 ${aggregate.stdDev}）。`,
    ``,
    `其他裁判的评分：`,
    otherScores,
    ``,
    `聚合结果：平均分 ${aggregate.avgScore}，${aggregate.passed ? '多数通过' : '多数不通过'}`,
    `分歧最大的维度：${Object.entries(aggregate.dimensions).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => JUDGE_SCORE_DIMENSIONS.find((d) => d.id === k)?.name).join('、')}`,
    ``,
    `请重新审视你的评分，考虑其他裁判的观点。你可以：`,
    `1. 坚持原评分（如果你确信其他裁判有误）`,
    `2. 调整评分（如果你被其他裁判的论据说服）`,
    `3. 给出更详细的理由说明你的立场`,
    ``,
    `请重新输出评分（格式同上一轮）。`,
  ].join('\n');
}

// ============================================================
// 七、少数派报告（记录被否决但有价值的少数派观点）
// ============================================================
export function generateMinorityReport(dissenters, aggregate) {
  if (!dissenters || dissenters.length === 0) return null;
  return {
    title: '少数派报告',
    summary: `有 ${dissenters.length} 位裁判的评分显著偏离共识（标准差>1.5），他们的观点值得关注。`,
    dissenters: dissenters.map((d) => ({
      judge: d.judge,
      score: d.score,
      position: d.score > aggregate.avgScore ? '高于共识（更乐观）' : '低于共识（更悲观）',
      comment: d.comment,
    })),
    recommendation: '建议在最终答案中回应少数派提出的疑虑，即使不采纳也应说明理由。',
  };
}

// ============================================================
// 八、熔断保护器
// ============================================================
export class JudgePanelFuse {
  constructor(options = {}) {
    this.maxJudges = options.maxJudges || 8;
    this.maxRounds = options.maxRounds || 4;
    this.maxTokenBudget = options.maxTokenBudget || 20000;
    this.judgeCount = 0;
    this.roundCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkJudge() {
    if (this.judgeCount >= this.maxJudges) { this.trip(`裁判数熔断：已达上限 ${this.maxJudges}`); return false; }
    this.judgeCount++;
    return true;
  }
  checkRound() {
    if (this.roundCount >= this.maxRounds) { this.trip(`投票轮次熔断：已达上限 ${this.maxRounds}`); return false; }
    this.roundCount++;
    return true;
  }
  checkToken(estimate) {
    this.tokenEstimate += estimate || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token 预算熔断：已达上限 ${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(reason) { this.tripped = true; this.tripReason = reason; }
  reset() { this.judgeCount = 0; this.roundCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() {
    return { judgeCount: this.judgeCount, maxJudges: this.maxJudges, roundCount: this.roundCount, maxRounds: this.maxRounds, tokenEstimate: this.tokenEstimate, maxTokenBudget: this.maxTokenBudget, tripped: this.tripped, tripReason: this.tripReason };
  }
}

// ============================================================
// 九、统计记录器
// ============================================================
export class JudgePanelStats {
  constructor() { this.sessions = new Map(); }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { panelsHeld: 0, totalJudges: 0, totalRounds: 0, avgScore: 0, consensusRate: 0, passRate: 0, judgeUsage: {}, fuseTrips: 0, startTime: Date.now() });
    }
    return this.sessions.get(sessionId);
  }
  recordPanel(sessionId, judgeCount, rounds, aggregate) {
    const s = this.getSession(sessionId);
    s.panelsHeld++;
    s.totalJudges += judgeCount;
    s.totalRounds += rounds;
    s.avgScore = (s.avgScore * (s.panelsHeld - 1) + aggregate.avgScore) / s.panelsHeld;
    s.consensusRate = (s.consensusRate * (s.panelsHeld - 1) + (aggregate.consensus ? 1 : 0)) / s.panelsHeld;
    s.passRate = (s.passRate * (s.panelsHeld - 1) + (aggregate.passed ? 1 : 0)) / s.panelsHeld;
  }
  recordJudgeUsage(sessionId, judgeId) {
    const s = this.getSession(sessionId);
    s.judgeUsage[judgeId] = (s.judgeUsage[judgeId] || 0) + 1;
  }
  recordFuseTrip(sessionId) { this.getSession(sessionId).fuseTrips++; }
  summary(sessionId) {
    const s = this.getSession(sessionId);
    const topJudges = Object.entries(s.judgeUsage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, count]) => { const j = JUDGE_ROLES.find((x) => x.id === id); return { name: j?.name || id, count }; });
    return { panelsHeld: s.panelsHeld, totalJudges: s.totalJudges, totalRounds: s.totalRounds, avgScore: Math.round(s.avgScore * 100) / 100, consensusRate: `${Math.round(s.consensusRate * 100)}%`, passRate: `${Math.round(s.passRate * 100)}%`, topJudges, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

// ============================================================
// 十、主引擎入口
// ============================================================
export class JudgePanelEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = JUDGEPANEL_TIERS[this.intensity] || JUDGEPANEL_TIERS.medium;
    this.fuse = new JudgePanelFuse({ maxJudges: this.tier.judgeCount, maxRounds: this.tier.maxRounds, maxTokenBudget: options.maxTokenBudget || 20000 });
    this.stats = new JudgePanelStats();
  }
  setIntensity(intensity) {
    if (JUDGEPANEL_TIERS[intensity]) { this.intensity = intensity; this.tier = JUDGEPANEL_TIERS[intensity]; }
  }
  async judge(sessionId, answer, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason, results: [], aggregate: null };
    // 选择裁判
    const shuffled = [...JUDGE_ROLES].sort(() => Math.random() - 0.5);
    const judges = shuffled.slice(0, this.tier.judgeCount);
    let allResults = [];
    let rounds = 0;
    let aggregate = null;
    // 多轮投票
    for (let round = 0; round < this.tier.maxRounds; round++) {
      if (this.fuse.tripped) break;
      if (!this.fuse.checkRound()) break;
      rounds++;
      const roundResults = [];
      for (const judge of judges) {
        if (!this.fuse.checkJudge()) break;
        if (!this.fuse.checkToken(500)) break;
        this.stats.recordJudgeUsage(sessionId, judge.id);
        const prompt = round === 0
          ? buildJudgePrompt(judge, answer, objective)
          : buildMediationPrompt(judge, allResults, aggregate);
        if (typeof steerFn === 'function') {
          try {
            const result = await steerFn(prompt, 'judgepanel-vote');
            const score = parseJudgeScore(result?.text || result?.content || '');
            roundResults.push({ judge, score, round });
          } catch (e) {
            roundResults.push({ judge, score: { total: 5, dimensions: {}, passed: false, comment: '评分失败' }, round });
          }
        }
      }
      allResults = roundResults;
      aggregate = aggregateVotes(allResults);
      // 共识达成则提前结束
      if (aggregate.consensus && round >= 1) break;
      if (aggregate.consensus && this.tier.requireConsensus) break;
    }
    // 少数派报告
    const minorityReport = generateMinorityReport(aggregate?.dissenters || [], aggregate || { avgScore: 0 });
    // 统计
    this.stats.recordPanel(sessionId, judges.length, rounds, aggregate || { avgScore: 0, consensus: false, passed: false });
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return {
      ok: true,
      judges: judges.map((j) => ({ id: j.id, name: j.name, weight: j.weight, focus: j.focus })),
      results: allResults.map((r) => ({ judge: r.judge.name, score: r.score.total, passed: r.score.passed, comment: r.score.comment, dimensions: r.score.dimensions })),
      aggregate,
      minorityReport,
      rounds,
      consensusReached: aggregate?.consensus || false,
      fuseStatus: this.fuse.status(),
    };
  }
  getStats(sessionId) { return this.stats.summary(sessionId); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

// ============================================================
// 十一、兼容函数
// ============================================================
export function createJudgePanelPrompt(objective, intensity = 'medium') {
  const tier = JUDGEPANEL_TIERS[intensity] || JUDGEPANEL_TIERS.medium;
  return [
    `【Think 多裁判投票·${tier.label}档激活】`,
    `答案生成后，由 ${tier.judgeCount} 位独立裁判（逻辑学家/经验主义者/工程师/怀疑论者/领域专家/简化者/创新者/魔鬼代言人）分别按 6 维度打分，加权聚合。`,
    `共识未达成时自动进入分歧调解轮（最多 ${tier.maxRounds} 轮），裁判看彼此评分后重新投票。`,
    `输出最终聚合分、各维度分、共识度、少数派报告。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}

export function judgepanelCadence(deepTier) {
  return Math.max(1, 3 - Math.min(2, Math.round(Number(deepTier) || 0)));
}
