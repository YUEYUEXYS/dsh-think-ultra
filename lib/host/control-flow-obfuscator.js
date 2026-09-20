// Think v0.11-RC2 - Control Flow Obfuscator
// 控制流平坦化、字符串/符号混淆、冗余分支嵌套、反调试挂载探测（逆向防护层）

const OBFUSCATION_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  EXTREME: 'extreme',
};

class ControlFlowObfuscator {
  constructor(options = {}) {
    this.level = options.level || OBFUSCATION_LEVELS.MEDIUM;
    this.stringMap = new Map();
    this.symbolMap = new Map();
    this.controlFlowNodes = new Map();
    // Opt-in only: shipped builds never run debugger probes on user machines.
    this.antiDebugEnabled = options.antiDebug === true;
    this.debugDetected = false;
    this.obfuscationCount = 0;
    this.isActive = false;
    this.redundancyFactor = options.redundancyFactor || 2;
  }

  activate() {
    if (this.isActive) return;
    this.isActive = true;
    if (this.antiDebugEnabled) {
      this._startAntiDebug();
    }
  }

  deactivate() {
    this.isActive = false;
    if (this.antiDebugTimer) { clearInterval(this.antiDebugTimer); this.antiDebugTimer = null; }
  }

  obfuscateString(str) {
    if (this.stringMap.has(str)) return this.stringMap.get(str);
    const encoded = this._encodeString(str);
    this.stringMap.set(str, encoded);
    this.obfuscationCount++;
    return encoded;
  }

  obfuscateSymbol(symbolName) {
    if (this.symbolMap.has(symbolName)) return this.symbolMap.get(symbolName);
    const obfuscated = this._generateSymbolName();
    this.symbolMap.set(symbolName, obfuscated);
    this.obfuscationCount++;
    return obfuscated;
  }

  flattenControlFlow(originalFn) {
    const nodeId = `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const flattened = this._createFlattenedFlow(originalFn, nodeId);
    this.controlFlowNodes.set(nodeId, flattened);
    this.obfuscationCount++;
    return flattened;
  }

  addRedundancy(code, factor = this.redundancyFactor) {
    let result = code;
    for (let i = 0; i < factor; i++) {
      result = this._insertRedundantBranch(result);
    }
    this.obfuscationCount++;
    return result;
  }

  isDebuggerAttached() {
    return this.debugDetected;
  }

  getObfuscationStats() {
    return {
      level: this.level,
      stringCount: this.stringMap.size,
      symbolCount: this.symbolMap.size,
      controlFlowNodes: this.controlFlowNodes.size,
      totalObfuscations: this.obfuscationCount,
      antiDebugEnabled: this.antiDebugEnabled,
      debugDetected: this.debugDetected,
      isActive: this.isActive,
    };
  }

  _encodeString(str) {
    const shift = this.level === OBFUSCATION_LEVELS.EXTREME ? 7 : 3;
    let encoded = '';
    for (let i = 0; i < str.length; i++) {
      encoded += String.fromCharCode(str.charCodeAt(i) + shift);
    }
    return `_s_${Buffer.from(encoded).toString('base64')}`;
  }

  _decodeString(encoded) {
    if (!encoded.startsWith('_s_')) return encoded;
    const b64 = encoded.substring(3);
    const decoded = Buffer.from(b64, 'base64').toString();
    const shift = this.level === OBFUSCATION_LEVELS.EXTREME ? 7 : 3;
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) - shift);
    }
    return result;
  }

  _generateSymbolName() {
    const prefix = this.level === OBFUSCATION_LEVELS.EXTREME ? '_x' : '_o';
    const random = Math.random().toString(36).substr(2, 8);
    return `${prefix}${random}`;
  }

  _createFlattenedFlow(fn, nodeId) {
    return {
      id: nodeId,
      original: fn.toString(),
      flattened: true,
      states: ['init', 'process', 'finalize', 'complete'],
      transitions: {
        init: ['process'],
        process: ['finalize', 'process'],
        finalize: ['complete'],
        complete: [],
      },
      createdAt: Date.now(),
    };
  }

  _insertRedundantBranch(code) {
    const redundant = `if (false) { ${code} } else { ${code} }`;
    return redundant;
  }

  _startAntiDebug() {
    if (this.antiDebugTimer) return; // 幂等：重复 activate 不再叠加 interval（防定时器泄漏累积）
    let last = Date.now();
    this.antiDebugTimer = setInterval(() => {
      if (!this.isActive) { last = Date.now(); return; }
      const now = Date.now();
      const gap = now - last; // 正常≈3000ms；被调试器断点挂起或事件循环冻结会远超周期
      last = now;
      if (gap > 10000) this.debugDetected = true;
    }, 3000);
    if (typeof this.antiDebugTimer.unref === 'function') this.antiDebugTimer.unref();
  }
}

let obfuscatorInstance = null;

export function getControlFlowObfuscator() {
  if (!obfuscatorInstance) obfuscatorInstance = new ControlFlowObfuscator();
  return obfuscatorInstance;
}

export function startAntiDebug(options = {}) {
  const obfuscator = getControlFlowObfuscator();
  if (options.level) obfuscator.level = options.level;
  obfuscator.activate();
  return obfuscator;
}

export function stopAntiDebug() {
  if (obfuscatorInstance) obfuscatorInstance.deactivate();
}

export default {
  ControlFlowObfuscator,
  getControlFlowObfuscator,
  startAntiDebug,
  stopAntiDebug,
  OBFUSCATION_LEVELS,
};
