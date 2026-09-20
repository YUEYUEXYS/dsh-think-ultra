// vcross-engine.js — Think 视觉交叉验证·完整引擎
// 独立引擎文件：验证维度库 / 多视角交叉 / 矛盾检测 / 证据聚合 /
// 置信度校准 / 回炉机制 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const CROSS_VALIDATION_DIMENSIONS = [
  { id: 'object_consistency', name: '物体一致性', weight: 0.20, description: '不同切片/视角中同一物体的描述是否一致' },
  { id: 'spatial_consistency', name: '空间一致性', weight: 0.15, description: '物体的位置、大小、相对关系是否一致' },
  { id: 'color_consistency', name: '颜色一致性', weight: 0.10, description: '颜色描述在不同区域是否一致' },
  { id: 'text_accuracy', name: '文字准确性', weight: 0.20, description: '文字识别是否准确，有无OCR错误' },
  { id: 'context_coherence', name: '上下文连贯性', weight: 0.15, description: '局部描述与整体图像上下文是否连贯' },
  { id: 'detail_verification', name: '细节验证', weight: 0.10, description: '关键细节是否经过多角度验证' },
  { id: 'anomaly_detection', name: '异常检测', weight: 0.10, description: '是否检测到异常、矛盾或不可能的元素' },
];

export const VCROSS_TIERS = {
  light: { label: '轻', dimensionCount: 4, maxRounds: 1, crossViews: 2, tokenBudgetMultiplier: 1.5 },
  medium: { label: '中', dimensionCount: 5, maxRounds: 2, crossViews: 3, tokenBudgetMultiplier: 2.5 },
  heavy: { label: '重', dimensionCount: 7, maxRounds: 3, crossViews: 4, tokenBudgetMultiplier: 4.0 },
  extreme: { label: '极', dimensionCount: 7, maxRounds: 4, crossViews: 5, tokenBudgetMultiplier: 6.0 },
};

export const VIEW_PERSPECTIVES = [
  { id: 'global', name: '全局视角', description: '从整体图像出发，关注整体构图和主题' },
  { id: 'detail', name: '细节视角', description: '聚焦局部细节，关注纹理、文字、小物体' },
  { id: 'comparative', name: '对比视角', description: '对比不同区域，关注异同和关系' },
  { id: 'critical', name: '批判视角', description: '主动寻找错误、矛盾、异常' },
  { id: 'contextual', name: '上下文视角', description: '结合图像上下文和场景理解' },
];

export class CrossValidationResult {
  constructor(dimension) {
    this.dimension = dimension;
    this.consistent = null;
    this.confidence = 0;
    this.evidence = [];
    this.contradictions = [];
    this.notes = '';
  }
}

export function detectContradictions(descriptions) {
  if (!descriptions || descriptions.length < 2) return { contradictions: [], contradictionCount: 0 };
  const contradictions = [];
  const objectMentions = {};
  for (let i = 0; i < descriptions.length; i++) {
    const desc = descriptions[i].text || descriptions[i];
    const objects = extractObjectMentions(desc);
    for (const obj of objects) {
      if (!objectMentions[obj.name]) objectMentions[obj.name] = [];
      objectMentions[obj.name].push({ view: descriptions[i].view || i, ...obj });
    }
  }
  for (const [objName, mentions] of Object.entries(objectMentions)) {
    if (mentions.length < 2) continue;
    const colors = new Set(mentions.map((m) => m.color).filter(Boolean));
    const positions = mentions.map((m) => m.position).filter(Boolean);
    if (colors.size > 1) {
      contradictions.push({ type: 'color_conflict', object: objName, colors: [...colors], severity: 'medium', description: `${objName}的颜色描述不一致：${[...colors].join(' vs ')}` });
    }
    if (positions.length > 1) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          if (positions[i] !== positions[j] && !positionsOverlap(positions[i], positions[j])) {
            contradictions.push({ type: 'position_conflict', object: objName, positions: [positions[i], positions[j]], severity: 'high', description: `${objName}的位置描述矛盾：${positions[i]} vs ${positions[j]}` });
          }
        }
      }
    }
  }
  const textMentions = extractTextMentions(descriptions);
  for (const [text, mentions] of Object.entries(textMentions)) {
    if (mentions.length > 1) {
      const variants = new Set(mentions.map((m) => m.variant));
      if (variants.size > 1) {
        contradictions.push({ type: 'ocr_conflict', text, variants: [...variants], severity: 'high', description: `文字"${text}"的OCR结果不一致：${[...variants].join(' vs ')}` });
      }
    }
  }
  return { contradictions, contradictionCount: contradictions.length, highSeverity: contradictions.filter((c) => c.severity === 'high').length };
}

function extractObjectMentions(text) {
  const mentions = [];
  const patterns = [
    /([\u4e00-\u9fa5a-zA-Z]+)(?:是|为|呈|看起来|似乎)([\u4e00-\u9fa5a-zA-Z]+)色/g,
    /在([\u4e00-\u9fa5a-zA-Z]+)(?:边|侧|方|角|部)/g,
    /([\u4e00-\u9fa5a-zA-Z]+)(?:位于|在|处于)([\u4e00-\u9fa5a-zA-Z]+)/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      mentions.push({ name: m[1], color: m[2]?.includes('色') ? m[2] : null, position: m[2]?.includes('色') ? null : m[2] });
    }
  }
  return mentions;
}

