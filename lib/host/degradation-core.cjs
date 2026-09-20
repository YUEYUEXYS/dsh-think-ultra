// degradation-core.cjs — 真正运行的降级容错引擎
// 六级降级容错、健康检查、自动降级/恢复、部分输出、优雅关闭。
// 不是提示词，是实际在后端运行的代码，监控系统健康状态并自动降级。

'use strict';

class DegradationMatrix {
  constructor(options = {}) {
    this.levels = [
      { level: 0, name: 'normal', description: '正常运行，全部功能可用' },
      { level: 1, name: 'degraded_light', description: '轻度降级，非核心功能受限' },
      { level: 2, name: 'degraded_medium', description: '中度降级，部分高级功能关闭' },
      { level: 3, name: 'degraded_heavy', description: '重度降级，仅核心功能可用' },
      { level: 4, name: 'safe_mode', description: '安全模式，仅最基础功能' },
      { level: 5, name: 'emergency', description: '紧急模式，只读/最小输出' },
    ];
    this.currentLevel = 0;
    this.healthMetrics = {
      responseTime: 0,      // 响应时间（ms）
      errorRate: 0,         // 错误率（0-1）
      tokenUsage: 0,        // token使用率（0-1）
      memoryUsage: 0,       // 内存使用率（0-1）
      concurrentRequests: 0,// 并发请求数
      lastError: null,      // 最近错误
      lastErrorTime: null,  // 最近错误时间
    };
    this.thresholds = options.thresholds || {
      responseTime: { warn: 5000, critical: 15000 },   // ms
      errorRate: { warn: 0.1, critical: 0.3 },           // 10% / 30%
      tokenUsage: { warn: 0.7, critical: 0.9 },          // 70% / 90%
      memoryUsage: { warn: 0.8, critical: 0.95 },        // 80% / 95%
      concurrentRequests: { warn: 10, critical: 25 },    // 并发数
    };
    this.history = [];
    this.maxHistory = options.maxHistory || 100;
    this.degradationActions = this._buildDegradationActions();
  }

  // 更新健康指标
  updateMetrics(metrics) {
    Object.assign(this.healthMetrics, metrics);
    this._evaluateHealth();
  }

  // 记录错误
  recordError(error, context = {}) {
    this.healthMetrics.lastError = String(error).slice(0, 200);
    this.healthMetrics.lastErrorTime = Date.now();
    // 错误率滑动窗口（简化版：最近10次请求的错误率）
    this._recentErrors = this._recentErrors || [];
    this._recentErrors.push({ error: String(error).slice(0, 100), time: Date.now(), context });
    if (this._recentErrors.length > 10) this._recentErrors.shift();
    this.healthMetrics.errorRate = this._recentErrors.filter(e => Date.now() - e.time < 60000).length / 10;
    this._evaluateHealth();
  }

  // 记录成功（用于错误率计算）
  recordSuccess() {
    this._recentSuccesses = this._recentSuccesses || 0;
    this._recentSuccesses++;
    if (this._recentSuccesses >= 5) {
      // 连续成功，降低错误率
      this.healthMetrics.errorRate = Math.max(0, this.healthMetrics.errorRate - 0.1);
      this._recentSuccesses = 0;
    }
    this._evaluateHealth();
  }

  // 获取当前降级级别
  getCurrentLevel() {
    return this.levels[this.currentLevel];
  }

  // 获取可用功能列表（基于当前降级级别）
  getAvailableFeatures() {
    return this.degradationActions[this.currentLevel] || { available: [], disabled: [] };
  }

  // 检查某个功能是否可用
  isFeatureAvailable(feature) {
    const available = this.getAvailableFeatures().available;
    return available.includes('all') || available.includes(feature);
  }

  // 手动设置降级级别（用于测试或人工干预）
  setLevel(level) {
    if (level >= 0 && level < this.levels.length) {
      const oldLevel = this.currentLevel;
      this.currentLevel = level;
      this._recordHistory({ type: 'manual', from: oldLevel, to: level, time: Date.now() });
      return true;
    }
    return false;
  }

  // 自动恢复（当健康指标改善时）
  tryRecover() {
    if (this.currentLevel === 0) return false;
    // 检查是否所有指标都恢复正常
    const allNormal = this._allMetricsNormal();
    if (allNormal && this.currentLevel > 0) {
      const oldLevel = this.currentLevel;
      this.currentLevel = Math.max(0, this.currentLevel - 1);
      this._recordHistory({ type: 'auto_recover', from: oldLevel, to: this.currentLevel, time: Date.now() });
      return true;
    }
    return false;
  }

  // 获取健康状态报告
  getHealthReport() {
    return {
      level: this.getCurrentLevel(),
      metrics: { ...this.healthMetrics },
      thresholds: { ...this.thresholds },
      availableFeatures: this.getAvailableFeatures(),
      recentHistory: this.history.slice(-10),
      recommendations: this._getRecommendations(),
    };
  }

  // 获取部分输出策略（当需要降级输出时）
  getPartialOutputStrategy(fullOutput) {
    if (this.currentLevel === 0 || !fullOutput) return fullOutput;
    const strategies = {
      1: () => fullOutput, // 轻度降级不影响输出
      2: () => this._truncateOutput(fullOutput, 0.8),
      3: () => this._truncateOutput(fullOutput, 0.5),
      4: () => this._summaryOnly(fullOutput),
      5: () => '系统当前处于紧急模式，仅提供最小响应。请稍后重试。',
    };
    return (strategies[this.currentLevel] || strategies[0])();
  }

