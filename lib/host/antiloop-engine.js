// antiloop-engine.js — Think 反循环检测·完整引擎
// 独立引擎文件：循环模式库 / 相似度检测 / 语义重复识别 / 死循环判定 /
// 干预策略 / 上下文压缩 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

// ============================================================
// 一、循环模式库（8 种真实不同的循环模式）
// ============================================================
export const LOOP_PATTERNS = [
  {
    id: 'verbatim_repeat',
    name: '原文重复',
    description: '完全相同或几乎相同的句子/段落重复出现',
    detect: (history, current) => {
      const currentNorm = normalize(current);
      return history.filter((h) => similarity(normalize(h), currentNorm) > 0.9).length;
    },
    severity: 'high',
  },
  {
    id: 'semantic_repeat',
    name: '语义重复',
    description: '不同措辞但表达完全相同的意思',
    detect: (history, current) => {
      const currentKeywords = extractKeywords(current);
      return history.filter((h) => {
        const hKeywords = extractKeywords(h);
        const overlap = currentKeywords.filter((k) => hKeywords.includes(k)).length;
        return overlap / Math.max(1, currentKeywords.length) > 0.7;
      }).length;
    },
    severity: 'medium',
  },
  {
    id: 'argument_circle',
    name: '循环论证',
    description: '用结论本身作为前提来证明结论（A因为B，B因为A）',
    detect: (history, current) => {
      const causalPairs = extractCausalPairs(current);
      let circleCount = 0;
      for (const pair of causalPairs) {
        for (const h of history) {
          const hPairs = extractCausalPairs(h);
          for (const hp of hPairs) {
            if (pair.cause === hp.effect && pair.effect === hp.cause) circleCount++;
          }
        }
      }
      return circleCount;
    },
    severity: 'high',
  },
  {
    id: 'restatement',
    name: '换述循环',
    description: '不推进问题，只是用不同方式重述已有内容',
    detect: (history, current) => {
      const currentInfo = informationGain(current);
      const avgInfo = history.length > 0
        ? history.reduce((s, h) => s + informationGain(h), 0) / history.length
        : 1;
      return currentInfo < avgInfo * 0.3 ? history.length : 0;
    },
    severity: 'medium',
  },
  {
    id: 'apology_loop',
    name: '道歉循环',
    description: '反复道歉但不解决问题（"抱歉，我再试一次"→又错→又道歉）',
    detect: (history, current) => {
      const apologyPatterns = /抱歉|对不起|我错了|再次尝试|重新来|我再试/;
      let count = 0;
      if (apologyPatterns.test(current)) count++;
      for (const h of history.slice(-5)) {
        if (apologyPatterns.test(h)) count++;
      }
      return count >= 3 ? count : 0;
    },
    severity: 'medium',
  },
  {
    id: 'tool_loop',
    name: '工具调用循环',
    description: '反复调用同一个工具但参数/结果没有实质性变化',
    detect: (history, current) => {
      const toolCalls = extractToolCalls(current);
      let loopCount = 0;
      for (const tc of toolCalls) {
        for (const h of history) {
          const hCalls = extractToolCalls(h);
          for (const hc of hCalls) {
            if (tc.name === hc.name && similarity(tc.args, hc.args) > 0.8) loopCount++;
          }
        }
      }
      return loopCount;
    },
    severity: 'high',
  },
  {
    id: 'thinking_loop',
    name: '思考循环',
    description: '在思考过程中反复回到同一个点，无法推进',
    detect: (history, current) => {
      const milestones = extractMilestones(current);
      let repeatCount = 0;
      for (const m of milestones) {
        for (const h of history) {
          if (h.includes(m)) repeatCount++;
        }
      }
      return repeatCount > milestones.length * 2 ? repeatCount : 0;
    },
    severity: 'low',
  },
  {
    id: 'overthinking_no_action',
    name: '过度思考无行动',
    description: '连续多轮只有思考链/规划/分析，但没有任何工具调用、文件读写、代码输出或实际行动，陷入"只想不做"的死循环',
    detect: (history, current) => {
      const isPureThinking = (text) => {
        if (!text || text.length < 20) return false;
        // 有工具调用/代码块/文件操作/行动动词 → 不是纯思考
        const actionSignals = [
          /调用工具|工具调用|function_call|tool_call|<tool|<function|执行|运行|写入|读取|创建|删除|修改|提交|发送|下载|上传/i,
          /```[\s\S]*?```/, // 代码块
          /\.(js|ts|py|rs|go|java|c|cpp|h|json|yaml|yml|md|txt|html|css)\s*[:：]/i, // 文件名
          /第[一二三四五六七八九十\d]+步.*(完成|执行|输出|交付)/,
        ];
        for (const sig of actionSignals) {
          if (sig.test(text)) return false;
        }
        // 纯思考信号：规划/分析/思考/拆解/推理/考虑/让我
        const thinkingSignals = /思考|分析|规划|拆解|推理|考虑|让我|我需要|首先|其次|然后|接下来|步骤|阶段|子问题|思路|方案|策略|设计|架构/i;
        return thinkingSignals.test(text) || text.length > 200;
      };
      if (!isPureThinking(current)) return 0;
      let consecutive = 1;
      for (let i = history.length - 1; i >= 0; i--) {
        if (isPureThinking(history[i])) consecutive++;
        else break;
      }
      return consecutive >= 5 ? consecutive : 0;
    },
    severity: 'high',
  },
  {
    id: 'hedging_loop',
    name: '模糊循环',
    description: '反复使用模糊表述（可能/也许/大概）但不给出确定结论',
    detect: (history, current) => {
      const hedging = /可能|也许|大概|或许|不确定|视情况|不一定/;
      let count = hedging.test(current) ? 1 : 0;
      for (const h of history.slice(-4)) {
        if (hedging.test(h)) count++;
      }
      return count >= 4 ? count : 0;
    },
    severity: 'low',
  },
];

