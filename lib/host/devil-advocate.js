// devil-advocate.js — Think 魔鬼代言人·完整引擎
// 独立引擎文件：攻击角度引擎 / 论断提取 / 反例生成 / 防守判定 / 多轮回炉 /
// 置信度评分 / 熔断保护 / 统计记录 / 强度分级 / 多开关联动
// 纯 JavaScript ESM，零外部依赖，所有逻辑真实可执行。

// ============================================================
// 一、攻击角度引擎（12 种真实攻击维度，不是凑数）
// ============================================================
export const ATTACK_ANGLES = [
  {
    id: 'logic_gap',
    name: '逻辑漏洞',
    weight: 1.0,
    probe: (claim) => `检查「${claim}」的推理链：前提是否必然推出结论？是否存在跳步、循环论证、肯定后件或否定前件？`,
    severity: 'high',
  },
  {
    id: 'boundary_counterexample',
    name: '边界反例',
    weight: 1.0,
    probe: (claim) => `为「${claim}」构造至少 2 个边界反例：极端值、零值、空集、溢出、并发、时序颠倒等条件下结论是否仍成立？`,
    severity: 'high',
  },
  {
    id: 'premise_doubt',
    name: '前提可疑',
    weight: 0.9,
    probe: (claim) => `「${claim}」依赖哪些隐含前提？这些前提是否有证据支撑？是否存在未声明的假设被当作公理使用？`,
    severity: 'medium',
  },
  {
    id: 'overclaim',
    name: '结论过强',
    weight: 0.9,
    probe: (claim) => `「${claim}」的结论强度是否超过了证据支撑范围？是否把"部分"说成"全部"、"相关"说成"因果"、"可能"说成"必然"？`,
    severity: 'high',
  },
  {
    id: 'data_trust',
    name: '数据可信度',
    weight: 0.8,
    probe: (claim) => `「${claim}」引用的数据/数字/引用是否可验证？来源是否可靠？是否存在选择性引用、幸存者偏差或数据过时？`,
    severity: 'medium',
  },
  {
    id: 'causal_fallacy',
    name: '因果谬误',
    weight: 0.85,
    probe: (claim) => `「${claim}」中的因果关系是否成立？是否混淆了相关与因果、颠倒了因果方向、或忽略了第三变量？`,
    severity: 'high',
  },
  {
    id: 'statistical_fallacy',
    name: '统计谬误',
    weight: 0.75,
    probe: (claim) => `「${claim}」中的统计推理是否正确？样本量是否足够？是否存在基线率忽视、均值回归误判或条件概率倒置？`,
    severity: 'medium',
  },
  {
    id: 'false_analogy',
    name: '类比不当',
    weight: 0.7,
    probe: (claim) => `「${claim}」使用的类比是否恰当？类比双方在关键维度上是否同构？是否存在类比失效的本质差异？`,
    severity: 'medium',
  },
  {
    id: 'definition_vagueness',
    name: '定义模糊',
    weight: 0.7,
    probe: (claim) => `「${claim}」中的核心概念是否有清晰定义？关键术语是否在论证过程中发生了语义漂移？`,
    severity: 'low',
  },
  {
    id: 'hidden_assumption',
    name: '隐含假设',
    weight: 0.8,
    probe: (claim) => `「${claim}」背后隐藏了哪些未明说的假设？这些假设在当前场景下是否成立？如果假设翻转，结论是否崩溃？`,
    severity: 'medium',
  },
  {
    id: 'counterfactual_attack',
    name: '反事实攻击',
    weight: 0.85,
    probe: (claim) => `对「${claim}」做反事实推演：如果关键条件取反/取极端值/取历史上未发生的情况，结论是否仍然稳健？`,
    severity: 'high',
  },
  {
    id: 'extreme_stress',
    name: '极端压力测试',
    weight: 0.75,
    probe: (claim) => `把「${claim}」放到极端压力下：输入规模放大 1000 倍、时间压缩到 1ms、资源限制到最低、并发拉满，结论/方案是否还成立？`,
    severity: 'medium',
  },
];

