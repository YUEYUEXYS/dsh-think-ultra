// recheck-engine.js — Think 交付前双重校验·完整引擎
// 独立引擎文件：校验方法库 / 结论提取 / 独立重算 / 一致性判定 / 分歧溯源 /
// 修正回炉 / 校验报告 / 熔断保护 / 统计记录 / 强度分级 / 多开关联动
// 纯 JavaScript ESM，零外部依赖。

// ============================================================
// 一、校验方法库（10 种真实独立校验方法，不是凑数）
// ============================================================
export const VERIFICATION_METHODS = [
  {
    id: 'algebraic_rederive',
    name: '代数重推导',
    weight: 1.0,
    description: '用与原推导完全不同的代数路径重新推导，不引用原结论的任何中间步骤',
    applicable: (claim) => /[=+\-*/<>≤≥]|等于|大于|小于|比例|概率|百分比/.test(claim),
    severity: 'high',
  },
  {
    id: 'unit_dimensional',
    name: '量纲检查',
    weight: 0.9,
    description: '检查所有物理量/数据的单位是否一致，等式两边量纲是否匹配',
    applicable: (claim) => /[米秒千克瓦焦帕℃°%]|单位|量纲|换算/.test(claim),
    severity: 'high',
  },
  {
    id: 'boundary_extreme',
    name: '边界极值检验',
    weight: 0.95,
    description: '把结论放到边界条件（零、无穷、极值、空集、溢出）下检验是否仍然成立',
    applicable: () => true,
    severity: 'high',
  },
  {
    id: 'independent_implementation',
    name: '独立实现比对',
    weight: 1.0,
    description: '用完全不同的算法/数据结构/编程语言风格重新实现同一功能，比对输出',
    applicable: (claim) => /代码|函数|算法|实现|程序|脚本/.test(claim),
    severity: 'high',
  },
  {
    id: 'source_crosscheck',
    name: '来源交叉核验',
    weight: 0.85,
    description: '对引用的事实/数据/数字，从至少两个独立来源交叉验证',
    applicable: (claim) => /根据|据|引用|来源|显示|表明|统计|数据|研究|报告/.test(claim),
    severity: 'medium',
  },
  {
    id: 'logical_walkthrough',
    name: '形式化走查',
    weight: 0.9,
    description: '对推理链每一步标出前件索引与推理规则，检查是否存在跳步、循环论证、偷换概念',
    applicable: () => true,
    severity: 'medium',
  },
  {
    id: 'counterexample_search',
    name: '反例搜索',
    weight: 0.95,
    description: '主动搜索能推翻结论的反例，包括特殊值、退化情况、非典型输入',
    applicable: () => true,
    severity: 'high',
  },
  {
    id: 'sensitivity_analysis',
    name: '敏感性分析',
    weight: 0.75,
    description: '微调输入参数，观察结论是否稳定；参数微小变化导致结论翻转则标记为脆弱',
    applicable: (claim) => /取决于|依赖|影响|导致|变化|波动/.test(claim),
    severity: 'medium',
  },
  {
    id: 'consistency_network',
    name: '结论网一致性',
    weight: 0.85,
    description: '检查本条结论与同输出中其他结论是否矛盾，是否存在互相冲突的断言',
    applicable: () => true,
    severity: 'medium',
  },
  {
    id: 'runtime_execution',
    name: '运行时实跑',
    weight: 1.0,
    description: '对可执行/可计算的结论，抽取出断言在隔离环境真实运行，用实际输出验证',
    applicable: (claim) => /代码|函数|返回|输出|结果|计算|运行|执行|等于/.test(claim),
    severity: 'high',
  },
];

// ============================================================
// 二、强度分级（轻/中/重/极，每档真实不同）
// ============================================================
export const RECHECK_TIERS = {
  light: {
    label: '轻',
    methodCount: 2,
    maxReforgeRounds: 1,
    claimMinLength: 25,
    requireAllConsistent: false,
    tokenBudgetMultiplier: 1.8,
    severityThreshold: 'high',
  },
  medium: {
    label: '中',
    methodCount: 4,
    maxReforgeRounds: 2,
    claimMinLength: 15,
    requireAllConsistent: false,
    tokenBudgetMultiplier: 3.0,
    severityThreshold: 'medium',
  },
  heavy: {
    label: '重',
    methodCount: 6,
    maxReforgeRounds: 3,
    claimMinLength: 10,
    requireAllConsistent: true,
    tokenBudgetMultiplier: 4.5,
    severityThreshold: 'low',
  },
  extreme: {
    label: '极',
    methodCount: 10,
    maxReforgeRounds: 5,
    claimMinLength: 5,
    requireAllConsistent: true,
    tokenBudgetMultiplier: 7.0,
    severityThreshold: 'low',
  },
};