// ============================================================
// 二、工具函数
// ============================================================
export function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[，。！？、；：""''（）【】]/g, '').trim();
}

export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  // LCS-based similarity
  const lcs = longestCommonSubstring(longer, shorter);
  return lcs.length / longer.length;
}

function longestCommonSubstring(s1, s2) {
  if (!s1 || !s2) return '';
  const m = s1.length, n = s2.length;
  let maxLen = 0, endIdx = 0;
  const dp = Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (s1[i - 1] === s2[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > maxLen) { maxLen = dp[j]; endIdx = i; }
      } else {
        dp[j] = 0;
      }
      prev = temp;
    }
  }
  return s1.substring(endIdx - maxLen, endIdx);
}

export function extractKeywords(text) {
  const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves']);
  const words = String(text || '').toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
  return [...new Set(words.filter((w) => !stopWords.has(w)))];
}

export function extractCausalPairs(text) {
  const pairs = [];
  const patterns = [
    /(.{0,30})(?:因为|由于|因|出于)(.{0,30})(?:所以|因此|因而|故|导致|引起|使得)(.{0,30})/g,
    /(.{0,30})(?:所以|因此|因而|故|导致|引起|使得)(.{0,30})(?:因为|由于|因)(.{0,30})/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      pairs.push({ cause: normalize(m[2] || m[3]), effect: normalize(m[3] || m[2]) });
    }
  }
  return pairs;
}

export function informationGain(text) {
  const keywords = extractKeywords(text);
  const uniqueRatio = keywords.length / Math.max(1, String(text || '').length / 5);
  const hasNumbers = /\d+(\.\d+)?/.test(text || '') ? 0.2 : 0;
  const hasStructure = /步骤|阶段|部分|方面|维度|首先|其次|最后|第一|第二/.test(text || '') ? 0.15 : 0;
  return Math.min(1, uniqueRatio * 0.5 + hasNumbers + hasStructure + 0.1);
}

export function extractToolCalls(text) {
  const calls = [];
  const patterns = [
    /调用工具[：:]\s*(\w+)\s*\(([^)]*)\)/g,
    /<tool_call>([\s\S]*?)<\/tool_call>/g,
    /函数(\w+)\s*\(([^)]*)\)/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      calls.push({ name: m[1] || '', args: m[2] || '' });
    }
  }
  return calls;
}

export function extractMilestones(text) {
  const milestones = [];
  const patterns = /(?:首先|第一步|阶段一|part\s*1|step\s*1)[^。！？]*/gi;
  let m;
  while ((m = patterns.exec(text)) !== null) {
    milestones.push(normalize(m[0]));
  }
  return milestones;
}

// ============================================================
// 三、强度分级
// ============================================================
export const ANTILOOP_TIERS = {
  light: { label: '轻', historyWindow: 5, threshold: 3, intervention: 'gentle', tokenBudgetMultiplier: 1.2 },
  medium: { label: '中', historyWindow: 8, threshold: 2, intervention: 'moderate', tokenBudgetMultiplier: 1.5 },
  heavy: { label: '重', historyWindow: 12, threshold: 2, intervention: 'aggressive', tokenBudgetMultiplier: 2.0 },
  extreme: { label: '极', historyWindow: 15, threshold: 1, intervention: 'force', tokenBudgetMultiplier: 2.5 },
};

