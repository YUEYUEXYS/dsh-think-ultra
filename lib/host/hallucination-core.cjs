// hallucination-core.cjs — 真正运行的幻觉检测引擎
// 基于规则和启发式的事实/逻辑/数值/来源验证，支持矛盾检测、数值验证、来源可靠性评估。
// 不是提示词，是实际在后端运行的代码，对模型输出做幻觉检测。

'use strict';

class HallucinationDetector {
  constructor(options = {}) {
    this.factDatabase = options.factDatabase || new Map(); // 已知事实库
    this.suspiciousPatterns = options.suspiciousPatterns || [
      // 常见幻觉模式
      { pattern: /据(不明确|未知|某)研究|有研究表明(但未说明来源)/, type: 'vague_source', severity: 0.6 },
      { pattern: /所有人都|没有人能|绝对不可能|永远不会/, type: 'overgeneralization', severity: 0.5 },
      { pattern: /我确定|我保证|毫无疑问(但无证据)/, type: 'false_certainty', severity: 0.4 },
      { pattern: /据说|听说|有人说|相传/, type: 'hearsay', severity: 0.5 },
      { pattern: /最新研究|最新数据(但无时间)/, type: 'untimely_claim', severity: 0.3 },
    ];
    this.detectionHistory = [];
    this.maxHistory = options.maxHistory || 200;
  }

  // 全面幻觉检测
  detect(text, context = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { hasHallucination: false, score: 0, issues: [], details: {} };
    }

    const issues = [];
    const details = {};

    // 1. 事实一致性检测
    const factCheck = this._checkFacts(text, context);
    details.factCheck = factCheck;
    if (factCheck.issues.length > 0) issues.push(...factCheck.issues);

    // 2. 逻辑一致性检测
    const logicCheck = this._checkLogic(text);
    details.logicCheck = logicCheck;
    if (logicCheck.issues.length > 0) issues.push(...logicCheck.issues);

    // 3. 数值合理性检测
    const numericCheck = this._checkNumeric(text);
    details.numericCheck = numericCheck;
    if (numericCheck.issues.length > 0) issues.push(...numericCheck.issues);

    // 4. 来源可靠性检测
    const sourceCheck = this._checkSources(text);
    details.sourceCheck = sourceCheck;
    if (sourceCheck.issues.length > 0) issues.push(...sourceCheck.issues);

    // 5. 可疑模式检测
    const patternCheck = this._checkPatterns(text);
    details.patternCheck = patternCheck;
    if (patternCheck.issues.length > 0) issues.push(...patternCheck.issues);

    // 6. 过度断言检测
    const assertionCheck = this._checkAssertions(text);
    details.assertionCheck = assertionCheck;
    if (assertionCheck.issues.length > 0) issues.push(...assertionCheck.issues);

    // 计算幻觉分数（加权）
    const score = this._calculateScore(details);

    const result = {
      hasHallucination: score >= 0.4,
      score,
      level: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : score >= 0.2 ? 'low' : 'none',
      issues,
      details,
      recommendation: this._getRecommendation(score),
    };

