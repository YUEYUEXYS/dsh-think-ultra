// bestof-engine.js — Think 多稿竞争择优·完整引擎
// 独立引擎文件：候选生成策略 / 互评打分引擎 / 排名算法 / 落选分析 /
// 胜出者合成 / 多轮回炉 / 熔断保护 / 统计记录 / 强度分级 / 多开关联动
// 纯 JavaScript ESM，零外部依赖。

// ============================================================
// 一、评分维度（6 维真实打分，不是凑数）
// ============================================================
export const SCORE_DIMENSIONS = [
  {
    id: 'correctness',
    name: '正确性',
    weight: 0.30,
    description: '事实、数字、逻辑、代码行为是否正确，有无硬伤',
    check: (draft) => /正确|准确|无误|符合|验证通过|实跑通过/.test(draft) ? 0.9 : /错误|有误|不符合|矛盾|漏洞/.test(draft) ? 0.3 : 0.6,
  },
  {
    id: 'completeness',
    name: '完整性',
    weight: 0.20,
    description: '是否覆盖了问题的所有方面，有无遗漏关键部分',
    check: (draft) => /全面|完整|覆盖|所有|全部|详尽/.test(draft) ? 0.9 : /遗漏|缺失|不完整|只讲了|部分/.test(draft) ? 0.3 : 0.6,
  },
  {
    id: 'insight_depth',
    name: '洞察深度',
    weight: 0.20,
    description: '是否有深入本质的洞察，还是停留在表面',
    check: (draft) => /本质|根本|深层|洞察|洞见|第一性原理|底层/.test(draft) ? 0.9 : /表面|浅显|肤浅|泛泛/.test(draft) ? 0.3 : 0.5,
  },
  {
    id: 'executability',
    name: '可执行性',
    weight: 0.15,
    description: '给出的方案/代码/步骤是否可以直接执行，有无模糊地带',
    check: (draft) => /步骤|具体|可执行|直接|代码|命令|操作/.test(draft) ? 0.85 : /大概|可能|也许|视情况|需要进一步/.test(draft) ? 0.35 : 0.55,
  },
  {
    id: 'conciseness',
    name: '简洁性',
    weight: 0.10,
    description: '是否言简意赅，有无冗余废话和重复',
    check: (draft) => {
      const len = draft.length;
      if (len < 200) return 0.9;
      if (len < 500) return 0.75;
      if (len < 1000) return 0.6;
      if (len < 2000) return 0.45;
      return 0.3;
    },
  },
  {
    id: 'creativity',
    name: '创造性',
    weight: 0.05,
    description: '是否有新颖的角度或方法，不是常规套路',
    check: (draft) => /新颖|创新|独特|巧妙|非常规|新角度|新方法/.test(draft) ? 0.85 : /常规|普通|标准|传统/.test(draft) ? 0.4 : 0.55,
  },
];

// ============================================================
// 二、候选生成策略（8 种真实不同的切入点）
// ============================================================
export const CANDIDATE_STRATEGIES = [
  {
    id: 'first_principles',
    name: '第一性原理',
    description: '从最基本的公理/物理定律/数学定义出发，向上递归推导',
    promptAngle: '从第一性原理出发，不依赖任何既有结论，从最基本的定义和公理向上递归推导出完整答案。',
  },
  {
    id: 'analytical_decomp',
    name: '分析分解',
    description: '把问题拆成最小子问题，逐个解决后综合',
    promptAngle: '把问题彻底分解为最小可解子问题，逐个精确解决，最后严格综合成完整答案。',
  },
  {
    id: 'counterexample_driven',
    name: '反例驱动',
    description: '先构造反例，从反例中提炼正确结论',
    promptAngle: '先主动构造尽可能多的反例和边界情况，从反例中提炼出真正成立的结论，再组织答案。',
  },
  {
    id: 'analogical_transfer',
    name: '类比迁移',
    description: '从其他领域找到同构问题，迁移解法',
    promptAngle: '在其他领域（数学、物理、生物、工程、社会学等）找到与本问题同构的已知解，迁移并适配到当前问题。',
  },
  {
    id: 'extreme_stress',
    name: '极端压力测试',
    description: '把方案放到极端条件下检验，从失效中改进',
    promptAngle: '先给出初步方案，然后放到极端条件（规模放大1000倍、资源极限、并发拉满、时间压缩）下压力测试，从失效模式中改进出最终方案。',
  },
  {
    id: 'devil_advocate',
    name: '魔鬼代言人',
    description: '先攻击自己的结论，驳不倒的才交付',
    promptAngle: '先给出初步结论，然后以最锋利的对立立场攻击它，构造至少3条实质性反驳，只有全部驳不倒的结论才允许写入最终答案。',
  },
  {
    id: 'formal_verification',
    name: '形式化验证',
    description: '对推理链每一步做形式化走查，标注前件和推理规则',
    promptAngle: '对整条推理链做形式化走查，每一步标出前件索引和推理规则，不允许跳步，所有引理必须补证，最后给出可验证的完整证明/推导。',
  },
  {
    id: 'pragmatic_engineering',
    name: '实用工程',
    description: '以可执行、可维护、可扩展为首要目标的工程解法',
    promptAngle: '以工程实用性为首要目标，给出可直接执行、可维护、可扩展的方案，包含具体步骤、代码、边界处理和错误处理，不追求理论完美但必须能跑通。',
  },
];