// ============================================================
// 四、循环检测器
// ============================================================
export function detectLoops(history, current, tier = 'medium') {
  const t = ANTILOOP_TIERS[tier] || ANTILOOP_TIERS.medium;
  const recentHistory = history.slice(-t.historyWindow);
  const detections = [];
  for (const pattern of LOOP_PATTERNS) {
    try {
      const count = pattern.detect(recentHistory, current);
      if (count >= t.threshold) {
        detections.push({
          patternId: pattern.id,
          patternName: pattern.name,
          description: pattern.description,
          severity: pattern.severity,
          occurrenceCount: count,
          confidence: Math.min(1, count / (t.threshold + 2)),
        });
      }
    } catch (e) { /* 检测失败不阻断 */ }
  }
  const highSeverity = detections.filter((d) => d.severity === 'high');
  const isLooping = highSeverity.length > 0 || detections.length >= 2;
  const loopScore = detections.reduce((s, d) => s + d.confidence * (d.severity === 'high' ? 1.5 : d.severity === 'medium' ? 1 : 0.5), 0);
  return { isLooping, loopScore: Math.round(loopScore * 100) / 100, detections, highSeverityCount: highSeverity.length, historySize: recentHistory.length };
}

// ============================================================
// 五、干预策略生成器
// ============================================================
export function generateIntervention(detectionResult, tier = 'medium') {
  if (!detectionResult.isLooping) return null;
  const t = ANTILOOP_TIERS[tier] || ANTILOOP_TIERS.medium;
  const patterns = detectionResult.detections.map((d) => d.patternName).join('、');
  const interventions = [];
  // 基础干预：指出循环
  interventions.push({
    type: 'awareness',
    priority: 1,
    prompt: `【AntiLoop 检测】检测到循环模式：${patterns}。请停止重复，直接推进到下一个未解决的问题点。`,
  });
  // 根据模式类型给具体干预
  for (const d of detectionResult.detections) {
    switch (d.patternId) {
      case 'verbatim_repeat':
      case 'semantic_repeat':
        interventions.push({ type: 'redirect', priority: 2, prompt: '不要重述已有内容。列出当前尚未解决的 3 个具体子问题，逐个解决。' });
        break;
      case 'argument_circle':
        interventions.push({ type: 'break_circle', priority: 2, prompt: '检测到循环论证。请引入外部证据或独立前提来打破循环，不允许用结论证明结论。' });
        break;
      case 'tool_loop':
        interventions.push({ type: 'tool_break', priority: 2, prompt: '检测到工具调用循环。停止调用同一工具。分析上次返回结果中未利用的信息，或换一种方法。' });
        break;
      case 'apology_loop':
        interventions.push({ type: 'stop_apology', priority: 2, prompt: '停止道歉循环。不需要再道歉，直接给出修正后的具体答案。' });
        break;
      case 'overthinking_no_action':
        interventions.push({ type: 'force_action', priority: 1, prompt: '【AntiLoop 强制行动】检测到过度思考无行动循环：连续多轮只有思考链但没有任何实际行动。立即停止纯思考，必须执行以下至少一项：①调用一个工具（读文件/写文件/运行代码）②输出可执行的代码块③给出具体的交付物。不允许再继续"规划/分析/思考"，必须直接动手做。如果信息不足，先用工具获取信息，而不是继续空想。' });
        break;
      case 'hedging_loop':
        interventions.push({ type: 'commit', priority: 2, prompt: '停止模糊表述。对每个关键问题给出明确判断（是/否/条件性是），不确定的标注"待验证"而不是"可能"。' });
        break;
      default:
        interventions.push({ type: 'general', priority: 3, prompt: '换一个完全不同的角度重新切入问题，不沿用当前的推理路径。' });
    }
  }
  // 高强度干预：上下文压缩 + 强制重启
  if (t.intervention === 'aggressive' || t.intervention === 'force') {
    interventions.push({
      type: 'context_compress',
      priority: 1,
      prompt: `【强制干预】循环分数 ${detectionResult.loopScore}。压缩上下文：只保留最近 3 轮的关键结论和未解决问题，丢弃所有重复内容。从压缩后的状态重新开始。`,
    });
  }
  if (t.intervention === 'force') {
    interventions.push({
      type: 'hard_reset',
      priority: 0,
      prompt: `【硬重置】循环分数 ${detectionResult.loopScore} 超过阈值。立即停止当前推理路径。用一句话总结当前状态，然后从完全不同的第一性原理重新推导。`,
    });
  }
  // 按优先级排序
  interventions.sort((a, b) => a.priority - b.priority);
  return {
    interventionLevel: t.intervention,
    patterns,
    loopScore: detectionResult.loopScore,
    actions: interventions,
    combinedPrompt: interventions.map((i) => i.prompt).join('\n'),
  };
}

