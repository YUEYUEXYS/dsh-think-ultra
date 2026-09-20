// authorize-gate.js — v0.1 · DeepSeek 调用授权门闩（概率触发，非必弹）。
//
// 行为契约（硬开关 authorizeCalls，默认关闭；概率 authorizeProbability ∈ [0,1]，默认 0.35）：
//   - 关闭：request() 永远立即放行，绝不弹窗、绝不阻塞（与无此模块完全一致）；
//   - 开启：每个“新用户轮”首次发起 DeepSeek 调用前掷一次骰：
//           命中概率（roll < probability）→ 发 authorize-request 事件并等待人工允许/拒绝；
//           未命中 → 本轮直接放行（标记本轮已决，不再重复掷骰）；
//     probability = 1 退化为“每轮必弹”，= 0 等同关闭。
//   - 允许 -> 本轮后续调用直接放行；拒绝/超时 -> {allowed:false}，调用方必须立即终止该轮。
// 纯逻辑、不直接碰 LLM/DOM；UI 经事件 + HTTP decide 驱动，便于单测。

export class AuthorizeGate {
  constructor(options = {}) {
    this._emit = typeof options.emit === 'function' ? options.emit : () => {};
    this._rng = typeof options.rng === 'function' ? options.rng : Math.random; // 可注入，便于单测
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000; // 无决定时安全拒绝
    this.enabled = false;
    this.probability = AuthorizeGate.clampProb(options.probability ?? 0.35);
    this.pending = new Map(); // reqId -> { resolve, timer, key }
    this.approvedKeys = new Set(); // 本轮已放行（人工允许 或 概率未命中）的会话/轮次 key
    this._seq = 0;
  }

  static clampProb(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return 0.35;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  isEnabled() { return this.enabled === true; }

  // 开关切换：关闭时立即释放所有等待中的请求为“放行”（关闭=直接调用语义，避免遗留挂起）
  setEnabled(v) {
    const next = v === true;
    const was = this.enabled;
    this.enabled = next;
    if (was && !next) this._drainAll(true, 'disabled');
    return this.enabled;
  }

  // 概率热更新（0 关 / 1 必弹）
  setProbability(p) { this.probability = AuthorizeGate.clampProb(p); return this.probability; }

  // 新用户轮：清除该 key 的已决标记，使下一条消息重新掷骰/请求授权
  beginTurn(key) { if (key != null) this.approvedKeys.delete(String(key)); }

  // 前端决定回执；返回是否命中一个等待中的请求
  decide(reqId, allowed) {
    const p = this.pending.get(reqId);
    if (!p) return false;
    this.pending.delete(reqId);
    clearTimeout(p.timer);
    const ok = allowed === true;
    if (ok && p.key != null) this.approvedKeys.add(String(p.key));
    p.resolve({ allowed: ok, reqId, reason: ok ? 'approved' : 'denied' });
    return true;
  }

  _drainAll(allowed, reason) {
    for (const [id, p] of Array.from(this.pending.entries())) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      if (allowed && p.key != null) this.approvedKeys.add(String(p.key));
      p.resolve({ allowed, reqId: id, reason });
    }
  }

  // 调用前闸门：关闭/本轮已决 -> 立即放行；否则按概率决定是弹窗等待还是直接放行
  request(key, meta = {}) {
    if (!this.enabled) return Promise.resolve({ allowed: true, reason: 'disabled-pass' });
    const k = String(key == null ? '_' : key);
    if (this.approvedKeys.has(k)) return Promise.resolve({ allowed: true, reason: 'already-approved' });
    // —— 概率门：开启 Ultra 后只有命中概率才真正弹窗，未命中本轮直接放行 ——
    let roll = 0.5;
    try { roll = Number(this._rng()); } catch { roll = 0.5; }
    if (!Number.isFinite(roll)) roll = 0.5;
    if (!(roll < this.probability)) {
      this.approvedKeys.add(k); // 本轮不再重复掷骰
      return Promise.resolve({ allowed: true, reason: 'probability-pass', roll });
    }
    const id = 'ar' + (++this._seq) + '-' + Date.now().toString(36);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        resolve({ allowed: false, reqId: id, reason: 'timeout' }); // 超时安全拒绝，绝不擅自调用
      }, this.timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      this.pending.set(id, { resolve, timer, key: k });
      let preview = '';
      try { preview = String(meta.preview == null ? '' : meta.preview).slice(0, 200); } catch { preview = ''; }
      try { this._emit({ type: 'authorize-request', reqId: id, sessionKey: k, preview, probability: this.probability, roll, at: Date.now() }); } catch { /* contained */ }
    });
  }

  pendingCount() { return this.pending.size; }
}

export default { AuthorizeGate };
