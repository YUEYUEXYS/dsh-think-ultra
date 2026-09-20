// calibrate-core.cjs — 真正运行的置信度校准引擎
// 基于规则和启发式的置信度评估，支持Platt缩放风格校准、分领域校准、不确定性量化。
// 不是提示词，是实际在后端运行的代码，对模型输出做置信度评估和校准。

'use strict';

class ConfidenceCalibrator {
  constructor(options = {}) {
    this.domainWeights = options.domainWeights || {
      fact: 1.0,        // 事实性陈述
      reasoning: 0.9,   // 逻辑推理
      prediction: 0.7,  // 预测性内容
      code: 0.95,       // 代码相关
      opinion: 0.6,     // 观点/建议
      math: 0.98,       // 数学计算
    };
    this.calibrationParams = options.calibrationParams || {
      // Platt缩放风格参数：sigmoid(a*x + b)
      a: 1.5,
      b: -0.3,
      // 温度缩放参数
      temperature: 1.2,
    };
    this.history = []; // 历史评估记录，用于在线校准
    this.maxHistory = options.maxHistory || 500;
  }

  // 评估文本的置信度（0-1）
  evaluate(text, context = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { confidence: 0, domain: 'unknown', factors: {}, calibrated: 0 };
    }

    const factors = {};
    const domain = this._classifyDomain(text, context);
    factors.domain = domain;

    // 1. 断言强度：确定性词汇 vs 不确定性词汇
    const assertiveness = this._evaluateAssertiveness(text);
    factors.assertiveness = assertiveness;

    // 2. 证据支撑：是否有数据、引用、来源
    const evidence = this._evaluateEvidence(text);
    factors.evidence = evidence;

    // 3. 逻辑一致性：内部是否有矛盾
    const consistency = this._evaluateConsistency(text);
    factors.consistency = consistency;

    // 4. 具体性：是否有具体数字、名称、细节
    const specificity = this._evaluateSpecificity(text);
    factors.specificity = specificity;

    // 5. 长度与结构
    const structure = this._evaluateStructure(text);
    factors.structure = structure;

    // 原始置信度（加权平均）
    const rawConfidence = (
      assertiveness * 0.2 +
      evidence * 0.25 +
      consistency * 0.2 +
      specificity * 0.15 +
      structure * 0.1 +
      this.domainWeights[domain] * 0.1
    );

    // Platt缩放风格校准
    const calibrated = this._plattScale(rawConfidence);

    // 记录历史（用于在线校准）
    this._recordHistory({ text: text.slice(0, 100), domain, raw: rawConfidence, calibrated, factors });