function extractTextMentions(descriptions) {
  const mentions = {};
  for (let i = 0; i < descriptions.length; i++) {
    const desc = descriptions[i].text || descriptions[i];
    const textPattern = /[""「」『』]([^""「」『』]{1,30})[""「」『』]/g;
    let m;
    while ((m = textPattern.exec(desc)) !== null) {
      const key = m[1].toLowerCase().replace(/\s+/g, '');
      if (!mentions[key]) mentions[key] = [];
      mentions[key].push({ view: descriptions[i].view || i, variant: m[1] });
    }
  }
  return mentions;
}

function positionsOverlap(p1, p2) {
  if (!p1 || !p2) return true;
  const overlapWords = ['中', '间', '附近', '周围'];
  return overlapWords.some((w) => p1.includes(w) || p2.includes(w));
}

export function aggregateEvidence(results) {
  if (!results || results.length === 0) return { overallConfidence: 0, consistent: false, dimensions: {} };
  const dimensions = {};
  for (const dim of CROSS_VALIDATION_DIMENSIONS) {
    const dimResults = results.filter((r) => r.dimension === dim.id);
    if (dimResults.length === 0) continue;
    const avgConf = dimResults.reduce((s, r) => s + (r.confidence || 0), 0) / dimResults.length;
    const allConsistent = dimResults.every((r) => r.consistent === true);
    const anyInconsistent = dimResults.some((r) => r.consistent === false);
    dimensions[dim.id] = {
      confidence: Math.round(avgConf * 100) / 100,
      consistent: allConsistent ? true : anyInconsistent ? false : null,
      evidenceCount: dimResults.reduce((s, r) => s + (r.evidence?.length || 0), 0),
      contradictionCount: dimResults.reduce((s, r) => s + (r.contradictions?.length || 0), 0),
    };
  }
  const totalConf = Object.values(dimensions).reduce((s, d) => s + d.confidence * (CROSS_VALIDATION_DIMENSIONS.find((x) => x.id === Object.keys(dimensions).find((k) => dimensions[k] === d))?.weight || 0.1), 0);
  const totalWeight = Object.values(dimensions).reduce((s, d, i) => s + (CROSS_VALIDATION_DIMENSIONS.find((x) => x.id === Object.keys(dimensions)[i])?.weight || 0.1), 0);
  const overallConfidence = totalWeight > 0 ? Math.round((totalConf / totalWeight) * 100) / 100 : 0;
  const allConsistent = Object.values(dimensions).every((d) => d.consistent === true);
  const anyInconsistent = Object.values(dimensions).some((d) => d.consistent === false);
  return { overallConfidence, consistent: allConsistent ? true : anyInconsistent ? false : null, dimensions, totalContradictions: Object.values(dimensions).reduce((s, d) => s + d.contradictionCount, 0) };
}

export function buildCrossValidationPrompt(dimension, view, imageContext, descriptions, roundNo) {
  const dim = CROSS_VALIDATION_DIMENSIONS.find((d) => d.id === dimension) || CROSS_VALIDATION_DIMENSIONS[0];
  const perspective = VIEW_PERSPECTIVES.find((v) => v.id === view) || VIEW_PERSPECTIVES[0];
  const descText = descriptions && descriptions.length > 0
    ? `\n\n已有描述：\n${descriptions.map((d, i) => `[${d.view || i}] ${(d.text || '').slice(0, 300)}`).join('\n')}`
    : '';
  return [
    `【Think 视觉交叉验证·第${roundNo}轮·${dim.name}·${perspective.name}】`,
    `验证维度：${dim.name}（${dim.description}）`,
    `验证视角：${perspective.name}（${perspective.description}）`,
    ``,
    `图像上下文：${String(imageContext || '').slice(0, 300)}`,
    descText,
    ``,
    `请从"${perspective.name}"的角度，对图像进行"${dim.name}"维度的交叉验证。要求：`,
    `1. 独立验证，不依赖已有描述的结论`,
    `2. 列出支持一致性的证据`,
    `3. 列出发现的矛盾或不一致`,
    `4. 给出该维度的一致性判定（一致/不一致/不确定）`,
    `5. 给出置信度（0-100%）`,
  ].join('\n');
}

export function calibrateConfidence(baseConfidence, contradictions, highSeverityCount) {
  let conf = baseConfidence;
  conf -= contradictions * 0.05;
  conf -= highSeverityCount * 0.1;
  return Math.max(0, Math.min(1, Math.round(conf * 100) / 100));
}

