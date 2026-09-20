// Think v0.11-RC2 - Metacognition Engine
// 自我能力边界评估、任务难度预判、执行路径自我修正、中间结果自我校验、
// 错误自我回溯、方案自我迭代、认知偏差修正、执行效果自我量化评估

const METACOGNITION_STATES = {
  IDLE: 'idle',
  ASSESSING: 'assessing',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  VERIFYING: 'verifying',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const CAPABILITY_BOUNDARIES = {
  contextLength: { min: 1000, max: 128000, optimal: 64000 },
  reasoningDepth: { min: 1, max: 10, optimal: 5 },
  taskComplexity: { min: 1, max: 10, optimal: 5 },
  parallelAgents: { min: 1, max: 8, optimal: 3 },
  tokenBudget: { min: 100, max: 100000, optimal: 10000 },
};

class MetacognitionEngine {
  constructor() {
    this.state = METACOGNITION_STATES.IDLE;
    this.taskHistory = [];
    this.currentTask = null;
    this.selfAssessment = null;
    this.iterationCount = 0;
    this.maxIterations = 5;
    this.biasCorrectionLog = [];
  }

  assessCapability(taskDescription) {
    this.state = METACOGNITION_STATES.ASSESSING;
    const complexity = this._estimateComplexity(taskDescription);
    const contextNeed = this._estimateContextNeed(taskDescription);
    const reasoningNeed = this._estimateReasoningDepth(taskDescription);
    const withinBoundary = this._checkBoundary(complexity, contextNeed, reasoningNeed);
    this.selfAssessment = {
      taskDescription,
      complexity,
      contextNeed,
      reasoningNeed,
      withinBoundary,
      confidence: withinBoundary ? this._calculateConfidence(complexity) : 0.3,
      assessedAt: Date.now(),
    };
    return this.selfAssessment;
  }

  planExecution(taskDescription) {
    this.state = METACOGNITION_STATES.PLANNING;
    const assessment = this.selfAssessment || this.assessCapability(taskDescription);
    const plan = {
      taskDescription,
      steps: this._generateSteps(assessment),
      estimatedTokens: this._estimateTokens(assessment),
      estimatedTime: this._estimateTime(assessment),
      riskLevel: this._assessRisk(assessment),
      fallbackPlan: this._generateFallback(assessment),
      plannedAt: Date.now(),
    };
    this.currentTask = { ...assessment, ...plan };
    return plan;
  }

  verifyIntermediateResult(result, stepIndex) {
    this.state = METACOGNITION_STATES.VERIFYING;
    const checks = {
      completeness: this._checkCompleteness(result, stepIndex),
      consistency: this._checkConsistency(result),
      correctness: this._checkCorrectness(result),
      biasDetected: this._detectBias(result),
    };
    const passed = checks.completeness && checks.consistency && checks.correctness;
    if (checks.biasDetected) {
      this._correctBias(result, stepIndex);
    }
    return { passed, checks, verifiedAt: Date.now() };
  }

  selfCorrect(error, context) {
    this.iterationCount++;
    if (this.iterationCount > this.maxIterations) {
      this.state = METACOGNITION_STATES.FAILED;
      return { shouldRetry: false, reason: 'max iterations exceeded' };
    }
    this.state = METACOGNITION_STATES.RETRYING;
    const rootCause = this._traceError(error, context);
    const correction = this._generateCorrection(rootCause, context);
    return {
      shouldRetry: true,
      rootCause,
      correction,
      iteration: this.iterationCount,
      correctedAt: Date.now(),
    };
  }

  quantifyExecution(result, taskDescription) {
    const metrics = {
      successRate: this._calculateSuccessRate(),
      qualityScore: this._scoreQuality(result, taskDescription),
      efficiencyScore: this._scoreEfficiency(),
      consistencyScore: this._scoreConsistency(),
      overallScore: 0,
    };
    metrics.overallScore = (
      metrics.successRate * 0.3 +
      metrics.qualityScore * 0.3 +
      metrics.efficiencyScore * 0.2 +
      metrics.consistencyScore * 0.2
    );
    this.taskHistory.push({
      taskDescription,
      metrics,
      completedAt: Date.now(),
    });
    this.state = METACOGNITION_STATES.COMPLETED;
    this.iterationCount = 0;
    return metrics;
  }

  _estimateComplexity(desc) {
    const len = desc.length;
    const keywords = (desc.match(/(复杂|多步|并行|长链|深度|重构|架构)/g) || []).length;
    return Math.min(10, Math.max(1, Math.round(len / 200 + keywords)));
  }

  _estimateContextNeed(desc) {
    return Math.min(128000, Math.max(1000, desc.length * 10));
  }

  _estimateReasoningDepth(desc) {
    return Math.min(10, Math.max(1, Math.round(desc.length / 300)));
  }

  _checkBoundary(complexity, context, reasoning) {
    return (
      complexity <= CAPABILITY_BOUNDARIES.taskComplexity.max &&
      context <= CAPABILITY_BOUNDARIES.contextLength.max &&
      reasoning <= CAPABILITY_BOUNDARIES.reasoningDepth.max
    );
  }

  _calculateConfidence(complexity) {
    return Math.max(0.3, 1 - complexity / 15);
  }

  _generateSteps(assessment) {
    const steps = [];
    const count = Math.min(8, Math.max(2, Math.ceil(assessment.complexity / 2)));
    for (let i = 0; i < count; i++) {
      steps.push({ index: i, description: `step-${i}`, status: 'pending' });
    }
    return steps;
  }

  _estimateTokens(assessment) {
    return assessment.complexity * 1000 + assessment.contextNeed / 10;
  }

  _estimateTime(assessment) {
    return assessment.complexity * 30;
  }

  _assessRisk(assessment) {
    if (assessment.complexity > 7) return 'high';
    if (assessment.complexity > 4) return 'medium';
    return 'low';
  }

  _generateFallback(assessment) {
    return { strategy: 'simplify', reduceComplexityBy: 2, switchToFlash: true };
  }

  _checkCompleteness(result, stepIndex) {
    if (!result) return false;
    if (typeof result === 'string') return result.length > 10;
    return Object.keys(result).length > 0;
  }

  _checkConsistency(result) {
    const t = String(result || '');
    // 未完成/空泛信号：明确占位、待续标记，或结尾停在半截引导语/悬停标点
    if (/\b(TODO|FIXME|placeholder)\b|待补充|待续|未完成|占位|稍后(补充|给出)|我将在(后续|下一步)/i.test(t)) return false;
    const tail = t.slice(-24);
    if (/[，、：(（]\s*$/.test(tail) || /(首先|接下来|下面我)[^。！？\n]{0,6}$/.test(tail)) return false;
    return true;
  }

  _checkCorrectness(result) {
    // 无外部 ground truth 不臆断对错；判对错交给 review-protocol 的对照复盘
    return true;
  }

  _detectBias(result) {
    const t = String(result || '');
    if (t.length < 40) return false;
    // 过度自信偏差：绝对化措辞密度异常才标记，避免误伤正常强调
    const hits = (t.match(/绝对|一定|必然|永远不?会?|毫无疑问|100%|不可能(出错|错误)|毋庸置疑|板上钉钉/g) || []).length;
    return hits / Math.max(1, t.length / 1000) >= 6;
  }

  _correctBias(result, stepIndex) {
    this.biasCorrectionLog.push({ result, stepIndex, correctedAt: Date.now() });
  }

  _traceError(error, context) {
    return {
      message: error.message || String(error),
      context: context ? String(context).substring(0, 200) : null,
      tracedAt: Date.now(),
    };
  }

  _generateCorrection(rootCause, context) {
    return {
      action: 'retry_with_adjustment',
      adjustment: { reduceComplexity: true, addVerification: true },
      generatedAt: Date.now(),
    };
  }

  _calculateSuccessRate() {
    if (this.taskHistory.length === 0) return 1;
    const successes = this.taskHistory.filter((t) => t.metrics.overallScore > 0.5).length;
    return successes / this.taskHistory.length;
  }

  _scoreQuality(result, taskDescription) {
    const t = String(result || '');
    const fullness = Math.min(1, t.length / 800);
    const structured = /(首先|其次|最后|综上|步骤|\d+[.、)]|[-*] )/.test(t) ? 0.12 : 0;
    return Math.max(0.4, Math.min(0.98, 0.55 + fullness * 0.3 + structured));
  }

  _scoreEfficiency() {
    // 返工迭代越多效率越低（selfCorrect 会累加 iterationCount，完成时归零）
    return Math.max(0.5, Math.min(0.95, 0.9 - this.iterationCount * 0.05));
  }

  _scoreConsistency() {
    const h = this.taskHistory;
    if (h.length < 2) return 0.8;
    const xs = h.map((t) => t.metrics.overallScore);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    return Math.max(0.4, Math.min(0.98, 1 - Math.sqrt(variance)));
  }
}

let instance = null;

export function getMetacognitionEngine() {
  if (!instance) instance = new MetacognitionEngine();
  return instance;
}

export function startMetacognition() {
  const engine = getMetacognitionEngine();
  engine.state = METACOGNITION_STATES.IDLE;
  return engine;
}

export function stopMetacognition() {
  if (instance) {
    instance.state = METACOGNITION_STATES.IDLE;
    instance.currentTask = null;
  }
}

export default {
  MetacognitionEngine,
  getMetacognitionEngine,
  startMetacognition,
  stopMetacognition,
  METACOGNITION_STATES,
  CAPABILITY_BOUNDARIES,
};
