// l3forge-engine.js — Think L3锻造·完整引擎
// 独立引擎文件：锻造层级定义 / 元认知策略库 / 自我反思循环 /
// 抽象提升 / 知识整合 / 质量跃迁 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const FORGE_LEVELS = [
  { level: 1, name: 'L1 直答', description: '直接回答，无反思', characteristics: ['单轮', '无元认知', '快速'] },
  { level: 2, name: 'L2 反思', description: '回答后自我检查，发现问题修正', characteristics: ['单轮反思', '错误修正', '基础校验'] },
  { level: 3, name: 'L3 锻造', description: '多层元认知锻造，抽象提升，知识整合，质量跃迁', characteristics: ['多层反思', '抽象提升', '知识整合', '质量跃迁', '自我证伪'] },
  { level: 4, name: 'L4 超越', description: '超越问题本身，发现更深层的本质和联系', characteristics: ['本质洞察', '跨域联系', '范式突破', '哲学思辨'] },
];

export const METACOGNITIVE_STRATEGIES = [
  { id: 'self_questioning', name: '自我追问', description: '对自己的每个结论追问"为什么""凭什么""还有什么可能"' },
  { id: 'perspective_shift', name: '视角切换', description: '从完全不同的视角重新审视问题（用户/对手/旁观者/未来/过去）' },
  { id: 'abstraction', name: '抽象提升', description: '从具体案例中提炼出一般规律、原则、模式' },
  { id: 'integration', name: '知识整合', description: '将不同领域、不同层次的知识整合为统一的理解框架' },
  { id: 'counterfactual', name: '反事实推演', description: '假设关键前提不成立，推演会发生什么，检验结论的鲁棒性' },
  { id: 'first_principles', name: '第一性原理', description: '回到最基本的公理和定义，从底层重新推导' },
  { id: 'analogy_mapping', name: '类比映射', description: '在看似不相关的领域之间找到结构同构，迁移洞察' },
  { id: 'limitation_analysis', name: '局限分析', description: '主动分析当前结论的适用范围、前提条件、局限性' },
  { id: 'contradiction_hunt', name: '矛盾搜寻', description: '主动搜寻结论内部、结论与已知事实之间的矛盾' },
  { id: 'quality_jump', name: '质量跃迁', description: '在已有答案基础上，追求更高层次的简洁、深刻、优雅' },
];

export const L3FORGE_TIERS = {
  light: { label: '轻', strategyCount: 3, maxReflectionRounds: 2, targetLevel: 2, tokenBudgetMultiplier: 1.8 },
  medium: { label: '中', strategyCount: 5, maxReflectionRounds: 3, targetLevel: 3, tokenBudgetMultiplier: 3.0 },
  heavy: { label: '重', strategyCount: 7, maxReflectionRounds: 4, targetLevel: 3, tokenBudgetMultiplier: 4.5 },
  extreme: { label: '极', strategyCount: 10, maxReflectionRounds: 6, targetLevel: 4, tokenBudgetMultiplier: 7.0 },
};

export const QUALITY_DIMENSIONS = [
  { id: 'depth', name: '深度', weight: 0.25, description: '是否触及本质，还是停留在表面' },
  { id: 'breadth', name: '广度', weight: 0.15, description: '是否覆盖了问题的各个方面' },
  { id: 'coherence', name: '一致性', weight: 0.20, description: '内部是否自洽，有无矛盾' },
  { id: 'elegance', name: '优雅性', weight: 0.15, description: '是否简洁、有力、有美感' },
  { id: 'novelty', name: '新颖性', weight: 0.15, description: '是否有新的洞察、新的角度' },
  { id: 'rigor', name: '严谨性', weight: 0.10, description: '推理是否严密，证据是否充分' },
];

export function scoreQuality(text, dimensions) {
  if (!text || typeof text !== 'string') return { total: 0, dimensions: {} };
  const scores = {};
  let total = 0;
  for (const dim of dimensions) {
    let s = heuristicQualityScore(dim.id, text);
    scores[dim.id] = Math.round(s * 100) / 100;
    total += s * dim.weight;
  }
  return { total: Math.round(total * 100) / 100, dimensions: scores };
}

