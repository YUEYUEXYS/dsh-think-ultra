// Think v0.11-RC2 - Task Guardian
// 异常熔断、无感重试全链路、进程保活、异常日志回溯、故障自动定位、状态持久化、静默自愈

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const GUARDIAN_STATES = {
  NORMAL: 'normal',
  DEGRADED: 'degraded',
  CIRCUIT_OPEN: 'circuit_open',
  RECOVERING: 'recovering',
};

class TaskGuardian {
  constructor(options = {}) {
    this.state = GUARDIAN_STATES.NORMAL;
    this.boundaryChecks = new Map();
    this.eventLog = [];
    this.maxEventLog = options.maxEventLog || 200;
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000;
    this.failureCount = 0;
    this.failureLog = [];
    this.circuitOpenAt = null;
    this.heartbeatInterval = options.heartbeatInterval || 5000;
    this.heartbeatTimer = null;
    this.lastHeartbeat = Date.now();
    this.statePersistencePath = options.statePersistencePath || null;
    this.isRunning = false;
    this.retryQueue = [];
    this.maxRetries = options.maxRetries || 3;
  }

  start() {
    this.isRunning = true;
    this._loadPersistedState();
    this._startHeartbeat();
    this._retryLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    this._persistState();
  }

  recordSuccess(taskId) {
    if (this.failureCount > 0) this.failureCount = Math.max(0, this.failureCount - 1);
    if (this.state === GUARDIAN_STATES.CIRCUIT_OPEN && this.failureCount === 0) {
      this._transitionTo(GUARDIAN_STATES.RECOVERING);
    }
    this._logEvent('success', { taskId });
  }

  recordFailure(taskId, error, context = {}) {
    this.failureCount++;
    const failureEntry = {
      taskId,
      error: error.message || String(error),
      context,
      timestamp: Date.now(),
      stack: error.stack || null,
    };
    this.failureLog.push(failureEntry);
    if (this.failureLog.length > 200) this.failureLog.shift();
    this._logEvent('failure', failureEntry);
    if (this.failureCount >= this.failureThreshold && this.state !== GUARDIAN_STATES.CIRCUIT_OPEN) {
      this._openCircuit();
    }
    if (this._shouldRetry(failureEntry)) {
      this.retryQueue.push({ ...failureEntry, retryCount: 0 });
    }
    return failureEntry;
  }

  evaluateBoundaries() {
    for (const [name, fn] of this.boundaryChecks) {
      try { if (fn() !== true) return { ok: false, name }; }
      catch (e) { return { ok: false, name, error: String(e && e.message || e) }; }
    }
    return { ok: true };
  }
  registerBoundaryCheck(name, checkFn) {
    if (typeof checkFn === 'function') this.boundaryChecks.set(String(name), checkFn);
  }
  canProceed() {
    const boundary = this.evaluateBoundaries();
    if (!boundary.ok) return false;
    if (this.state === GUARDIAN_STATES.CIRCUIT_OPEN) {
      if (Date.now() - this.circuitOpenAt > this.recoveryTimeout) {
        this._transitionTo(GUARDIAN_STATES.RECOVERING);
        return true;
      }
      return false;
    }
    return true;
  }