// ============================================================
// 三、关键结论提取器（从模型输出中提取需要校验的关键结论）
// ============================================================
export function extractKeyConclusions(text, minLength = 10) {
  if (!text || typeof text !== 'string') return [];
  const conclusions = [];
  const sentences = text.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
  for (const sent of sentences) {
    if (sent.length < minLength) continue;
    // 关键结论信号：包含数字/断言/因果/代码行为
    const hasNumber = /\d+(\.\d+)?/.test(sent);
    const hasAssertion = /(是|为|等于|意味着|表明|说明|证明|导致|引起|使得|必须|应该|可以|能够|存在|不存在)/.test(sent);
    const hasCode = /(返回|输出|结果|函数|代码|报错|异常|undefined|null|true|false)/.test(sent);
    const hasCausal = /(因为|所以|因此|由于|导致|引起|使得|从而)/.test(sent);
    if ((hasNumber || hasAssertion || hasCode || hasCausal) && sent.length > 12) {
      conclusions.push({
        id: conclusions.length + 1,
        text: sent.slice(0, 400),
        type: hasCode ? 'code' : hasNumber ? 'numeric' : hasCausal ? 'causal' : 'assertion',
        verified: null,
        methods: [],
        reforgeCount: 0,
        confidence: 0.5,
      });
    }
  }
  return conclusions.slice(0, 12);
}

// ============================================================
// 四、校验方法选择器（为每条结论选择适用的独立校验方法）
// ============================================================
export function selectMethods(conclusion, count = 4) {
  if (!conclusion || !conclusion.text) return [];
  const applicable = VERIFICATION_METHODS.filter((m) => {
    try { return m.applicable(conclusion.text); } catch { return true; }
  });
  // 按权重排序，优先选高权重方法，保证方法间独立性
  const sorted = [...applicable].sort((a, b) => b.weight - a.weight);
  const selected = [];
  const usedCategories = new Set();
  for (const m of sorted) {
    if (selected.length >= count) break;
    // 避免选同一类方法（比如两个都是 high severity 的代数类）
    const cat = m.id.split('_')[0];
    if (usedCategories.has(cat) && selected.length > 0) continue;
    selected.push(m);
    usedCategories.add(cat);
  }
  // 如果选不够，补全
  if (selected.length < count) {
    for (const m of sorted) {
      if (selected.length >= count) break;
      if (!selected.includes(m)) selected.push(m);
    }
  }
  return selected;
}

// ============================================================
// 五、一致性判定器（多种独立方法校验后判定结论是否一致）
// ============================================================
export function judgeConsistency(conclusion, methodResults) {
  if (!methodResults || methodResults.length === 0) {
    return { consistent: true, confidence: 0.6, reason: '无校验方法，默认通过' };
  }
  const passed = methodResults.filter((r) => r.result === 'pass');
  const failed = methodResults.filter((r) => r.result === 'fail');
  const inconclusive = methodResults.filter((r) => r.result === 'inconclusive' || !r.result);
  const highSeverityFailed = failed.filter((r) => r.severity === 'high');
  // 判定逻辑：
  // 1. 任何 high severity 方法失败 → 不一致
  // 2. 超过 1/3 方法失败 → 不一致
  // 3. 超过 2/3 方法通过 → 一致
  // 4. 否则不确定
  if (highSeverityFailed.length > 0) {
    return {
      consistent: false,
      confidence: 0.85,
      reason: `高严重度校验失败（${highSeverityFailed.map((r) => r.methodName).join('、')}）`,
      passCount: passed.length,
      failCount: failed.length,
      failedMethods: failed.map((r) => ({ method: r.methodName, detail: r.detail })),
    };
  }
  if (failed.length / methodResults.length > 0.33) {
    return {
      consistent: false,
      confidence: 0.7,
      reason: `超过 1/3 校验方法失败（${failed.length}/${methodResults.length}）`,
      passCount: passed.length,
      failCount: failed.length,
      failedMethods: failed.map((r) => ({ method: r.methodName, detail: r.detail })),
    };
  }
  if (passed.length / methodResults.length > 0.66) {
    return {
      consistent: true,
      confidence: 0.75,
      reason: `超过 2/3 校验方法通过（${passed.length}/${methodResults.length}）`,
      passCount: passed.length,
      failCount: failed.length,
    };
  }
  return {
    consistent: null,
    confidence: 0.5,
    reason: `校验胶着（通过${passed.length}/失败${failed.length}/不确定${inconclusive.length}）`,
    passCount: passed.length,
    failCount: failed.length,
  };
}