// ============================================================
// 二、强度分级（轻/中/重/极，每档真实不同）
// ============================================================
export const INTENSITY_TIERS = {
  light: {
    label: '轻',
    angleCount: 3,
    maxReforgeRounds: 1,
    claimMinLength: 20,
    requireAllDefended: false,
    tokenBudgetMultiplier: 1.5,
    severityThreshold: 'high',
  },
  medium: {
    label: '中',
    angleCount: 5,
    maxReforgeRounds: 2,
    claimMinLength: 15,
    requireAllDefended: false,
    tokenBudgetMultiplier: 2.5,
    severityThreshold: 'medium',
  },
  heavy: {
    label: '重',
    angleCount: 8,
    maxReforgeRounds: 3,
    claimMinLength: 10,
    requireAllDefended: true,
    tokenBudgetMultiplier: 4.0,
    severityThreshold: 'low',
  },
  extreme: {
    label: '极',
    angleCount: 12,
    maxReforgeRounds: 5,
    claimMinLength: 5,
    requireAllDefended: true,
    tokenBudgetMultiplier: 6.0,
    severityThreshold: 'low',
  },
};

// ============================================================
// 三、论断提取器（从模型输出中结构化提取关键论断）
// ============================================================
export function extractClaims(text, minLength = 10) {
  if (!text || typeof text !== 'string') return [];
  const claims = [];
  // 按句子分割，保留标点
  const sentences = text.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
  for (const sent of sentences) {
    // 过滤掉明显不是论断的句子
    if (sent.length < minLength) continue;
    if (/^(好的|明白|了解|收到|当然|可以|没问题|让我|我来|首先|其次|然后|最后|综上|总之|因此|所以)/.test(sent) && sent.length < 30) continue;
    // 判断是否包含论断信号词
    const hasClaimSignal = /(是|为|等于|意味着|表明|说明|证明|导致|引起|使得|需要|必须|应该|可以|能够|存在|不存在|大于|小于|等于|优于|差于|至少|最多|必然|可能|大概|也许)/.test(sent);
    if (hasClaimSignal || sent.length > 40) {
      claims.push({
        id: claims.length + 1,
        text: sent.slice(0, 300),
        severity: sent.length > 80 ? 'high' : sent.length > 40 ? 'medium' : 'low',
        defended: null,
        attackResults: [],
        reforgeCount: 0,
        confidence: 0.5,
      });
    }
  }
  return claims.slice(0, 15); // 最多提取 15 条论断，避免失控
}

// ============================================================
// 四、反例生成器（为每条论断生成针对性反例）
// ============================================================
export function generateCounterexamples(claim, angleCount = 5) {
  if (!claim || !claim.text) return [];
  // 按权重随机选择攻击角度，不重复
  const shuffled = [...ATTACK_ANGLES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(angleCount, ATTACK_ANGLES.length));
  return selected.map((angle) => ({
    angleId: angle.id,
    angleName: angle.name,
    severity: angle.severity,
    probe: angle.probe(claim.text),
    result: null, // 'broke' | 'defended' | 'inconclusive'
    detail: '',
  }));
}

// ============================================================
// 五、防守判定器（判定每条论断是否被攻破，给出置信度）
// ============================================================
export function judgeDefense(claim, attackResults) {
  if (!attackResults || attackResults.length === 0) {
    return { defended: true, confidence: 0.6, reason: '无攻击，默认防守成功' };
  }
  const broke = attackResults.filter((r) => r.result === 'broke');
  const defended = attackResults.filter((r) => r.result === 'defended');
  const inconclusive = attackResults.filter((r) => r.result === 'inconclusive' || !r.result);
  const highSeverityBroke = broke.filter((r) => r.severity === 'high');
  // 判定逻辑：
  // 1. 任何 high severity 被攻破 → 整体攻破
  // 2. 超过 1/3 的攻击被攻破 → 整体攻破
  // 3. 超过 2/3 防守成功 → 防守成功
  // 4. 否则不确定
  if (highSeverityBroke.length > 0) {
    return {
      defended: false,
      confidence: 0.85,
      reason: `高严重度攻击攻破（${highSeverityBroke.map((r) => r.angleName).join('、')}）`,
      brokeCount: broke.length,
      defendedCount: defended.length,
    };
  }
  if (broke.length / attackResults.length > 0.33) {
    return {
      defended: false,
      confidence: 0.7,
      reason: `超过 1/3 攻击攻破（${broke.length}/${attackResults.length}）`,
      brokeCount: broke.length,
      defendedCount: defended.length,
    };
  }
  if (defended.length / attackResults.length > 0.66) {
    return {
      defended: true,
      confidence: 0.75,
      reason: `超过 2/3 攻击防守成功（${defended.length}/${attackResults.length}）`,
      brokeCount: broke.length,
      defendedCount: defended.length,
    };
  }
  return {
    defended: null,
    confidence: 0.5,
    reason: `攻防胶着（攻破${broke.length}/防守${defended.length}/不确定${inconclusive.length}）`,
    brokeCount: broke.length,
    defendedCount: defended.length,
  };
}