function heuristicQualityScore(dimId, text) {
  const len = text.length;
  switch (dimId) {
    case 'depth':
      if (/本质|根本|深层|底层|第一性原理|机制|原理|根源|核心/.test(text)) return 0.85;
      if (/因为|由于|导致|引起|从而/.test(text)) return 0.65;
      return 0.45;
    case 'breadth':
      if (/方面|维度|角度|层面|层次|不仅|而且|同时|此外/.test(text)) return 0.8;
      if (len > 500) return 0.65;
      return 0.5;
    case 'coherence':
      if (/因此|所以|综上|综上所述|由此可见|一致|统一/.test(text)) return 0.8;
      if (/但是|然而|不过|矛盾|冲突|相反/.test(text)) return 0.55;
      return 0.65;
    case 'elegance':
      if (len < 400 && /本质|核心|关键|简洁/.test(text)) return 0.85;
      if (len < 800) return 0.7;
      if (len > 2000) return 0.45;
      return 0.6;
    case 'novelty':
      if (/新的|新颖|创新|独特|巧妙|非常规|新角度|新方法|洞察|洞见/.test(text)) return 0.85;
      if (/通常|一般|常规|标准|传统/.test(text)) return 0.45;
      return 0.55;
    case 'rigor':
      if (/证明|验证|实验|数据|证据|严格|严密|精确|准确/.test(text)) return 0.85;
      if (/可能|也许|大概|或许|不确定/.test(text)) return 0.45;
      return 0.6;
    default:
      return 0.5;
  }
}

export function buildForgePrompt(strategy, objective, currentAnswer, roundNo, targetLevel) {
  const st = METACOGNITIVE_STRATEGIES.find((s) => s.id === strategy) || METACOGNITIVE_STRATEGIES[0];
  const level = FORGE_LEVELS.find((l) => l.level === targetLevel) || FORGE_LEVELS[2];
  return [
    `【Think L3锻造·第${roundNo}轮·${st.name}】`,
    `目标锻造层级：${level.name}（${level.description}）`,
    `锻造策略：${st.name}`,
    `策略说明：${st.description}`,
    ``,
    `问题/目标：${String(objective || '').slice(0, 300)}`,
    ``,
    `当前答案：`,
    `${String(currentAnswer || '').slice(0, 1500)}`,
    ``,
    `请使用"${st.name}"策略对当前答案进行锻造提升。要求：`,
    `1. 严格按照策略说明执行`,
    `2. 锻造后的答案必须在质量上有实质性提升，不允许只是措辞优化`,
    `3. 目标是达到${level.name}的质量标准`,
    `4. 附"锻造说明：用了什么策略，提升了什么"`,
  ].join('\n');
}

export function detectLevel(text) {
  let score = 1;
  if (/反思|检查|修正|错误|问题/.test(text)) score = Math.max(score, 2);
  if (/本质|根本|深层|底层|第一性原理|抽象|整合|元认知|自我证伪|质量跃迁/.test(text)) score = Math.max(score, 3);
  if (/超越|范式|哲学|本质洞察|跨域联系|宇宙|存在|意义/.test(text)) score = Math.max(score, 4);
  return { level: score, name: FORGE_LEVELS.find((l) => l.level === score)?.name || `L${score}` };
}