    return {
      confidence: Math.max(0, Math.min(1, rawConfidence)),
      calibrated: Math.max(0, Math.min(1, calibrated)),
      domain,
      factors,
      level: this._confidenceLevel(calibrated),
    };
  }

  // 批量评估（用于多候选答案的置信度比较）
  evaluateBatch(texts, context = {}) {
    if (!Array.isArray(texts)) return [];
    return texts.map((t, i) => {
      const result = this.evaluate(t, context);
      result.index = i;
      return result;
    }).sort((a, b) => b.calibrated - a.calibrated);
  }

  // 选择最优候选（基于校准后置信度）
  selectBest(texts, context = {}, minConfidence = 0.3) {
    const ranked = this.evaluateBatch(texts, context);
    if (ranked.length === 0) return { best: null, ranked: [] };
    const best = ranked[0];
    if (best.calibrated < minConfidence) {
      return { best: null, ranked, reason: '所有候选置信度低于阈值' };
    }
    // 检查前两名是否接近（如果接近，标记为需要人工判断）
    const needHuman = ranked.length > 1 && (best.calibrated - ranked[1].calibrated) < 0.1;
    return { best, ranked, needHuman };
  }

  // 不确定性量化（给出置信区间）
  quantifyUncertainty(text, context = {}) {
    const result = this.evaluate(text, context);
    // 基于置信度和领域给出置信区间
    const margin = (1 - result.calibrated) * 0.3 * (1 / (this.domainWeights[result.domain] || 1));
    return {
      pointEstimate: result.calibrated,
      lowerBound: Math.max(0, result.calibrated - margin),
      upperBound: Math.min(1, result.calibrated + margin),
      margin,
      level: result.level,
      recommendation: this._uncertaintyRecommendation(result.calibrated),
    };
  }

  // 获取校准统计
  getStats() {
    if (this.history.length === 0) {
      return { total: 0, avgConfidence: 0, avgCalibrated: 0, domainDistribution: {} };
    }
    const domainCount = {};
    let sumRaw = 0, sumCal = 0;
    for (const h of this.history) {
      sumRaw += h.raw;
      sumCal += h.calibrated;
      domainCount[h.domain] = (domainCount[h.domain] || 0) + 1;
    }
    return {
      total: this.history.length,
      avgConfidence: sumRaw / this.history.length,
      avgCalibrated: sumCal / this.history.length,
      domainDistribution: domainCount,
    };
  }

  // ========== 内部方法 ==========

  _classifyDomain(text, context) {
    if (context.domain && this.domainWeights[context.domain]) return context.domain;
    if (/```|function|class|const|let|var|import|export|def |class |interface|type /.test(text)) return 'code';
    if (/\d+\s*[\+\-\*\/×÷^=]\s*\d+|等于|合计|总计|平均|百分比/.test(text)) return 'math';
    if (/预计|预测|将会|可能会|未来|趋势|展望/.test(text)) return 'prediction';
    if (/我认为|建议|应该|最好|推荐|个人觉得/.test(text)) return 'opinion';
    if (/根据|来源|引用|数据显示|研究表明|据.*报道/.test(text)) return 'fact';
    return 'reasoning';
  }

  _evaluateAssertiveness(text) {
    const strongWords = /一定|肯定|确定|必然|毫无疑问|显然|明显|确实|绝对|总是|永远|必须|所有|全部|完全|准确|精确|正确|无误/;
    const weakWords = /可能|也许|大概|或许|似乎|好像|应该|建议|恐怕|不确定|不一定|有可能|据说|听说|据推测|大概是|应该是/;
    const strongCount = (text.match(strongWords) || []).length;
    const weakCount = (text.match(weakWords) || []).length;
    const total = strongCount + weakCount;
    if (total === 0) return 0.6; // 中性
    return Math.max(0.1, Math.min(1, 0.5 + (strongCount - weakCount) * 0.15));
  }

  _evaluateEvidence(text) {
    let score = 0.3; // 基础分
    // 数字数据
    if (/\d+(\.\d+)?/.test(text)) score += 0.15;
    // 百分比
    if (/\d+(\.\d+)?%/.test(text)) score += 0.1;
    // 来源引用
    if (/根据|来源|引用|数据显示|研究表明|据.*报道|论文|文献|资料/.test(text)) score += 0.2;
    // 具体名称
    if (/[A-Z][a-z]+|[A-Z]{2,}|[\u4e00-\u9fa5]{2,}(公司|大学|研究|机构|系统|模型|算法)/.test(text)) score += 0.1;
    // 代码块或引用
    if (/```|>|[""]/.test(text)) score += 0.1;
    return Math.min(1, score);
  }

  _evaluateConsistency(text) {
    let score = 0.8; // 基础分（假设一致）
    // 检测矛盾词汇
    const contradictions = [
      [/但是|然而|不过|可是|虽然/, /并且|而且|同时|此外/], // 转折 vs 递进
      [/增加|上升|提高|增长|多/, /减少|下降|降低|减少|少/], // 增加 vs 减少
      [/正确|对|是|肯定/, /错误|不对|否|否定/], // 肯定 vs 否定
      [/所有|全部|总是|永远/, /有些|部分|有时|偶尔/], // 全称 vs 特称
    ];
    for (const [a, b] of contradictions) {
      if (a.test(text) && b.test(text)) {
        // 同时出现矛盾词汇，降低分数（但不一定是真矛盾，可能是对比论述）
        score -= 0.1;
      }
    }
    // 检测自相矛盾的陈述
    if (/不是.*而是|并非.*而是|不同于|而不是/.test(text)) {
      // 这是正常的对比论述，不扣分
    }
    return Math.max(0.2, Math.min(1, score));
  }

  _evaluateSpecificity(text) {
    let score = 0.3;
    // 具体数字
    const numbers = text.match(/\d+(\.\d+)?/g) || [];
    score += Math.min(0.2, numbers.length * 0.05);
    // 具体名称（2字以上的中文专有名词或英文单词）
    const names = text.match(/[A-Z][a-z]{2,}|[\u4e00-\u9fa5]{3,}/g) || [];
    score += Math.min(0.2, names.length * 0.03);
    // 日期时间
    if (/\d{4}年|\d{1,2}月|\d{1,2}日|\d{1,2}:\d{2}|昨天|今天|明天|上周|下周/.test(text)) score += 0.1;
    // 地点
    if (/[北京上海广州深圳杭州成都武汉西安南京重庆]|市|省|区|县|街|路|号/.test(text)) score += 0.1;
    return Math.min(1, score);
  }

  _evaluateStructure(text) {
    let score = 0.4;
    const len = text.length;
    // 长度适中（100-2000字符）
    if (len >= 100 && len <= 2000) score += 0.2;
    else if (len > 2000) score += 0.1; // 太长扣分
    // 有结构（列表、标题、分段）
    if (/^[\d]+\.|^[-*•]|^#|^##|^\d+[、.）)]/m.test(text)) score += 0.2;
    // 有开头和结尾
    if (len > 50 && /首先|第一|开始|总的来说|综上|因此|所以|最后|结论/.test(text)) score += 0.1;
    return Math.min(1, score);
  }

  _plattScale(x) {
    // sigmoid(a*x + b) 风格校准
    const { a, b } = this.calibrationParams;
    const z = a * x + b;
    return 1 / (1 + Math.exp(-z));
  }

  _confidenceLevel(confidence) {
    if (confidence >= 0.85) return 'high';
    if (confidence >= 0.6) return 'medium';
    if (confidence >= 0.4) return 'low';
    return 'very_low';
  }

  _uncertaintyRecommendation(confidence) {
    if (confidence >= 0.85) return '高置信度，可直接使用';
    if (confidence >= 0.6) return '中等置信度，建议关键结论做验证';
    if (confidence >= 0.4) return '低置信度，需要更多证据或人工审核';
    return '极低置信度，不建议直接使用，需要重新推导';
  }

  _recordHistory(record) {
    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
}

module.exports = { ConfidenceCalibrator };