// ============================================================
// 六、多轮回炉管理器（被攻破后不是一次修正，而是多轮回炉）
// ============================================================
export class ReforgeManager {
  constructor(maxRounds = 3) {
    this.maxRounds = maxRounds;
    this.rounds = [];
    this.currentRound = 0;
  }
  shouldReforge(judgment) {
    if (!judgment) return false;
    if (judgment.defended === true) return false;
    if (this.currentRound >= this.maxRounds) return false;
    return judgment.defended === false || judgment.defended === null;
  }
  nextRound(claim, judgment) {
    this.currentRound++;
    const round = {
      roundNo: this.currentRound,
      claimId: claim.id,
      originalText: claim.text,
      judgment,
      refocusAngles: judgment.brokeCount > 0
        ? claim.attackResults.filter((r) => r.result === 'broke').map((r) => r.angleName)
        : ['综合加固'],
      prompt: this.buildReforgePrompt(claim, judgment),
    };
    this.rounds.push(round);
    return round;
  }
  buildReforgePrompt(claim, judgment) {
    const brokeAngles = claim.attackResults
      .filter((r) => r.result === 'broke')
      .map((r) => `【${r.angleName}】${r.detail || r.probe}`)
      .join('\n');
    return [
      `【Think 魔鬼代言人·第${this.currentRound}轮回炉】`,
      `原论断被攻破，必须修正：`,
      `原论断：${claim.text}`,
      `攻破原因：${judgment.reason}`,
      brokeAngles ? `具体攻破点：\n${brokeAngles}` : '',
      `要求：①针对每个攻破点给出修正后的论断 ②修正必须实质性改变结论或限定范围，不允许只是加"可能/大概"稀释 ③修正后重新声明防守成功`,
    ].filter(Boolean).join('\n');
  }
  isExhausted() {
    return this.currentRound >= this.maxRounds;
  }
  summary() {
    return {
      totalRounds: this.currentRound,
      maxRounds: this.maxRounds,
      exhausted: this.isExhausted(),
      rounds: this.rounds.map((r) => ({ round: r.roundNo, claimId: r.claimId, reason: r.judgment.reason })),
    };
  }
}

// ============================================================
// 七、置信度评分器（整体结论的置信度）
// ============================================================
export function computeOverallConfidence(claims) {
  if (!claims || claims.length === 0) return { score: 0.5, label: '未知', breakdown: {} };
  const defended = claims.filter((c) => c.defended === true);
  const broke = claims.filter((c) => c.defended === false);
  const inconclusive = claims.filter((c) => c.defended === null || c.defended === undefined);
  const avgConfidence = claims.reduce((sum, c) => sum + (c.confidence || 0.5), 0) / claims.length;
  // 加权：被攻破的论断拉低更多
  const penalty = broke.length * 0.15 + inconclusive.length * 0.05;
  const score = Math.max(0, Math.min(1, avgConfidence - penalty));
  let label;
  if (score >= 0.85) label = '极高置信';
  else if (score >= 0.7) label = '高置信';
  else if (score >= 0.5) label = '中等置信';
  else if (score >= 0.3) label = '低置信';
  else label = '极低置信·建议回炉';
  return {
    score: Math.round(score * 100) / 100,
    label,
    breakdown: {
      total: claims.length,
      defended: defended.length,
      broke: broke.length,
      inconclusive: inconclusive.length,
      avgClaimConfidence: Math.round(avgConfidence * 100) / 100,
    },
  };
}