export class L3ForgeFuse {
  constructor(options = {}) {
    this.maxForgeSessions = options.maxForgeSessions || 5;
    this.maxReflectionRounds = options.maxReflectionRounds || 6;
    this.maxTokenBudget = options.maxTokenBudget || 25000;
    this.forgeCount = 0;
    this.reflectionCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkForge() {
    if (this.forgeCount >= this.maxForgeSessions) { this.trip(`锻造次数熔断：${this.maxForgeSessions}`); return false; }
    this.forgeCount++;
    return true;
  }
  checkReflection() {
    if (this.reflectionCount >= this.maxReflectionRounds) { this.trip(`反思轮次熔断：${this.maxReflectionRounds}`); return false; }
    this.reflectionCount++;
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.forgeCount = 0; this.reflectionCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { forgeCount: this.forgeCount, maxForgeSessions: this.maxForgeSessions, reflectionCount: this.reflectionCount, maxReflectionRounds: this.maxReflectionRounds, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class L3ForgeStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { forgesRun: 0, totalReflections: 0, avgInitialScore: 0, avgFinalScore: 0, avgImprovement: 0, levelUpCount: 0, strategyUsage: {}, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordForge(id, initialScore, finalScore, reflections, levelUp, strategies) {
    const s = this.getSession(id);
    s.forgesRun++;
    s.totalReflections += reflections;
    s.avgInitialScore = (s.avgInitialScore * (s.forgesRun - 1) + initialScore) / s.forgesRun;
    s.avgFinalScore = (s.avgFinalScore * (s.forgesRun - 1) + finalScore) / s.forgesRun;
    s.avgImprovement = (s.avgImprovement * (s.forgesRun - 1) + (finalScore - initialScore)) / s.forgesRun;
    if (levelUp) s.levelUpCount++;
    for (const st of strategies) s.strategyUsage[st] = (s.strategyUsage[st] || 0) + 1;
  }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    const topStrategies = Object.entries(s.strategyUsage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sid, c]) => { const st = METACOGNITIVE_STRATEGIES.find((x) => x.id === sid); return { name: st?.name || sid, count: c }; });
    return { forgesRun: s.forgesRun, totalReflections: s.totalReflections, avgInitialScore: Math.round(s.avgInitialScore * 100) / 100, avgFinalScore: Math.round(s.avgFinalScore * 100) / 100, avgImprovement: Math.round(s.avgImprovement * 100) / 100, levelUpCount: s.levelUpCount, topStrategies, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class L3ForgeEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = L3FORGE_TIERS[this.intensity] || L3FORGE_TIERS.medium;
    this.fuse = new L3ForgeFuse({ maxReflectionRounds: this.tier.maxReflectionRounds });
    this.stats = new L3ForgeStats();
  }
  setIntensity(i) { if (L3FORGE_TIERS[i]) { this.intensity = i; this.tier = L3FORGE_TIERS[i]; } }
  async forge(sessionId, answer, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    if (!this.fuse.checkForge()) return { ok: false, reason: this.fuse.tripReason };
    const initialLevel = detectLevel(answer);
    const initialScore = scoreQuality(answer, QUALITY_DIMENSIONS);
    const shuffled = [...METACOGNITIVE_STRATEGIES].sort(() => Math.random() - 0.5);
    const strategies = shuffled.slice(0, this.tier.strategyCount);
    let currentAnswer = answer;
    let currentScore = initialScore;
    let reflections = 0;
    const usedStrategies = [];
    for (let i = 0; i < strategies.length; i++) {
      if (this.fuse.tripped) break;
      if (!this.fuse.checkReflection()) break;
      if (!this.fuse.checkToken(600)) break;
      const prompt = buildForgePrompt(strategies[i].id, objective, currentAnswer, i + 1, this.tier.targetLevel);
      if (typeof steerFn === 'function') {
        try {
          const result = await steerFn(prompt, 'l3forge-reflect');
          const newAnswer = result?.text || result?.content || currentAnswer;
          const newScore = scoreQuality(newAnswer, QUALITY_DIMENSIONS);
          if (newScore.total > currentScore.total) {
            currentAnswer = newAnswer;
            currentScore = newScore;
            usedStrategies.push(strategies[i].id);
          }
          reflections++;
          const newLevel = detectLevel(currentAnswer);
          if (newLevel.level >= this.tier.targetLevel && currentScore.total >= 0.75) break;
        } catch (e) { break; }
      }
    }
    const finalLevel = detectLevel(currentAnswer);
    const levelUp = finalLevel.level > initialLevel.level;
    this.stats.recordForge(sessionId, initialScore.total, currentScore.total, reflections, levelUp, usedStrategies);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, initialLevel: initialLevel.name, finalLevel: finalLevel.name, levelUp, initialScore: initialScore.total, finalScore: currentScore.total, improvement: Math.round((currentScore.total - initialScore.total) * 100) / 100, dimensions: currentScore.dimensions, reflections, usedStrategies: usedStrategies.map((id) => METACOGNITIVE_STRATEGIES.find((s) => s.id === id)?.name || id), forgedAnswer: currentAnswer, targetLevel: this.tier.targetLevel, fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

export function createL3ForgePrompt(objective, intensity = 'medium') {
  const tier = L3FORGE_TIERS[intensity] || L3FORGE_TIERS.medium;
  const level = FORGE_LEVELS.find((l) => l.level === tier.targetLevel) || FORGE_LEVELS[2];
  return [`【Think L3锻造·${tier.label}档激活】`, `答案生成后，进入${tier.strategyCount}种元认知策略的多层锻造（${METACOGNITIVE_STRATEGIES.slice(0, tier.strategyCount).map((s) => s.name).join('、')}）。`, `目标锻造层级：${level.name}（${level.description}）`, `每轮锻造后6维质量评分（深度/广度/一致性/优雅性/新颖性/严谨性），只保留有提升的版本。`, `最多${tier.maxReflectionRounds}轮反思，达到目标层级且评分≥0.75提前结束。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