    this._recordHistory(result);
    return result;
  }

  // 批量检测（用于多候选答案的幻觉比较）
  detectBatch(texts, context = {}) {
    if (!Array.isArray(texts)) return [];
    return texts.map((t, i) => {
      const result = this.detect(t, context);
      result.index = i;
      return result;
    }).sort((a, b) => a.score - b.score); // 幻觉分数低的排前面
  }

  // 选择最可信的候选（幻觉最少）
  selectMostTrusted(texts, context = {}, maxHallucination = 0.5) {
    const ranked = this.detectBatch(texts, context);
    if (ranked.length === 0) return { best: null, ranked: [] };
    const best = ranked[0];
    if (best.score > maxHallucination) {
      return { best: null, ranked, reason: '所有候选幻觉分数超过阈值' };
    }
    return { best, ranked };
  }

  // 添加已知事实（用于事实库更新）
  addFact(key, value, confidence = 0.9) {
    this.factDatabase.set(key.toLowerCase(), { value, confidence, addedAt: Date.now() });
  }

  // 获取检测统计
  getStats() {
    if (this.detectionHistory.length === 0) {
      return { total: 0, hallucinationRate: 0, avgScore: 0, issueTypes: {} };
    }
    let hallucinationCount = 0;
    let sumScore = 0;
    const issueTypes = {};
    for (const h of this.detectionHistory) {
      if (h.hasHallucination) hallucinationCount++;
      sumScore += h.score;
      for (const issue of h.issues) {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      }
    }
    return {
      total: this.detectionHistory.length,
      hallucinationRate: hallucinationCount / this.detectionHistory.length,
      avgScore: sumScore / this.detectionHistory.length,
      issueTypes,
    };
  }

  // ========== 内部检测方法 ==========

  _checkFacts(text, context) {
    const issues = [];
    // 提取事实性陈述（包含"是""为""等于"等的句子）
    const sentences = text.split(/[。！？.!?\n]/);
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      // 检查是否与已知事实矛盾
      for (const [key, fact] of this.factDatabase) {
        if (sentence.toLowerCase().includes(key)) {
          // 简单检查：如果句子包含否定词但事实是肯定的，可能矛盾
          if (/不是|不对|错误|并非|不同于/.test(sentence) && fact.confidence > 0.8) {
            issues.push({
              type: 'fact_contradiction',
              severity: 0.8,
              message: `陈述可能与已知事实"${key}"矛盾`,
              sentence: sentence.trim().slice(0, 100),
            });
          }
        }
      }
    }
    return { issues, checked: sentences.length };
  }

  _checkLogic(text) {
    const issues = [];
    // 检测循环论证
    if (/因为.*所以.*因为|之所以.*是因为.*之所以/.test(text)) {
      issues.push({ type: 'circular_reasoning', severity: 0.6, message: '可能存在循环论证' });
    }
    // 检测因果谬误（相关当因果）
    if (/因为.*导致|由于.*造成|.*所以.*(但无直接因果)/.test(text)) {
      // 这是正常的因果陈述，不自动扣分
    }
    // 检测偷换概念
    if (/换句话说|也就是说|换言之(但前后概念不一致)/.test(text)) {
      // 需要更复杂的NLP，这里只标记
    }
    // 检测自相矛盾（同一段落中出现相反断言）
    const positiveMatch = text.match(/是|对|正确|肯定|增加|上升|提高/g);
    const negativeMatch = text.match(/不是|不对|错误|否定|减少|下降|降低/g);
    if (positiveMatch && negativeMatch && positiveMatch.length > 3 && negativeMatch.length > 3) {
      // 正反断言都很多，可能存在矛盾（但也可能是辩证论述）
      issues.push({ type: 'potential_contradiction', severity: 0.3, message: '正反断言较多，需检查是否存在矛盾' });
    }
    return { issues };
  }

  _checkNumeric(text) {
    const issues = [];
    // 提取所有数字
    const numbers = text.match(/\d+(\.\d+)?/g) || [];
    // 检测极端数值（可能是编造的）
    for (const numStr of numbers) {
      const num = parseFloat(numStr);
      // 非常大的数字（超过1万亿）且无单位，可能可疑
      if (num > 1e12 && !/万亿|亿|万|%|美元|元|年|月|日|人|次/.test(text.substring(Math.max(0, text.indexOf(numStr) - 10), text.indexOf(numStr) + numStr.length + 10))) {
        issues.push({
          type: 'extreme_number',
          severity: 0.4,
          message: `极端数值 ${numStr} 缺少明确单位，可能是编造的`,
        });
      }
      // 百分比超过100%
      if (num > 100 && new RegExp(numStr + '\\s*%').test(text)) {
        issues.push({
          type: 'invalid_percentage',
          severity: 0.7,
          message: `百分比 ${numStr}% 超过100%，可能错误`,
        });
      }
    }
    // 检测数值矛盾（如"增长了50%"和"减少了30%"同时出现）
    if (/增长|增加|上升|提高/.test(text) && /减少|下降|降低/.test(text)) {
      // 可能是对比论述，不自动扣分
    }
    // 检测精确到不合理的数字（如"1234567人"这种过于精确的统计）
    const preciseNumbers = text.match(/\d{5,}/g) || [];
    for (const pn of preciseNumbers) {
      if (!/年|月|日|号|ID|编号|电话|邮编|版本/.test(text.substring(Math.max(0, text.indexOf(pn) - 5), text.indexOf(pn) + pn.length + 5))) {
        issues.push({
          type: 'overly_precise',
          severity: 0.3,
          message: `过于精确的数字 ${pn} 可能是编造的（统计数据通常不会精确到个位）`,
        });
      }
    }
    return { issues, numberCount: numbers.length };
  }

  _checkSources(text) {
    const issues = [];
    // 检测无来源的事实性断言
    const factAssertions = text.match(/(研究表明|数据显示|据统计|调查发现|实验证明|专家指出)/g) || [];
    for (const assertion of factAssertions) {
      // 检查后面是否有具体来源
      const idx = text.indexOf(assertion);
      const after = text.substring(idx, idx + 100);
      if (!/(大学|研究机构|公司|实验室|期刊|论文|作者|年份|政府|组织)/.test(after)) {
        issues.push({
          type: 'vague_source',
          severity: 0.5,
          message: `"${assertion}"缺少具体来源（机构/作者/年份），可能是编造的引用`,
        });
      }
    }
    // 检测"最新"但无时间
    if (/最新|最近|近期(研究|数据|调查)/.test(text) && !/\d{4}|今年|去年|本月|上月|本周|上周/.test(text)) {
      issues.push({
        type: 'untimely_claim',
        severity: 0.3,
        message: '提到"最新"但未给出具体时间，无法验证时效性',
      });
    }
    return { issues, assertionCount: factAssertions.length };
  }

  _checkPatterns(text) {
    const issues = [];
    for (const { pattern, type, severity } of this.suspiciousPatterns) {
      if (pattern.test(text)) {
        issues.push({ type, severity, message: `检测到可疑模式：${type}` });
      }
    }
    return { issues };
  }

  _checkAssertions(text) {
    const issues = [];
    // 检测过度断言（没有任何限定词的绝对断言）
    const absolutePatterns = [
      /所有人都|每个人都|没有人|没有任何|绝对|一定|肯定|必然|毫无疑问|永远|总是/,
      /100%|完全|全部|所有|一切/,
    ];
    let absoluteCount = 0;
    for (const pattern of absolutePatterns) {
      const matches = text.match(pattern) || [];
      absoluteCount += matches.length;
    }
    if (absoluteCount >= 3) {
      issues.push({
        type: 'over_assertion',
        severity: 0.4,
        message: `存在 ${absoluteCount} 处绝对断言，过度断言容易产生幻觉`,
      });
    }
    // 检测没有任何不确定性表达的长文本
    if (text.length > 500 && !/可能|也许|大概|或许|似乎|好像|应该|建议|不确定|不一定|有可能|据推测/.test(text)) {
      issues.push({
        type: 'no_uncertainty',
        severity: 0.2,
        message: '长文本中没有任何不确定性表达，可能过度自信',
      });
    }
    return { issues, absoluteCount };
  }

  _calculateScore(details) {
    // 加权计算幻觉分数
    let score = 0;
    const weights = {
      factCheck: 0.25,
      logicCheck: 0.15,
      numericCheck: 0.2,
      sourceCheck: 0.2,
      patternCheck: 0.1,
      assertionCheck: 0.1,
    };
    for (const [key, weight] of Object.entries(weights)) {
      const check = details[key];
      if (check && check.issues && check.issues.length > 0) {
        const maxSeverity = Math.max(...check.issues.map(i => i.severity));
        const countFactor = Math.min(1, check.issues.length * 0.3);
        score += weight * maxSeverity * countFactor;
      }
    }
    return Math.min(1, score);
  }

  _getRecommendation(score) {
    if (score >= 0.7) return '高幻觉风险，建议重新推导或人工验证关键事实';
    if (score >= 0.4) return '中等幻觉风险，建议验证关键数据和来源';
    if (score >= 0.2) return '低幻觉风险，建议对绝对断言做适度验证';
    return '幻觉风险低，可正常使用';
  }

  _recordHistory(result) {
    this.detectionHistory.push({
      hasHallucination: result.hasHallucination,
      score: result.score,
      issueCount: result.issues.length,
      at: Date.now(),
    });
    if (this.detectionHistory.length > this.maxHistory) {
      this.detectionHistory.shift();
    }
  }
}

module.exports = { HallucinationDetector };