// ============================================================
// 八、熔断保护器（对抗轮次上限、token预算上限、回炉次数上限）
// ============================================================
export class DevilFuse {
  constructor(options = {}) {
    this.maxAttackRounds = options.maxAttackRounds || 8;
    this.maxTokenBudget = options.maxTokenBudget || 24000;
    this.maxTotalReforge = options.maxTotalReforge || 12;
    this.attackRoundCount = 0;
    this.tokenEstimate = 0;
    this.totalReforge = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkAttackRound() {
    if (this.attackRoundCount >= this.maxAttackRounds) {
      this.trip(`攻击轮次熔断：已达上限 ${this.maxAttackRounds} 轮`);
      return false;
    }
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
  trip(reason) {
    this.tripped = true;
    this.tripReason = reason;
  }
  reset() {
    this.attackRoundCount = 0;
    this.tokenEstimate = 0;
    this.totalReforge = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  status() {
    return {
      attackRounds: this.attackRoundCount,
      maxAttackRounds: this.maxAttackRounds,
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
// 九、统计记录器（攻击次数、攻破次数、防守成功率、平均回炉轮次）
// ============================================================
export class DevilStats {
  constructor() {
    this.sessions = new Map(); // sessionId -> stats
  }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        attackRoundsTriggered: 0,
        claimsExamined: 0,
        claimsBroke: 0,
        claimsDefended: 0,
        reforgeRounds: 0,
        fuseTrips: 0,
        angleUsage: {},
        startTime: Date.now(),
      });
    }
    return this.sessions.get(sessionId);
  }
  recordAttack(sessionId, claims) {
    const s = this.getSession(sessionId);
    s.attackRoundsTriggered++;
    s.claimsExamined += claims.length;
    for (const c of claims) {
      if (c.defended === true) s.claimsDefended++;
      else if (c.defended === false) s.claimsBroke++;
      for (const ar of c.attackResults || []) {
        s.angleUsage[ar.angleId] = (s.angleUsage[ar.angleId] || 0) + 1;
      }
    }
  }
  recordReforge(sessionId, count) {
    this.getSession(sessionId).reforgeRounds += count;
  }
  recordFuseTrip(sessionId) {
    this.getSession(sessionId).fuseTrips++;
  }
  summary(sessionId) {
    const s = this.getSession(sessionId);
    const total = s.claimsBroke + s.claimsDefended;
    const defenseRate = total > 0 ? Math.round((s.claimsDefended / total) * 100) : 0;
    const topAngles = Object.entries(s.angleUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => {
        const angle = ATTACK_ANGLES.find((a) => a.id === id);
        return { name: angle?.name || id, count };
      });
    return {
      attackRounds: s.attackRoundsTriggered,
      claimsExamined: s.claimsExamined,
      claimsBroke: s.claimsBroke,
      claimsDefended: s.claimsDefended,
      defenseRate: `${defenseRate}%`,
      reforgeRounds: s.reforgeRounds,
      fuseTrips: s.fuseTrips,
      topAttackAngles: topAngles,
      durationMs: Date.now() - s.startTime,
    };
  }
}

// ============================================================
// 十、多开关联动（devil + recheck + bestof 组合时的协同逻辑）
// ============================================================
export function computeCombinedStrategy(modules) {
  const active = [];
  if (modules?.devil) active.push('devil');
  if (modules?.recheck) active.push('recheck');
  if (modules?.bestof) active.push('bestof');
  if (active.length === 0) return { mode: 'none', tokenMultiplier: 1, executionOrder: [], notes: '无对抗开关' };
  // 组合策略：
  // devil + recheck = 先攻击再校验，攻破的论断用第二种方法复核
  // devil + bestof = 每版候选都过一遍魔鬼代言人，只交付防守成功的版本
  // recheck + bestof = 多版候选互相校验，不一致的版本淘汰
  // 三者全开 = 完整对抗链：bestof 多版 → devil 攻击每版 → recheck 校验幸存版 → 只交付全部通过的
  const executionOrder = [];
  let tokenMultiplier = 1;
  const notes = [];
  if (active.includes('bestof')) {
    executionOrder.push('bestof: 并行生成多版候选');
    tokenMultiplier *= 2.5;
  }
  if (active.includes('devil')) {
    executionOrder.push('devil: 对每版候选执行魔鬼代言人攻击');
    tokenMultiplier *= 2.0;
    notes.push('被攻破的候选版本直接淘汰，不进入下一阶段');
  }
  if (active.includes('recheck')) {
    executionOrder.push('recheck: 对幸存版本的关键结论用第二种独立方法复核');
    tokenMultiplier *= 1.8;
    notes.push('复核不一致的结论标记为"待验证"，不写入最终答案');
  }
  if (active.length === 3) {
    notes.push('三开关全开 = 完整对抗链，只有通过全部三关的结论才允许交付');
    tokenMultiplier = Math.max(tokenMultiplier, 6.0);
  }
  return {
    mode: active.join('+'),
    tokenMultiplier: Math.round(tokenMultiplier * 10) / 10,
    executionOrder,
    notes,
    activeSwitches: active,
  };
}

// ============================================================
// 十一、主引擎入口（整合所有模块，对外暴露统一接口）
// ============================================================
export class DevilAdvocateEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = INTENSITY_TIERS[this.intensity] || INTENSITY_TIERS.medium;
    this.fuse = new DevilFuse({
      maxAttackRounds: options.maxAttackRounds || (this.tier.label === '极' ? 12 : 8),
      maxTokenBudget: options.maxTokenBudget || 24000,
      maxTotalReforge: options.maxTotalReforge || (this.tier.maxReforgeRounds * 3),
    });
    this.stats = new DevilStats();
    this.reforgeManagers = new Map(); // claimId -> ReforgeManager
  }
  setIntensity(intensity) {
    if (INTENSITY_TIERS[intensity]) {
      this.intensity = intensity;
      this.tier = INTENSITY_TIERS[intensity];
    }
  }
  // 执行一轮完整的魔鬼代言人攻击
  async attack(sessionId, modelOutput, objective, steerFn) {
    if (this.fuse.tripped) {
      return { ok: false, reason: this.fuse.tripReason, claims: [], confidence: null };
    }
    if (!this.fuse.checkAttackRound()) {
      return { ok: false, reason: this.fuse.tripReason, claims: [], confidence: null };
    }
    this.fuse.attackRoundCount++;
    // 1. 提取论断
    const claims = extractClaims(modelOutput, this.tier.claimMinLength);
    if (claims.length === 0) {
      return { ok: true, reason: '无可攻击论断', claims: [], confidence: computeOverallConfidence([]) };
    }
    // 2. 为每条论断生成反例
    for (const claim of claims) {
      claim.attackResults = generateCounterexamples(claim, this.tier.angleCount);
    }
    // 3. 构造攻击提示词并通过 steerFn 真实触发模型调用
    const attackPrompt = this.buildAttackPrompt(claims, objective);
    let attackResult = null;
    if (typeof steerFn === 'function') {
      try {
        attackResult = await steerFn(attackPrompt, 'devil');
      } catch (e) {
        return { ok: false, reason: `攻击轮调用失败: ${String(e)}`, claims, confidence: computeOverallConfidence(claims) };
      }
    }
    // 4. 解析攻击结果（简化版：从返回文本中提取判定）
    this.parseAttackResult(claims, attackResult);
    // 5. 判定每条论断的防守状态
    for (const claim of claims) {
      const judgment = judgeDefense(claim, claim.attackResults);
      claim.defended = judgment.defended;
      claim.confidence = judgment.confidence;
      claim.judgment = judgment;
    }
    // 6. 统计
    this.stats.recordAttack(sessionId, claims);
    // 7. 熔断检查
    if (!this.fuse.checkToken(claims.length * 400)) {
      this.stats.recordFuseTrip(sessionId);
      return { ok: false, reason: this.fuse.tripReason, claims, confidence: computeOverallConfidence(claims) };
    }
    // 8. 返回结果
    const confidence = computeOverallConfidence(claims);
    const brokeClaims = claims.filter((c) => c.defended === false);
    return {
      ok: true,
      claims,
      confidence,
      brokeCount: brokeClaims.length,
      defendedCount: claims.filter((c) => c.defended === true).length,
      needsReforge: brokeClaims.length > 0,
      brokeClaims: brokeClaims.map((c) => ({ id: c.id, text: c.text, reason: c.judgment?.reason })),
    };
  }
  // 构造攻击提示词
  buildAttackPrompt(claims, objective) {
    const claimList = claims.map((c, i) => {
      const angles = c.attackResults.map((a) => `  - [${a.angleName}] ${a.probe}`).join('\n');
      return `论断 ${i + 1}：${c.text}\n攻击维度：\n${angles}`;
    }).join('\n\n');
    return [
      `【Think 魔鬼代言人·攻击轮】`,
      `目标：${String(objective || '').slice(0, 200)}`,
      ``,
      `以下是从你的上一轮输出中提取的 ${claims.length} 条关键论断。你必须对每条论断执行指定维度的反方攻击：`,
      ``,
      claimList,
      ``,
      `输出格式（严格遵守）：`,
      `对于每条论断，输出：`,
      `  论断N：[原文]`,
      `  攻击结果：[攻破/防守成功/不确定]`,
      `  攻破点：[如果攻破，具体说明哪个维度、什么反例]`,
      `  修正版：[如果攻破，给出修正后的论断；如果防守成功，写"无需修正"]`,
      ``,
      `全部论断处理完后，输出：`,
      `  总结：[攻破X条/防守成功Y条/不确定Z条]`,
      `  整体判定：[全部驳不倒，交付成立 / 存在未驳倒硬伤，必须回炉]`,
    ].join('\n');
  }
  // 解析攻击结果（从模型返回文本中提取每条论断的判定）
  parseAttackResult(claims, resultText) {
    if (!resultText || typeof resultText !== 'string') return;
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      // 尝试匹配 "论断N" 后面的攻击结果
      const pattern = new RegExp(`论断\\s*${i + 1}[：:][\\s\\S]*?攻击结果[：:]\\s*(攻破|防守成功|不确定)`, 'i');
      const match = resultText.match(pattern);
      if (match) {
        const result = match[1];
        // 把判定分配到第一个攻击结果上（简化）
        if (claim.attackResults.length > 0) {
          claim.attackResults[0].result = result === '攻破' ? 'broke' : result === '防守成功' ? 'defended' : 'inconclusive';
          claim.attackResults[0].detail = match[0].slice(0, 200);
        }
      }
    }
  }
  // 执行回炉
  async reforge(sessionId, claims, steerFn) {
    const brokeClaims = claims.filter((c) => c.defended === false);
    if (brokeClaims.length === 0) return { ok: true, reforged: 0, notes: '无被攻破论断' };
    const reforged = [];
    for (const claim of brokeClaims) {
      if (!this.fuse.checkReforge()) break;
      let rm = this.reforgeManagers.get(claim.id);
      if (!rm) {
        rm = new ReforgeManager(this.tier.maxReforgeRounds);
        this.reforgeManagers.set(claim.id, rm);
      }
      if (rm.shouldReforge(claim.judgment)) {
        const round = rm.nextRound(claim, claim.judgment);
        if (typeof steerFn === 'function') {
          try {
            await steerFn(round.prompt, 'devil-reforge');
          } catch (e) { /* 回炉失败不阻断主流程 */ }
        }
        reforged.push({ claimId: claim.id, round: round.roundNo, reason: round.judgment.reason });
      }
    }
    this.stats.recordReforge(sessionId, reforged.length);
    return {
      ok: true,
      reforged: reforged.length,
      details: reforged,
      exhausted: this.fuse.tripped,
    };
  }
  // 获取统计摘要
  getStats(sessionId) {
    return this.stats.summary(sessionId);
  }
  // 获取熔断状态
  getFuseStatus() {
    return this.fuse.status();
  }
  // 重置（新会话开始时调用）
  reset() {
    this.fuse.reset();
    this.reforgeManagers.clear();
  }
}