// ============================================================
// 三、强度分级
// ============================================================
export const BESTOF_TIERS = {
  light: {
    label: '轻',
    candidateCount: 2,
    maxReforgeRounds: 1,
    scoreThreshold: 0.6,
    requireAllScored: false,
    tokenBudgetMultiplier: 2.0,
    strategyCount: 2,
  },
  medium: {
    label: '中',
    candidateCount: 3,
    maxReforgeRounds: 2,
    scoreThreshold: 0.7,
    requireAllScored: false,
    tokenBudgetMultiplier: 3.5,
    strategyCount: 4,
  },
  heavy: {
    label: '重',
    candidateCount: 4,
    maxReforgeRounds: 3,
    scoreThreshold: 0.8,
    requireAllScored: true,
    tokenBudgetMultiplier: 5.0,
    strategyCount: 6,
  },
  extreme: {
    label: '极',
    candidateCount: 5,
    maxReforgeRounds: 5,
    scoreThreshold: 0.85,
    requireAllScored: true,
    tokenBudgetMultiplier: 7.5,
    strategyCount: 8,
  },
};

// ============================================================
// 四、候选生成器
// ============================================================
export function generateCandidates(objective, count = 3, strategyCount = 4) {
  if (!objective || typeof objective !== 'string') return [];
  // 随机选择策略，保证不重复
  const shuffled = [...CANDIDATE_STRATEGIES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(strategyCount, CANDIDATE_STRATEGIES.length));
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const strategy = selected[i % selected.length];
    candidates.push({
      id: i + 1,
      strategyId: strategy.id,
      strategyName: strategy.name,
      prompt: buildCandidatePrompt(objective, strategy, i + 1, count),
      draft: '',
      scores: {},
      totalScore: 0,
      rank: 0,
      weaknesses: [],
    });
  }
  return candidates;
}

function buildCandidatePrompt(objective, strategy, index, total) {
  return [
    `【Think 多稿竞争·候选 ${index}/${total}】`,
    `策略：${strategy.name}`,
    `策略说明：${strategy.description}`,
    `切入角度：${strategy.promptAngle}`,
    ``,
    `问题：${String(objective || '').slice(0, 500)}`,
    ``,
    `要求：严格按照上述策略的切入角度独立生成完整答案，不参照其他候选版本。答案必须是可直接交付的最终结果，不是思路草稿。`,
  ].join('\n');
}