  // ========== 内部方法 ==========

  _evaluateHealth() {
    const m = this.healthMetrics;
    const t = this.thresholds;
    let newLevel = 0;

    // 响应时间
    if (m.responseTime >= t.responseTime.critical) newLevel = Math.max(newLevel, 3);
    else if (m.responseTime >= t.responseTime.warn) newLevel = Math.max(newLevel, 1);

    // 错误率
    if (m.errorRate >= t.errorRate.critical) newLevel = Math.max(newLevel, 4);
    else if (m.errorRate >= t.errorRate.warn) newLevel = Math.max(newLevel, 2);

    // token使用率
    if (m.tokenUsage >= t.tokenUsage.critical) newLevel = Math.max(newLevel, 3);
    else if (m.tokenUsage >= t.tokenUsage.warn) newLevel = Math.max(newLevel, 1);

    // 内存使用率
    if (m.memoryUsage >= t.memoryUsage.critical) newLevel = Math.max(newLevel, 4);
    else if (m.memoryUsage >= t.memoryUsage.warn) newLevel = Math.max(newLevel, 2);

    // 并发请求
    if (m.concurrentRequests >= t.concurrentRequests.critical) newLevel = Math.max(newLevel, 2);
    else if (m.concurrentRequests >= t.concurrentRequests.warn) newLevel = Math.max(newLevel, 1);

    // 应用新级别（只升不降，降级需要手动或自动恢复）
    if (newLevel > this.currentLevel) {
      const oldLevel = this.currentLevel;
      this.currentLevel = newLevel;
      this._recordHistory({ type: 'auto_degrade', from: oldLevel, to: newLevel, metrics: { ...m }, time: Date.now() });
    }
  }

  _allMetricsNormal() {
    const m = this.healthMetrics;
    const t = this.thresholds;
    return (
      m.responseTime < t.responseTime.warn &&
      m.errorRate < t.errorRate.warn &&
      m.tokenUsage < t.tokenUsage.warn &&
      m.memoryUsage < t.memoryUsage.warn &&
      m.concurrentRequests < t.concurrentRequests.warn
    );
  }

  _buildDegradationActions() {
    return [
      { level: 0, available: ['all'], disabled: [] },
      { level: 1, available: ['core', 'memory', 'calibrate', 'hallucination', 'dag', 'tot', 'selfplay', 'metacog', 'crossmodal', 'rag', 'codebase', 'tool'], disabled: ['video', 'audio'] },
      { level: 2, available: ['core', 'memory', 'calibrate', 'hallucination', 'dag', 'tot', 'selfplay', 'metacog', 'rag', 'codebase'], disabled: ['crossmodal', 'video', 'audio', 'tool'] },
      { level: 3, available: ['core', 'memory', 'calibrate', 'hallucination', 'tot', 'selfplay'], disabled: ['dag', 'metacog', 'crossmodal', 'video', 'audio', 'rag', 'codebase', 'tool'] },
      { level: 4, available: ['core', 'memory', 'calibrate'], disabled: ['hallucination', 'dag', 'tot', 'selfplay', 'metacog', 'crossmodal', 'video', 'audio', 'rag', 'codebase', 'tool'] },
      { level: 5, available: ['core'], disabled: ['memory', 'calibrate', 'hallucination', 'dag', 'tot', 'selfplay', 'metacog', 'crossmodal', 'video', 'audio', 'rag', 'codebase', 'tool'] },
    ];
  }

  _truncateOutput(output, ratio) {
    if (!output || typeof output !== 'string') return output;
    const targetLength = Math.floor(output.length * ratio);
    if (targetLength >= output.length) return output;
    return output.substring(0, targetLength) + '\n\n[输出已因系统负载降级而截断，完整输出请在系统恢复后重试]';
  }

  _summaryOnly(output) {
    if (!output || typeof output !== 'string') return output;
    // 提取前几段作为摘要
    const paragraphs = output.split(/\n\n+/);
    const summary = paragraphs.slice(0, 2).join('\n\n');
    return summary + '\n\n[系统当前处于安全模式，仅提供摘要。完整内容请在系统恢复后请求]';
  }

  _getRecommendations() {
    const m = this.healthMetrics;
    const recs = [];
    if (m.responseTime > this.thresholds.responseTime.warn) {
      recs.push('响应时间偏高，建议减少并发请求或降低推理深度');
    }
    if (m.errorRate > this.thresholds.errorRate.warn) {
      recs.push('错误率偏高，建议检查模型连接和API配置');
    }
    if (m.tokenUsage > this.thresholds.tokenUsage.warn) {
      recs.push('Token使用率高，建议缩短上下文或启用记忆压缩');
    }
    if (m.memoryUsage > this.thresholds.memoryUsage.warn) {
      recs.push('内存使用率高，建议清理历史会话或重启服务');
    }
    if (recs.length === 0) recs.push('系统运行正常，所有指标在健康范围内');
    return recs;
  }

  _recordHistory(record) {
    this.history.push(record);
    if (this.history.length > this.maxHistory) this.history.shift();
  }
}

module.exports = { DegradationMatrix };