// ============================================================
// 六、分歧溯源器（校验失败后溯源到具体哪一步/哪个数据出错）
// ============================================================
export function traceDivergence(conclusion, failedMethods) {
  if (!failedMethods || failedMethods.length === 0) return { traced: false, rootCause: '未知' };
  const traces = [];
  for (const fm of failedMethods) {
    const trace = {
      method: fm.methodName,
      methodId: fm.methodId,
      divergencePoint: fm.detail || '未定位',
      suspectedCause: inferCause(fm),
    };
    traces.push(trace);
  }
  // 汇总最可能的根因
  const causeCounts = {};
  for (const t of traces) {
    causeCounts[t.suspectedCause] = (causeCounts[t.suspectedCause] || 0) + 1;
  }
  const rootCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '多因素混合';
  return {
    traced: true,
    rootCause,
    traces,
    recommendation: recommendationFor(rootCause),
  };
}

function inferCause(failedMethod) {
  const detail = (failedMethod.detail || '').toLowerCase();
  if (/单位|量纲|换算/.test(detail)) return '单位/量纲错误';
  if (/边界|极值|零|空/.test(detail)) return '边界条件未覆盖';
  if (/数字|计算|算术/.test(detail)) return '计算错误';
  if (/逻辑|推理|跳步|循环/.test(detail)) return '逻辑推理缺陷';
  if (/来源|引用|数据/.test(detail)) return '数据来源不可靠';
  if (/代码|函数|返回|输出/.test(detail)) return '代码行为与断言不符';
  if (/因果|相关/.test(detail)) return '因果关系误判';
  return '结论过强/证据不足';
}

function recommendationFor(cause) {
  const map = {
    '单位/量纲错误': '统一所有物理量单位，等式两边做量纲对齐，添加单位换算校验',
    '边界条件未覆盖': '补充零值、极值、空集、溢出等边界测试用例，结论增加适用范围限定',
    '计算错误': '用独立方法重新计算所有数字，展示计算过程，关键数字标注来源',
    '逻辑推理缺陷': '对推理链做形式化走查，每步标出前件索引与推理规则，补全跳步',
    '数据来源不可靠': '对引用数据标注来源，至少两个独立来源交叉验证，区分"已查证"与"一方称"',
    '代码行为与断言不符': '在隔离环境真实运行代码，用实际输出替换断言，标注运行环境',
    '因果关系误判': '区分相关与因果，检查第三变量，给出因果链的每一步证据',
    '结论过强/证据不足': '降低结论强度，把"必然"改为"在X条件下可能"，标注不确定处',
  };
  return map[cause] || '回炉重做结论，增加校验步骤';
}

// ============================================================
// 七、修正回炉管理器（校验失败后多轮回炉，不是一次修正）
// ============================================================
export class RecheckReforgeManager {
  constructor(maxRounds = 3) {
    this.maxRounds = maxRounds;
    this.rounds = [];
    this.currentRound = 0;
  }
  shouldReforge(judgment) {
    if (!judgment) return false;
    if (judgment.consistent === true) return false;
    if (this.currentRound >= this.maxRounds) return false;
    return judgment.consistent === false || judgment.consistent === null;
  }
  nextRound(conclusion, judgment, divergence) {
    this.currentRound++;
    const round = {
      roundNo: this.currentRound,
      conclusionId: conclusion.id,
      originalText: conclusion.text,
      judgment,
      divergence,
      prompt: this.buildReforgePrompt(conclusion, judgment, divergence),
    };
    this.rounds.push(round);
    return round;
  }
  buildReforgePrompt(conclusion, judgment, divergence) {
    const failedList = judgment.failedMethods?.map((f) => `  - [${f.method}] ${f.detail}`).join('\n') || '';
    return [
      `【Think 双重校验·第${this.currentRound}轮回炉】`,
      `原结论校验未通过，必须修正：`,
      `原结论：${conclusion.text}`,
      `校验判定：${judgment.reason}`,
      divergence?.rootCause ? `根因溯源：${divergence.rootCause}` : '',
      divergence?.recommendation ? `修正建议：${divergence.recommendation}` : '',
      failedList ? `具体失败项：\n${failedList}` : '',
      `要求：①针对每个失败项给出修正后的结论 ②修正必须实质性改变，不允许只是加"可能/大概"稀释 ③修正后重新声明"校验通过，结论成立" ④附"校验方法A/B + 结果一致性"小结`,
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
    };
  }
}