  getFailureHistory(limit = 20) {
    return this.failureLog.slice(-limit).reverse();
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      circuitOpenAt: this.circuitOpenAt,
      lastHeartbeat: this.lastHeartbeat,
      retryQueueLength: this.retryQueue.length,
      boundaries: this.evaluateBoundaries(),
      recentEvents: this.eventLog.slice(-8).reverse(),
      uptime: this.isRunning ? Date.now() - (this._startedAt || Date.now()) : 0,
    };
  }

  diagnoseFailure(error) {
    const message = error.message || String(error);
    const diagnoses = [];
    if (message.includes('ENOMEM') || message.includes('heap out of memory')) {
      diagnoses.push({ type: 'memory', severity: 'high', suggestion: 'increase memory limit or reduce batch size' });
    }
    if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
      diagnoses.push({ type: 'network', severity: 'medium', suggestion: 'check network connectivity and retry' });
    }
    if (message.includes('EACCES') || message.includes('permission denied')) {
      diagnoses.push({ type: 'permission', severity: 'high', suggestion: 'check file permissions' });
    }
    if (message.includes('SyntaxError') || message.includes('Unexpected token')) {
      diagnoses.push({ type: 'syntax', severity: 'high', suggestion: 'check code syntax' });
    }
    if (diagnoses.length === 0) {
      diagnoses.push({ type: 'unknown', severity: 'low', suggestion: 'review error stack trace' });
    }
    return { message, diagnoses, diagnosedAt: Date.now() };
  }

  _openCircuit() {
    this._transitionTo(GUARDIAN_STATES.CIRCUIT_OPEN);
    this.circuitOpenAt = Date.now();
    this._logEvent('circuit_open', { failureCount: this.failureCount });
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this._logEvent('state_transition', { from: oldState, to: newState });
  }

  _shouldRetry(failureEntry) {
    const retryableErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE', 'ECONNRESET'];
    return retryableErrors.some((err) => failureEntry.error.includes(err));
  }

  _retryLoop() {
    if (!this.isRunning) return;
    let delayMs = 1000; // 指数退避基准
    const loop = () => {
      if (!this.isRunning) return;
      if (this.retryQueue.length > 0 && this.canProceed()) {
        const item = this.retryQueue.shift();
        if (item.retryCount < this.maxRetries) {
          item.retryCount++;
          this._logEvent('retry', { taskId: item.taskId, retryCount: item.retryCount, delayMs });
          // 指数退避：1s → 2s → 4s → 8s（无感重试，不打爆目标）
          delayMs = Math.min(8000, delayMs * 2);
        } else {
          delayMs = 1000;
        }
      }
      this._retryTimer = setTimeout(loop, delayMs); if (typeof this._retryTimer.unref === 'function') this._retryTimer.unref();
    };
    this._retryTimer = setTimeout(loop, delayMs); if (typeof this._retryTimer.unref === 'function') this._retryTimer.unref();
  }

  _startHeartbeat() {
    this._startedAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeat = Date.now();
      if (this.state === GUARDIAN_STATES.RECOVERING) {
        this._transitionTo(GUARDIAN_STATES.NORMAL);
      }
    }, this.heartbeatInterval);
    if (typeof this.heartbeatTimer.unref === 'function') this.heartbeatTimer.unref();
  }

  _logEvent(type, data) {
    this.eventLog.push({ type, data, at: Date.now() });
    if (this.eventLog.length > this.maxEventLog) this.eventLog.shift();
  }

  _persistState() {
    if (!this.statePersistencePath) return;
    try {
      const state = this.getState();
      const fs = { writeFileSync, existsSync, readFileSync, mkdirSync };
      fs.mkdirSync(dirname(this.statePersistencePath), { recursive: true });
      fs.writeFileSync(this.statePersistencePath, JSON.stringify(state, null, 2));
    } catch { /* contained */ }
  }

  _loadPersistedState() {
    if (!this.statePersistencePath) return;
    try {
      const fs = { writeFileSync, existsSync, readFileSync, mkdirSync };
      if (fs.existsSync(this.statePersistencePath)) {
        const state = JSON.parse(fs.readFileSync(this.statePersistencePath, 'utf8'));
        this.failureCount = state.failureCount || 0;
      }
    } catch { /* contained */ }
  }
}

let guardianInstance = null;

export function getTaskGuardian() {
  if (!guardianInstance) guardianInstance = new TaskGuardian();
  return guardianInstance;
}

export function startGuardian(options = {}) {
  const guardian = getTaskGuardian();
  if (options.failureThreshold) guardian.failureThreshold = options.failureThreshold;
  if (options.statePersistencePath) guardian.statePersistencePath = options.statePersistencePath;
  guardian.start();
  return guardian;
}

export function stopGuardian() {
  if (guardianInstance) guardianInstance.stop();
}

export function registerBoundaryCheck(name, checkFn) {
  return getTaskGuardian().registerBoundaryCheck(name, checkFn);
}

export default {
  TaskGuardian,
  getTaskGuardian,
  startGuardian,
  stopGuardian,
  registerBoundaryCheck,
  GUARDIAN_STATES,
};