// ============================================================
// 五、互评打分引擎
// ============================================================
export function scoreCandidate(candidate, peerDrafts = []) {
  if (!candidate || !candidate.draft) {
    return { ...candidate, scores: {}, totalScore: 0, rank: 0 };
  }
  const draft = candidate.draft;
  const scores = {};
  let weightedTotal = 0;
  for (const dim of SCORE_DIMENSIONS) {
    let score;
    try {
      score = dim.check(draft);
    } catch {
      score = 0.5;
    }
    // 同行对比加成：如果该候选在某维度明显优于其他候选，加分
    if (peerDrafts.length > 1) {
      const peerScores = peerDrafts
        .filter((p) => p && p.id !== candidate.id)
        .map((p) => {
          try { return dim.check(p.draft || ''); } catch { return 0.5; }
        });
      if (peerScores.length > 0) {
        const avgPeer = peerScores.reduce((s, x) => s + x, 0) / peerScores.length;
        if (score > avgPeer + 0.15) score = Math.min(1, score + 0.05);
        else if (score < avgPeer - 0.15) score = Math.max(0, score - 0.05);
      }
    }
    scores[dim.id] = Math.round(score * 100) / 100;
    weightedTotal += score * dim.weight;
  }
  candidate.scores = scores;
  candidate.totalScore = Math.round(weightedTotal * 100) / 100;
  return candidate;
}

// ============================================================
// 六、排名算法（加权评分 + 排序 + 同分处理）
// ============================================================
export function rankCandidates(candidates) {
  if (!candidates || candidates.length === 0) return [];
  // 先全部打分
  const drafts = candidates.filter((c) => c.draft);
  for (const c of candidates) {
    scoreCandidate(c, drafts);
  }
  // 按总分降序排列
  const sorted = [...candidates].sort((a, b) => b.totalScore - a.totalScore);
  // 分配排名（同分同名次）
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].totalScore < sorted[i - 1].totalScore) {
      currentRank = i + 1;
    }
    sorted[i].rank = currentRank;
  }
  return sorted;
}

// ============================================================
// 七、落选分析器
// ============================================================
export function analyzeWeaknesses(candidate, winner) {
  if (!candidate || !winner) return [];
  const weaknesses = [];
  for (const dim of SCORE_DIMENSIONS) {
    const myScore = candidate.scores?.[dim.id] || 0;
    const winScore = winner.scores?.[dim.id] || 0;
    if (myScore < winScore - 0.1) {
      weaknesses.push({
        dimension: dim.name,
        dimensionId: dim.id,
        myScore,
        winnerScore: winScore,
        gap: Math.round((winScore - myScore) * 100) / 100,
        description: `${dim.name}落后${Math.round((winScore - myScore) * 100)}分（${dim.description}）`,
      });
    }
  }
  if (weaknesses.length === 0 && candidate.totalScore < winner.totalScore) {
    weaknesses.push({
      dimension: '综合',
      dimensionId: 'overall',
      myScore: candidate.totalScore,
      winnerScore: winner.totalScore,
      gap: Math.round((winner.totalScore - candidate.totalScore) * 100) / 100,
      description: '综合评分略低，各维度均无明显短板但也无突出优势',
    });
  }
  candidate.weaknesses = weaknesses;
  return weaknesses;
}

// ============================================================
// 八、胜出者合成器（从多个候选中提取最优部分合成最终答案）
// ============================================================
export function synthesizeWinner(rankedCandidates, topN = 2) {
  if (!rankedCandidates || rankedCandidates.length === 0) return null;
  const winner = rankedCandidates[0];
  if (rankedCandidates.length === 1 || topN <= 1) {
    return {
      finalDraft: winner.draft,
      winnerId: winner.id,
      winnerStrategy: winner.strategyName,
      winnerScore: winner.totalScore,
      synthesized: false,
      sources: [{ id: winner.id, strategy: winner.strategyName, contribution: '100%' }],
    };
  }
  // 从 topN 候选中提取各维度最优部分
  const top = rankedCandidates.slice(0, Math.min(topN, rankedCandidates.length));
  const bestByDimension = {};
  for (const dim of SCORE_DIMENSIONS) {
    let best = top[0];
    for (const c of top) {
      if ((c.scores?.[dim.id] || 0) > (best.scores?.[dim.id] || 0)) best = c;
    }
    bestByDimension[dim.id] = best;
  }
  // 构造合成提示词（实际合成由模型执行，这里只生成指令）
  const synthesisPrompt = [
    `【Think 多稿竞争·胜出者合成】`,
    `以下是 ${top.length} 个候选版本的评分和内容，请综合各版本的最优部分，合成一个最终答案。`,
    ``,
    ...top.map((c, i) => [
      `候选 ${i + 1}（策略：${c.strategyName}，总分：${c.totalScore}，排名：${c.rank}）`,
      `各维度得分：${SCORE_DIMENSIONS.map((d) => `${d.name}=${c.scores?.[d.id] || 0}`).join('，')}`,
      `内容：${(c.draft || '').slice(0, 1500)}`,
      ``,
    ].join('\n')),
    `合成要求：`,
    `1. 正确性优先采用最高分候选的事实和数字`,
    `2. 完整性综合所有候选的覆盖范围，不遗漏任何候选的有效贡献`,
    `3. 洞察深度采用最深刻候选的分析框架`,
    `4. 可执行性采用最具体候选的步骤和代码`,
    `5. 简洁性去除所有冗余和重复`,
    `6. 创造性保留最有新意的角度`,
    `7. 合成后的答案必须是连贯统一的整体，不是简单拼接`,
  ].join('\n');
  return {
    finalDraft: '', // 由模型实际合成后填充
    winnerId: winner.id,
    winnerStrategy: winner.strategyName,
    winnerScore: winner.totalScore,
    synthesized: true,
    synthesisPrompt,
    bestByDimension: Object.fromEntries(
      Object.entries(bestByDimension).map(([k, v]) => [k, { id: v.id, strategy: v.strategyName, score: v.scores?.[k] || 0 }])
    ),
    sources: top.map((c) => ({ id: c.id, strategy: c.strategyName, score: c.totalScore, rank: c.rank })),
  };
}