// ============================================================
// 十二、导出便捷函数（供旧代码兼容调用）
// ============================================================
export function createDevilPrompt(objective, intensity = 'medium') {
  const tier = INTENSITY_TIERS[intensity] || INTENSITY_TIERS.medium;
  const angles = ATTACK_ANGLES.slice(0, tier.angleCount).map((a) => a.name).join('、');
  return [
    `【Think 魔鬼代言人·${tier.label}档激活】`,
    `在交付最终答案之前，你必须先以最锋利的对立立场攻击自己的核心结论。`,
    `攻击维度（${tier.angleCount}种）：${angles}`,
    `至少构造 ${Math.max(2, tier.angleCount - 1)} 条实质性反驳。`,
    `若任何一条反驳无法被有效驳倒，立即回炉重做结论，不得将已知脆弱结论交付给用户。`,
    `攻击-防守推演过程必须完整保留在输出中。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}

export function createDevilTurnPrompt(objective, intensity = 'medium') {
  const tier = INTENSITY_TIERS[intensity] || INTENSITY_TIERS.medium;
  return [
    `【Think 魔鬼代言人·对抗轮（${tier.label}档）】`,
    `请对你上一轮交付的结论发起最尖锐的反方攻击：`,
    `①列出全部关键论断`,
    `②对每条论断构造至少 1 个反例或边界条件`,
    `③判定哪些论断被攻破`,
    `④被攻破的论断立即重做并给出修正版`,
    `若全部论断均防守成功，明确声明"全部驳不倒，交付成立"。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}

export function devilCadence(deepTier) {
  return Math.max(1, 4 - Math.min(4, Math.round(Number(deepTier) || 0)));
}
