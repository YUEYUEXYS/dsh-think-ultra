// Think v0.11-RC2 - Input Monitor
// 低资源占用精准触发逻辑、响应时延优化、弹窗触发规则、状态判断精度、内存占用裁剪

const INPUT_STATES = {
  IDLE: 'idle',
  TYPING: 'typing',
  PAUSED: 'paused',
  SUBMITTED: 'submitted',
};

const TRIGGER_RULES = {
  DEBOUNCE_MS: 300,
  MIN_LENGTH: 3,
  MAX_MEMORY_ENTRIES: 50,
  POLL_INTERVAL_MS: 100,
};

class InputMonitor {
  constructor(options = {}) {
    this.state = INPUT_STATES.IDLE;
    this.currentInput = '';
    this.lastInputTime = 0;
    this.inputHistory = [];
    this.triggerCallbacks = [];
    this.debounceTimer = null;
    this.pollTimer = null;
    this.isMonitoring = false;
    this.memoryUsage = { entries: 0, estimatedBytes: 0 };
    this.triggerRules = { ...TRIGGER_RULES, ...options };
    this.lastTriggerTime = 0;
    this.triggerCount = 0;
  }

  start() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this._startPolling();
  }

  stop() {
    this.isMonitoring = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  onTrigger(callback) {
    this.triggerCallbacks.push(callback);
    return () => {
      this.triggerCallbacks = this.triggerCallbacks.filter((cb) => cb !== callback);
    };
  }

  updateInput(value) {
    const now = Date.now();
    const previousLength = this.currentInput.length;
    this.currentInput = value;
    this.lastInputTime = now;
    if (value.length > previousLength) {
      this.state = INPUT_STATES.TYPING;
    } else if (value.length === 0) {
      this.state = INPUT_STATES.IDLE;
    }
    this._debounceTrigger();
    this._recordInput(value);
  }

  submit() {
    this.state = INPUT_STATES.SUBMITTED;
    this._fireTrigger('submit', { input: this.currentInput, length: this.currentInput.length });
    this.currentInput = '';
    setTimeout(() => { this.state = INPUT_STATES.IDLE; }, 100);
  }

  getState() {
    return {
      state: this.state,
      currentLength: this.currentInput.length,
      lastInputTime: this.lastInputTime,
      triggerCount: this.triggerCount,
      memoryUsage: { ...this.memoryUsage },
      isMonitoring: this.isMonitoring,
    };
  }

  shouldShowPopup() {
    if (this.currentInput.length < this.triggerRules.MIN_LENGTH) return false;
    if (this.state !== INPUT_STATES.PAUSED) return false;
    const timeSinceLastInput = Date.now() - this.lastInputTime;
    return timeSinceLastInput >= this.triggerRules.DEBOUNCE_MS;
  }

  _startPolling() {
    this.pollTimer = setInterval(() => {
      if (!this.isMonitoring) return;
      if (this.state === INPUT_STATES.TYPING) {
        const elapsed = Date.now() - this.lastInputTime;
        if (elapsed >= this.triggerRules.DEBOUNCE_MS) {
          this.state = INPUT_STATES.PAUSED;
          this._fireTrigger('pause', { input: this.currentInput, elapsed });
        }
      }
    }, this.triggerRules.POLL_INTERVAL_MS);
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
  }

  _debounceTrigger() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (this.currentInput.length >= this.triggerRules.MIN_LENGTH) {
        this.state = INPUT_STATES.PAUSED;
        this._fireTrigger('debounce', { input: this.currentInput });
      }
    }, this.triggerRules.DEBOUNCE_MS);
  }

  _fireTrigger(type, data) {
    const now = Date.now();
    const latency = now - this.lastInputTime;
    this.lastTriggerTime = now;
    this.triggerCount++;
    const event = { type, ...data, timestamp: now, latencyMs: latency };
    for (const callback of this.triggerCallbacks) {
      try { callback(event); } catch { /* contained */ }
    }
  }

  _recordInput(value) {
    const entry = { value: value.substring(0, 100), length: value.length, timestamp: Date.now() };
    this.inputHistory.push(entry);
    if (this.inputHistory.length > this.triggerRules.MAX_MEMORY_ENTRIES) {
      this.inputHistory.shift();
    }
    this._updateMemoryUsage();
  }

  _updateMemoryUsage() {
    this.memoryUsage.entries = this.inputHistory.length;
    this.memoryUsage.estimatedBytes = this.inputHistory.reduce((sum, e) => sum + e.value.length * 2 + 32, 0);
  }
}

let monitorInstance = null;

export function getInputMonitor() {
  if (!monitorInstance) monitorInstance = new InputMonitor();
  return monitorInstance;
}

export function startInputMonitor(options = {}) {
  const monitor = getInputMonitor();
  if (options.debounceMs) monitor.triggerRules.DEBOUNCE_MS = options.debounceMs;
  if (options.minLength) monitor.triggerRules.MIN_LENGTH = options.minLength;
  monitor.start();
  return monitor;
}

export function stopInputMonitor() {
  if (monitorInstance) monitorInstance.stop();
}

export default {
  InputMonitor,
  getInputMonitor,
  startInputMonitor,
  stopInputMonitor,
  INPUT_STATES,
  TRIGGER_RULES,
};