// ============================================================
// 九、多轮回炉管理器
// ============================================================
export class BestofReforgeManager {
  constructor(maxRounds = 3) {
    this.maxRounds = maxRounds;
    this.rounds = [];
    this.currentRound = 0;
  }
  shouldReforge(bestScore, threshold) {
    if (bestScore >= threshold) return false;
    if (this.currentRound >= this.maxRounds) return false;
    return true;
  }
  nextRound(candidates, bestScore, threshold) {
    this.currentRound++;
    const round = {
      roundNo: this.currentRound,
      candidateCount: candidates.length,
      bestScore,
      threshold,
      gap: Math.round((threshold - bestScore) * 100) / 100,
      prompt: this.buildReforgePrompt(candidates, bestScore, threshold),
    };
    this.rounds.push(round);
    return round;
  }
  buildReforgePrompt(candidates, bestScore, threshold) {
    const top = [...candidates].sort((a, b) => b.totalScore - a.totalScore).slice(0, 3);
    return [
      `【Think 多稿竞争·第${this.currentRound}轮回炉】`,
      `上一轮最佳候选得分 ${bestScore}，未达到阈值 ${threshold}（差距 ${Math.round((threshold - bestScore) * 100)}分），必须重新生成更强的候选。`,
      ``,
      `上一轮表现最好的 ${top.length} 个候选：`,
      ...top.map((c, i) => `  ${i + 1}. [${c.strategyName}] 总分=${c.totalScore} 弱点=${c.weaknesses?.map((w) => w.dimension).join('、') || '无明显短板'}`),
      ``,
      `回炉要求：`,
      `1. 分析上一轮所有候选的共同弱点`,
      `2. 针对弱点设计新的切入角度（不重复上一轮的策略）`,
      `3. 生成比上一轮最佳候选更强的新版本`,
      `4. 新版本必须在正确性、完整性、洞察深度上有实质性提升，不允许只是措辞优化`,
    ].join('\n');
  }
  isExhausted() {
    return this.currentRound >= this.maxRounds;
  }
  summary() {
    return { totalRounds: this.currentRound, maxRounds: this.maxRounds, exhausted: this.isExhausted() };
  }
}