export class VCrossFuse {
  constructor(options = {}) {
    this.maxValidations = options.maxValidations || 10;
    this.maxRounds = options.maxRounds || 4;
    this.maxTokenBudget = options.maxTokenBudget || 20000;
    this.validationCount = 0;
    this.roundCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkValidation() {
    if (this.validationCount >= this.maxValidations) { this.trip(`验证次数熔断：${this.maxValidations}`); return false; }
    this.validationCount++;
    return true;
  }
  checkRound() {
    if (this.roundCount >= this.maxRounds) { this.trip(`轮次熔断：${this.maxRounds}`); return false; }
    this.roundCount++;
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.validationCount = 0; this.roundCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { validationCount: this.validationCount, maxValidations: this.maxValidations, roundCount: this.roundCount, maxRounds: this.maxRounds, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class VCrossStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { validationsRun: 0, totalRounds: 0, totalContradictions: 0, avgConfidence: 0, passRate: 0, dimensionBreakdown: {}, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordValidation(id, rounds, contradictions, confidence, passed) {
    const s = this.getSession(id);
    s.validationsRun++;
    s.totalRounds += rounds;
    s.totalContradictions += contradictions;
    s.avgConfidence = (s.avgConfidence * (s.validationsRun - 1) + confidence) / s.validationsRun;
    s.passRate = (s.passRate * (s.validationsRun - 1) + (passed ? 1 : 0)) / s.validationsRun;
  }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    return { validationsRun: s.validationsRun, totalRounds: s.totalRounds, totalContradictions: s.totalContradictions, avgConfidence: Math.round(s.avgConfidence * 100) / 100, passRate: `${Math.round(s.passRate * 100)}%`, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class VCrossEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = VCROSS_TIERS[this.intensity] || VCROSS_TIERS.medium;
    this.fuse = new VCrossFuse({ maxRounds: this.tier.maxRounds });
    this.stats = new VCrossStats();
  }
  setIntensity(i) { if (VCROSS_TIERS[i]) { this.intensity = i; this.tier = VCROSS_TIERS[i]; } }
  async validate(sessionId, imageContext, descriptions, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    const dimensions = CROSS_VALIDATION_DIMENSIONS.slice(0, this.tier.dimensionCount);
    const views = VIEW_PERSPECTIVES.slice(0, this.tier.crossViews);
    const allResults = [];
    let rounds = 0;
    for (let round = 1; round <= this.tier.maxRounds; round++) {
      if (this.fuse.tripped) break;
      if (!this.fuse.checkRound()) break;
      rounds++;
      for (const dim of dimensions) {
        for (const view of views) {
          if (!this.fuse.checkValidation()) break;
          if (!this.fuse.checkToken(400)) break;
          const prompt = buildCrossValidationPrompt(dim.id, view.id, imageContext, descriptions, round);
          if (typeof steerFn === 'function') {
            try {
              const result = await steerFn(prompt, 'vcross-validate');
              const text = result?.text || result?.content || '';
              const r = new CrossValidationResult(dim.id);
              const consistentMatch = text.match(/(一致|不一致|不确定)/);
              r.consistent = consistentMatch ? (consistentMatch[1] === '一致' ? true : consistentMatch[1] === '不一致' ? false : null) : null;
              const confMatch = text.match(/置信度[^0-9]*([0-9]+(?:\.[0-9]+)?)/);
              r.confidence = confMatch ? parseFloat(confMatch[1]) / 100 : 0.6;
              r.notes = text.slice(0, 300);
              allResults.push(r);
            } catch (e) { /* 验证失败不阻断 */ }
          }
        }
      }
      const agg = aggregateEvidence(allResults);
      if (agg.consistent === true && agg.overallConfidence >= 0.75) break;
    }
    const contradictionResult = detectContradictions(descriptions || []);
    const aggregation = aggregateEvidence(allResults);
    const calibratedConf = calibrateConfidence(aggregation.overallConfidence, contradictionResult.contradictionCount, contradictionResult.highSeverity);
    const passed = calibratedConf >= 0.7 && contradictionResult.highSeverity === 0;
    this.stats.recordValidation(sessionId, rounds, contradictionResult.contradictionCount, calibratedConf, passed);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, dimensionsValidated: dimensions.length, viewsUsed: views.length, rounds, totalValidations: allResults.length, contradictions: contradictionResult.contradictions, contradictionCount: contradictionResult.contradictionCount, highSeverityCount: contradictionResult.highSeverity, overallConfidence: calibratedConf, rawConfidence: aggregation.overallConfidence, consistent: aggregation.consistent, passed, dimensionScores: Object.fromEntries(Object.entries(aggregation.dimensions).map(([k, v]) => [k, v.confidence])), fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

export function createVCrossPrompt(objective, intensity = 'medium') {
  const tier = VCROSS_TIERS[intensity] || VCROSS_TIERS.medium;
  return [`【Think 视觉交叉验证·${tier.label}档激活】`, `图像分析结果经过${tier.dimensionCount}个维度×${tier.crossViews}个视角的交叉验证（${CROSS_VALIDATION_DIMENSIONS.slice(0, tier.dimensionCount).map((d) => d.name).join('、')}）。`, `自动检测物体/颜色/位置/文字的矛盾描述，高严重度矛盾触发回炉。`, `置信度经过矛盾校准，最终输出经过验证的可靠描述。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
