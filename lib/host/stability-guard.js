// Think v0.11-RC2 - Stability Guard
// 多环境适配、异常边界场景处理、边界条件校验、崩溃率压制、数据一致性保障

const STABILITY_LEVELS = {
  STABLE: 'stable',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
};

const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
};

class StabilityGuard {
  constructor(options = {}) {
    this.environment = options.environment || ENVIRONMENTS.DEVELOPMENT;
    this.stabilityLevel = STABILITY_LEVELS.STABLE;
    this.crashCount = 0;
    this.crashHistory = [];
    this.boundaryChecks = new Map();
    this.consistencyChecks = new Map();
    this.errorRate = 0;
    this.errorWindow = [];
    this.maxErrorWindow = 100;
    this.crashRateThreshold = options.crashRateThreshold || 0.1;
    this.isRunning = false;
    this.adaptationRules = [];
    this.dataVersion = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._detectEnvironment();
    this._applyEnvironmentAdaptation();
  }

  stop() {
    this.isRunning = false;
  }

  registerBoundaryCheck(name, checkFn) {
    this.boundaryChecks.set(name, checkFn);
  }

  registerConsistencyCheck(name, checkFn) {
    this.consistencyChecks.set(name, checkFn);
  }

  validateBoundary(name, value) {
    const checkFn = this.boundaryChecks.get(name);
    if (!checkFn) return { valid: true, skipped: true };
    try {
      const result = checkFn(value);
      return { valid: result === true, value: result };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  validateAllBoundaries(values = {}) {
    const results = {};
    let allValid = true;
    for (const [name, checkFn] of this.boundaryChecks.entries()) {
      const result = this.validateBoundary(name, values[name]);
      results[name] = result;
      if (!result.valid) allValid = false;
    }
    return { allValid, results };
  }

  checkDataConsistency() {
    const results = {};
    let consistent = true;
    for (const [name, checkFn] of this.consistencyChecks.entries()) {
      try {
        const result = checkFn();
        results[name] = { consistent: result === true };
        if (result !== true) consistent = false;
      } catch (error) {
        results[name] = { consistent: false, error: error.message };
        consistent = false;
      }
    }
    return { consistent, results, version: this.dataVersion };
  }

  recordCrash(error, context = {}) {
    this.crashCount++;
    const crashEntry = {
      error: error.message || String(error),
      stack: error.stack || null,
      context,
      timestamp: Date.now(),
      environment: this.environment,
    };
    this.crashHistory.push(crashEntry);
    if (this.crashHistory.length > 50) this.crashHistory.shift();
    this.errorWindow.push(Date.now());
    if (this.errorWindow.length > this.maxErrorWindow) this.errorWindow.shift();
    this._updateErrorRate();
    if (this.errorRate > this.crashRateThreshold) {
      this.stabilityLevel = STABILITY_LEVELS.CRITICAL;
    } else if (this.crashCount > 5) {
      this.stabilityLevel = STABILITY_LEVELS.DEGRADED;
    }
    return crashEntry;
  }

  recordError(error) {
    this.errorWindow.push(Date.now());
    if (this.errorWindow.length > this.maxErrorWindow) this.errorWindow.shift();
    this._updateErrorRate();
  }

  getStabilityStatus() {
    return {
      environment: this.environment,
      stabilityLevel: this.stabilityLevel,
      crashCount: this.crashCount,
      errorRate: this.errorRate,
      recentCrashes: this.crashHistory.slice(-5).reverse(),
      boundaryChecks: this.boundaryChecks.size,
      consistencyChecks: this.consistencyChecks.size,
      dataVersion: this.dataVersion,
      isRunning: this.isRunning,
    };
  }

  suppressCrash(fn, fallback = null) {
    try {
      return fn();
    } catch (error) {
      this.recordCrash(error, { suppressed: true });
      return fallback;
    }
  }

  async suppressCrashAsync(fn, fallback = null) {
    try {
      return await fn();
    } catch (error) {
      this.recordCrash(error, { suppressed: true, async: true });
      return fallback;
    }
  }

  _detectEnvironment() {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV) {
        this.environment = process.env.NODE_ENV;
      }
    }
  }

  _applyEnvironmentAdaptation() {
    switch (this.environment) {
      case ENVIRONMENTS.PRODUCTION:
        this.crashRateThreshold = 0.05;
        break;
      case ENVIRONMENTS.STAGING:
        this.crashRateThreshold = 0.1;
        break;
      case ENVIRONMENTS.DEVELOPMENT:
        this.crashRateThreshold = 0.2;
        break;
    }
  }

  _updateErrorRate() {
    const now = Date.now();
    const windowMs = 60000;
    const recent = this.errorWindow.filter((t) => now - t < windowMs);
    this.errorRate = recent.length / this.maxErrorWindow;
  }
}

let guardInstance = null;

export function getStabilityGuard() {
  if (!guardInstance) guardInstance = new StabilityGuard();
  return guardInstance;
}

export function startStabilityGuard(options = {}) {
  const guard = getStabilityGuard();
  if (options.environment) guard.environment = options.environment;
  guard.start();
  return guard;
}

export function stopStabilityGuard() {
  if (guardInstance) guardInstance.stop();
}

export function registerBoundaryCheck(name, checkFn) {
  return getStabilityGuard().registerBoundaryCheck(name, checkFn);
}

export default {
  StabilityGuard,
  getStabilityGuard,
  startStabilityGuard,
  stopStabilityGuard,
  registerBoundaryCheck,
  STABILITY_LEVELS,
  ENVIRONMENTS,
};