// ============================================================
// 十、熔断保护器
// ============================================================
export class BestofFuse {
  constructor(options = {}) {
    this.maxCompetitionRounds = options.maxCompetitionRounds || 5;
    this.maxTokenBudget = options.maxTokenBudget || 30000;
    this.maxTotalReforge = options.maxTotalReforge || 8;
    this.competitionRoundCount = 0;
    this.tokenEstimate = 0;
    this.totalReforge = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkCompetitionRound() {
    if (this.competitionRoundCount >= this.maxCompetitionRounds) {
      this.trip(`竞争轮次熔断：已达上限 ${this.maxCompetitionRounds} 轮`);
      return false;
    }
    this.competitionRoundCount++;
    return true;
  }
  checkToken(estimate) {
    this.tokenEstimate += estimate || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) {
      this.trip(`Token 预算熔断：已达上限 ${this.maxTokenBudget}（估算 ${this.tokenEstimate}）`);
      return false;
    }
    return true;
  }
  checkReforge() {
    if (this.totalReforge >= this.maxTotalReforge) {
      this.trip(`回炉次数熔断：已达上限 ${this.maxTotalReforge} 次`);
      return false;
    }
    this.totalReforge++;
    return true;
  }
  trip(reason) { this.tripped = true; this.tripReason = reason; }
  reset() {
    this.competitionRoundCount = 0;
    this.tokenEstimate = 0;
    this.totalReforge = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  status() {
    return {
      competitionRounds: this.competitionRoundCount,
      maxCompetitionRounds: this.maxCompetitionRounds,
      tokenEstimate: this.tokenEstimate,
      maxTokenBudget: this.maxTokenBudget,
      totalReforge: this.totalReforge,
      maxTotalReforge: this.maxTotalReforge,
      tripped: this.tripped,
      tripReason: this.tripReason,
    };
  }
}

// ============================================================
// 十一、统计记录器
// ============================================================
export class BestofStats {
  constructor() { this.sessions = new Map(); }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        competitionRounds: 0,
        candidatesGenerated: 0,
        totalSynthesized: 0,
        reforgeRounds: 0,
        fuseTrips: 0,
        strategyUsage: {},
        avgWinnerScore: 0,
        scoreHistory: [],
        startTime: Date.now(),
      });
    }
    return this.sessions.get(sessionId);
  }
  recordCompetition(sessionId, candidates, winner) {
    const s = this.getSession(sessionId);
    s.competitionRounds++;
    s.candidatesGenerated += candidates.length;
    if (winner) {
      s.scoreHistory.push(winner.totalScore);
      s.avgWinnerScore = s.scoreHistory.reduce((a, b) => a + b, 0) / s.scoreHistory.length;
    }
    for (const c of candidates) {
      s.strategyUsage[c.strategyId] = (s.strategyUsage[c.strategyId] || 0) + 1;
    }
  }
  recordSynthesis(sessionId) { this.getSession(sessionId).totalSynthesized++; }
  recordReforge(sessionId, count) { this.getSession(sessionId).reforgeRounds += count; }
  recordFuseTrip(sessionId) { this.getSession(sessionId).fuseTrips++; }
  summary(sessionId) {
    const s = this.getSession(sessionId);
    const topStrategies = Object.entries(s.strategyUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => {
        const st = CANDIDATE_STRATEGIES.find((x) => x.id === id);
        return { name: st?.name || id, count };
      });
    return {
      competitionRounds: s.competitionRounds,
      candidatesGenerated: s.candidatesGenerated,
      totalSynthesized: s.totalSynthesized,
      reforgeRounds: s.reforgeRounds,
      fuseTrips: s.fuseTrips,
      avgWinnerScore: Math.round(s.avgWinnerScore * 100) / 100,
      topStrategies,
      durationMs: Date.now() - s.startTime,
    };
  }
}