// ============================================================
// 六、熔断保护器
// ============================================================
export class AntiLoopFuse {
  constructor(options = {}) {
    this.maxDetections = options.maxDetections || 10;
    this.maxInterventions = options.maxInterventions || 5;
    this.detectionCount = 0;
    this.interventionCount = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkDetection() {
    if (this.detectionCount >= this.maxDetections) { this.trip(`检测次数熔断：已达上限 ${this.maxDetections}`); return false; }
    this.detectionCount++;
    return true;
  }
  checkIntervention() {
    if (this.interventionCount >= this.maxInterventions) { this.trip(`干预次数熔断：已达上限 ${this.maxInterventions}`); return false; }
    this.interventionCount++;
    return true;
  }
  trip(reason) { this.tripped = true; this.tripReason = reason; }
  reset() { this.detectionCount = 0; this.interventionCount = 0; this.tripped = false; this.tripReason = ''; }
  status() {
    return { detectionCount: this.detectionCount, maxDetections: this.maxDetections, interventionCount: this.interventionCount, maxInterventions: this.maxInterventions, tripped: this.tripped, tripReason: this.tripReason };
  }
}

// ============================================================
// 七、统计记录器
// ============================================================
export class AntiLoopStats {
  constructor() { this.sessions = new Map(); }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { checksRun: 0, loopsDetected: 0, interventionsIssued: 0, patternBreakdown: {}, avgLoopScore: 0, fuseTrips: 0, startTime: Date.now() });
    }
    return this.sessions.get(sessionId);
  }
  recordCheck(sessionId, detection) {
    const s = this.getSession(sessionId);
    s.checksRun++;
    s.avgLoopScore = (s.avgLoopScore * (s.checksRun - 1) + detection.loopScore) / s.checksRun;
    if (detection.isLooping) {
      s.loopsDetected++;
      for (const d of detection.detections) {
        s.patternBreakdown[d.patternId] = (s.patternBreakdown[d.patternId] || 0) + 1;
      }
    }
  }
  recordIntervention(sessionId) { this.getSession(sessionId).interventionsIssued++; }
  recordFuseTrip(sessionId) { this.getSession(sessionId).fuseTrips++; }
  summary(sessionId) {
    const s = this.getSession(sessionId);
    const topPatterns = Object.entries(s.patternBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, count]) => { const p = LOOP_PATTERNS.find((x) => x.id === id); return { name: p?.name || id, count }; });
    return { checksRun: s.checksRun, loopsDetected: s.loopsDetected, interventionsIssued: s.interventionsIssued, detectionRate: s.checksRun > 0 ? `${Math.round((s.loopsDetected / s.checksRun) * 100)}%` : '0%', avgLoopScore: Math.round(s.avgLoopScore * 100) / 100, topPatterns, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

// ============================================================
// 八、主引擎入口
// ============================================================
export class AntiLoopEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = ANTILOOP_TIERS[this.intensity] || ANTILOOP_TIERS.medium;
    this.fuse = new AntiLoopFuse();
    this.stats = new AntiLoopStats();
    this.history = [];
  }
  setIntensity(intensity) {
    if (ANTILOOP_TIERS[intensity]) { this.intensity = intensity; this.tier = ANTILOOP_TIERS[intensity]; }
  }
  addToHistory(text) {
    if (text && String(text).trim().length > 0) {
      this.history.push(String(text).slice(0, 2000));
      if (this.history.length > 50) this.history.shift();
    }
  }
  check(sessionId, currentText) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason, detection: null, intervention: null };
    if (!this.fuse.checkDetection()) return { ok: false, reason: this.fuse.tripReason, detection: null, intervention: null };
    const detection = detectLoops(this.history, currentText, this.intensity);
    this.stats.recordCheck(sessionId, detection);
    let intervention = null;
    if (detection.isLooping && this.fuse.checkIntervention()) {
      intervention = generateIntervention(detection, this.intensity);
      this.stats.recordIntervention(sessionId);
    }
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, detection, intervention, historySize: this.history.length };
  }
  getStats(sessionId) { return this.stats.summary(sessionId); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); this.history = []; }
}

// ============================================================
// 九、兼容函数
// ============================================================
export function createAntiLoopPrompt(objective, intensity = 'medium') {
  const tier = ANTILOOP_TIERS[intensity] || ANTILOOP_TIERS.medium;
  return [
    `【Think 反循环检测·${tier.label}档激活】`,
    `系统实时监测推理过程中的 8 种循环模式（原文重复/语义重复/循环论证/换述循环/道歉循环/工具调用循环/思考循环/模糊循环）。`,
    `检测到循环时自动干预：轻度提醒→中度 redirect→重度上下文压缩→极硬重置。`,
    `历史窗口 ${tier.historyWindow} 轮，阈值 ${tier.threshold} 次。`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}