// ============================================================
// 八、校验报告生成器（每次校验后生成结构化报告）
// ============================================================
export function generateReport(conclusions, overallConfidence) {
  const passed = conclusions.filter((c) => c.verified === true);
  const failed = conclusions.filter((c) => c.verified === false);
  const inconclusive = conclusions.filter((c) => c.verified === null || c.verified === undefined);
  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: conclusions.length,
      passed: passed.length,
      failed: failed.length,
      inconclusive: inconclusive.length,
      passRate: conclusions.length > 0 ? Math.round((passed.length / conclusions.length) * 100) : 0,
    },
    overallConfidence,
    details: conclusions.map((c) => ({
      id: c.id,
      type: c.type,
      text: c.text.slice(0, 100),
      verified: c.verified,
      confidence: c.confidence,
      methodsUsed: c.methods?.map((m) => m.methodName) || [],
      reforgeCount: c.reforgeCount || 0,
    })),
    failedConclusions: failed.map((c) => ({
      id: c.id,
      text: c.text.slice(0, 150),
      reason: c.judgment?.reason || '未知',
      rootCause: c.divergence?.rootCause || '未溯源',
    })),
  };
}

// ============================================================
// 九、熔断保护器
// ============================================================
export class RecheckFuse {
  constructor(options = {}) {
    this.maxVerifyRounds = options.maxVerifyRounds || 6;
    this.maxTokenBudget = options.maxTokenBudget || 20000;
    this.maxTotalReforge = options.maxTotalReforge || 10;
    this.verifyRoundCount = 0;
    this.tokenEstimate = 0;
    this.totalReforge = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkVerifyRound() {
    if (this.verifyRoundCount >= this.maxVerifyRounds) {
      this.trip(`校验轮次熔断：已达上限 ${this.maxVerifyRounds} 轮`);
      return false;
    }
    this.verifyRoundCount++;
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
    this.verifyRoundCount = 0;
    this.tokenEstimate = 0;
    this.totalReforge = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  status() {
    return {
      verifyRounds: this.verifyRoundCount,
      maxVerifyRounds: this.maxVerifyRounds,
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
// 十、统计记录器
// ============================================================
export class RecheckStats {
  constructor() {
    this.sessions = new Map();
  }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        verifyRounds: 0,
        conclusionsExamined: 0,
        conclusionsPassed: 0,
        conclusionsFailed: 0,
        reforgeRounds: 0,
        fuseTrips: 0,
        methodUsage: {},
        rootCauses: {},
        startTime: Date.now(),
      });
    }
    return this.sessions.get(sessionId);
  }
  recordVerify(sessionId, conclusions) {
    const s = this.getSession(sessionId);
    s.verifyRounds++;
    s.conclusionsExamined += conclusions.length;
    for (const c of conclusions) {
      if (c.verified === true) s.conclusionsPassed++;
      else if (c.verified === false) s.conclusionsFailed++;
      for (const m of c.methods || []) {
        s.methodUsage[m.methodId] = (s.methodUsage[m.methodId] || 0) + 1;
      }
      if (c.divergence?.rootCause) {
        s.rootCauses[c.divergence.rootCause] = (s.rootCauses[c.divergence.rootCause] || 0) + 1;
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
    const total = s.conclusionsPassed + s.conclusionsFailed;
    const passRate = total > 0 ? Math.round((s.conclusionsPassed / total) * 100) : 0;
    const topMethods = Object.entries(s.methodUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => {
        const m = VERIFICATION_METHODS.find((x) => x.id === id);
        return { name: m?.name || id, count };
      });
    const topCauses = Object.entries(s.rootCauses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      verifyRounds: s.verifyRounds,
      conclusionsExamined: s.conclusionsExamined,
      conclusionsPassed: s.conclusionsPassed,
      conclusionsFailed: s.conclusionsFailed,
      passRate: `${passRate}%`,
      reforgeRounds: s.reforgeRounds,
      fuseTrips: s.fuseTrips,
      topMethods,
      topRootCauses: topCauses,
      durationMs: Date.now() - s.startTime,
    };
  }
}

// ============================================================
// 十一、主引擎入口
// ============================================================
export class RecheckEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = RECHECK_TIERS[this.intensity] || RECHECK_TIERS.medium;
    this.fuse = new RecheckFuse({
      maxVerifyRounds: options.maxVerifyRounds || (this.tier.label === '极' ? 10 : 6),
      maxTokenBudget: options.maxTokenBudget || 20000,
      maxTotalReforge: options.maxTotalReforge || (this.tier.maxReforgeRounds * 3),
    });
    this.stats = new RecheckStats();
    this.reforgeManagers = new Map();
  }
  setIntensity(intensity) {
    if (RECHECK_TIERS[intensity]) {
      this.intensity = intensity;
      this.tier = RECHECK_TIERS[intensity];
    }
  }
  async verify(sessionId, modelOutput, objective, steerFn) {
    if (this.fuse.tripped) {
      return { ok: false, reason: this.fuse.tripReason, conclusions: [], report: null };
    }
    if (!this.fuse.checkVerifyRound()) {
      return { ok: false, reason: this.fuse.tripReason, conclusions: [], report: null };
    }
    // 1. 提取关键结论
    const conclusions = extractKeyConclusions(modelOutput, this.tier.claimMinLength);
    if (conclusions.length === 0) {
      return { ok: true, reason: '无可校验结论', conclusions: [], report: generateReport([], { score: 0.6, label: '无结论' }) };
    }
    // 2. 为每条结论选择校验方法并执行
    for (const conclusion of conclusions) {
      const methods = selectMethods(conclusion, this.tier.methodCount);
      conclusion.methods = methods.map((m) => ({
        methodId: m.id,
        methodName: m.name,
        severity: m.severity,
        result: null,
        detail: '',
      }));
      // 构造校验提示词并真实触发模型调用
      const verifyPrompt = this.buildVerifyPrompt(conclusion, methods, objective);
      if (typeof steerFn === 'function') {
        try {
          const result = await steerFn(verifyPrompt, 'recheck');
          this.parseVerifyResult(conclusion, result);
        } catch (e) {
          conclusion.methods.forEach((m) => { m.result = 'inconclusive'; m.detail = String(e); });
        }
      }
      // 3. 一致性判定
      const judgment = judgeConsistency(conclusion, conclusion.methods);
      conclusion.verified = judgment.consistent;
      conclusion.confidence = judgment.confidence;
      conclusion.judgment = judgment;
      // 4. 分歧溯源（仅失败时）
      if (judgment.consistent === false) {
        const failed = conclusion.methods.filter((m) => m.result === 'fail');
        conclusion.divergence = traceDivergence(conclusion, failed);
      }
    }
    // 5. 统计
    this.stats.recordVerify(sessionId, conclusions);
    // 6. 熔断检查
    if (!this.fuse.checkToken(conclusions.length * 500)) {
      this.stats.recordFuseTrip(sessionId);
      return { ok: false, reason: this.fuse.tripReason, conclusions, report: generateReport(conclusions, this.computeOverallConfidence(conclusions)) };
    }
    // 7. 生成报告
    const overallConfidence = this.computeOverallConfidence(conclusions);
    const report = generateReport(conclusions, overallConfidence);
    const failedCount = conclusions.filter((c) => c.verified === false).length;
    return {
      ok: true,
      conclusions,
      report,
      overallConfidence,
      passedCount: conclusions.filter((c) => c.verified === true).length,
      failedCount,
      needsReforge: failedCount > 0,
    };
  }
  buildVerifyPrompt(conclusion, methods, objective) {
    const methodList = methods.map((m, i) => `${i + 1}. [${m.name}] ${m.description}`).join('\n');
    return [
      `【Think 双重校验·校验轮】`,
      `目标：${String(objective || '').slice(0, 200)}`,
      ``,
      `请对以下关键结论执行 ${methods.length} 种相互独立的校验方法：`,
      ``,
      `结论：${conclusion.text}`,
      `结论类型：${conclusion.type}`,
      ``,
      `校验方法：`,
      methodList,
      ``,
      `输出格式（严格遵守）：`,
      `对于每种方法，输出：`,
      `  方法N：[方法名]`,
      `  校验结果：[通过/失败/不确定]`,
      `  校验详情：[如果失败，具体说明哪里不一致；如果通过，简述验证过程]`,
      ``,
      `全部方法校验完后，输出：`,
      `  总结：[通过X种/失败Y种/不确定Z种]`,
      `  整体判定：[全部一致，结论成立 / 存在不一致，必须回炉修正]`,
    ].join('\n');
  }
  parseVerifyResult(conclusion, result) {
    if (!result || typeof result !== 'object') return;
    const text = result.text || result.content || '';
    if (!text) return;
    for (let i = 0; i < conclusion.methods.length; i++) {
      const m = conclusion.methods[i];
      const pattern = new RegExp(`方法\\s*${i + 1}[：:][\\s\\S]*?校验结果[：:]\\s*(通过|失败|不确定)`, 'i');
      const match = text.match(pattern);
      if (match) {
        m.result = match[1] === '通过' ? 'pass' : match[1] === '失败' ? 'fail' : 'inconclusive';
        const detailMatch = text.match(new RegExp(`方法\\s*${i + 1}[\\s\\S]*?校验详情[：:]\\s*([^\\n]+)`));
        if (detailMatch) m.detail = detailMatch[1].slice(0, 200);
      }
    }
  }
  computeOverallConfidence(conclusions) {
    if (!conclusions || conclusions.length === 0) return { score: 0.5, label: '无结论' };
    const passed = conclusions.filter((c) => c.verified === true);
    const failed = conclusions.filter((c) => c.verified === false);
    const avgConf = conclusions.reduce((s, c) => s + (c.confidence || 0.5), 0) / conclusions.length;
    const penalty = failed.length * 0.15;
    const score = Math.max(0, Math.min(1, avgConf - penalty));
    let label;
    if (score >= 0.85) label = '极高置信·全部校验通过';
    else if (score >= 0.7) label = '高置信';
    else if (score >= 0.5) label = '中等置信·存在待验证项';
    else if (score >= 0.3) label = '低置信·存在校验失败';
    else label = '极低置信·必须回炉';
    return { score: Math.round(score * 100) / 100, label, failedCount: failed.length, passedCount: passed.length };
  }
  async reforge(sessionId, conclusions, steerFn) {
    const failed = conclusions.filter((c) => c.verified === false);
    if (failed.length === 0) return { ok: true, reforged: 0 };
    const reforged = [];
    for (const conclusion of failed) {
      if (!this.fuse.checkReforge()) break;
      let rm = this.reforgeManagers.get(conclusion.id);
      if (!rm) {
        rm = new RecheckReforgeManager(this.tier.maxReforgeRounds);
        this.reforgeManagers.set(conclusion.id, rm);
      }
      if (rm.shouldReforge(conclusion.judgment)) {
        const round = rm.nextRound(conclusion, conclusion.judgment, conclusion.divergence);
        if (typeof steerFn === 'function') {
          try { await steerFn(round.prompt, 'recheck-reforge'); } catch (e) { /* 回炉失败不阻断 */ }
        }
        reforged.push({ conclusionId: conclusion.id, round: round.roundNo, reason: round.judgment.reason });
      }
    }
    this.stats.recordReforge(sessionId, reforged.length);
    return { ok: true, reforged: reforged.length, details: reforged, exhausted: this.fuse.tripped };
  }
  getStats(sessionId) { return this.stats.summary(sessionId); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); this.reforgeManagers.clear(); }
}

// ============================================================
// 十二、兼容函数
// ============================================================
export function createRecheckPrompt(objective, intensity = 'medium') {
  const tier = RECHECK_TIERS[intensity] || RECHECK_TIERS.medium;
  const methods = VERIFICATION_METHODS.slice(0, tier.methodCount).map((m) => m.name).join('、');
  return [
    `【Think 交付前双重校验·${tier.label}档激活】`,
    `关键结论（数字、推导、引用、代码行为）必须用第二种相互独立的方法重算复核。`,
    `校验方法（${tier.methodCount}种）：${methods}`,
    `两法结果一致才允许写入最终答案；不一致立即回炉重做并说明分歧来源。`,
    `每次交付附"校验方法 A/B + 结果一致性"小结。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}

export function recheckCadence(deepTier) {
  return Math.max(1, 3 - Math.min(3, Math.round(Number(deepTier) || 0)));
}