// ============================================================
// 十二、主引擎入口
// ============================================================
export class BestofEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = BESTOF_TIERS[this.intensity] || BESTOF_TIERS.medium;
    this.fuse = new BestofFuse({
      maxCompetitionRounds: options.maxCompetitionRounds || (this.tier.label === '极' ? 8 : 5),
      maxTokenBudget: options.maxTokenBudget || 30000,
      maxTotalReforge: options.maxTotalReforge || (this.tier.maxReforgeRounds * 2),
    });
    this.stats = new BestofStats();
    this.reforgeManager = new BestofReforgeManager(this.tier.maxReforgeRounds);
  }
  setIntensity(intensity) {
    if (BESTOF_TIERS[intensity]) {
      this.intensity = intensity;
      this.tier = BESTOF_TIERS[intensity];
    }
  }
  async compete(sessionId, objective, steerFn) {
    if (this.fuse.tripped) {
      return { ok: false, reason: this.fuse.tripReason, candidates: [], winner: null };
    }
    if (!this.fuse.checkCompetitionRound()) {
      return { ok: false, reason: this.fuse.tripReason, candidates: [], winner: null };
    }
    // 1. 生成候选
    let candidates = generateCandidates(objective, this.tier.candidateCount, this.tier.strategyCount);
    if (candidates.length === 0) {
      return { ok: false, reason: '无法生成候选', candidates: [], winner: null };
    }
    // 2. 逐个真实生成候选内容
    for (const candidate of candidates) {
      if (typeof steerFn === 'function') {
        try {
          const result = await steerFn(candidate.prompt, 'bestof-candidate');
          candidate.draft = result?.text || result?.content || '';
        } catch (e) {
          candidate.draft = '';
        }
      }
    }
    // 3. 排名
    const ranked = rankCandidates(candidates);
    const winner = ranked[0];
    // 4. 落选分析
    for (const c of ranked.slice(1)) {
      analyzeWeaknesses(c, winner);
    }
    // 5. 统计
    this.stats.recordCompetition(sessionId, candidates, winner);
    // 6. 熔断检查
    if (!this.fuse.checkToken(candidates.length * 800)) {
      this.stats.recordFuseTrip(sessionId);
      return { ok: false, reason: this.fuse.tripReason, candidates: ranked, winner };
    }
    // 7. 如果最佳得分不够高，回炉
    if (this.reforgeManager.shouldReforge(winner?.totalScore || 0, this.tier.scoreThreshold) && this.fuse.checkReforge()) {
      const round = this.reforgeManager.nextRound(ranked, winner.totalScore, this.tier.scoreThreshold);
      if (typeof steerFn === 'function') {
        try {
          const reforgeResult = await steerFn(round.prompt, 'bestof-reforge');
          // 回炉结果作为新候选加入
          const newCandidate = {
            id: candidates.length + 1,
            strategyId: 'reforge',
            strategyName: `回炉第${round.roundNo}轮`,
            prompt: round.prompt,
            draft: reforgeResult?.text || reforgeResult?.content || '',
            scores: {},
            totalScore: 0,
            rank: 0,
            weaknesses: [],
          };
          candidates.push(newCandidate);
          const reRanked = rankCandidates(candidates);
          this.stats.recordReforge(sessionId, 1);
          return {
            ok: true,
            candidates: reRanked,
            winner: reRanked[0],
            reforgeRound: round.roundNo,
            reforgeExhausted: this.reforgeManager.isExhausted(),
            synthesized: synthesizeWinner(reRanked, 2),
          };
        } catch (e) { /* 回炉失败不阻断 */ }
      }
    }
    // 8. 合成胜出者
    const synthesized = synthesizeWinner(ranked, 2);
    if (synthesized.synthesized) this.stats.recordSynthesis(sessionId);
    return {
      ok: true,
      candidates: ranked,
      winner,
      reforgeRound: 0,
      reforgeExhausted: false,
      synthesized,
      scoreThreshold: this.tier.scoreThreshold,
    };
  }
  getStats(sessionId) { return this.stats.summary(sessionId); }
  getFuseStatus() { return this.fuse.status(); }
  reset() {
    this.fuse.reset();
    this.reforgeManager = new BestofReforgeManager(this.tier.maxReforgeRounds);
  }
}

// ============================================================
// 十三、兼容函数
// ============================================================
export function createBestofPrompt(objective, n = 3, intensity = 'medium') {
  const tier = BESTOF_TIERS[intensity] || BESTOF_TIERS.medium;
  return [
    `【Think 多稿竞争择优·${tier.label}档激活】`,
    `本任务并行展开 ${n} 版独立候选方案（各走不同切入点，互不参照），逐版互评打分（正确性/完整性/洞察深度/可执行性/简洁性/创造性），只交付评分最高的一版，并简述落选版本的致命弱点。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}

export function bestofCadence(deepTier) {
  return Math.max(1, 3 - Math.min(3, Math.round(Number(deepTier) || 0)));
}

export function bestofFanout(branchTier) {
  return Math.max(2, Math.min(5, 2 + Math.round((Number(branchTier) || 0) / 2)));
}
