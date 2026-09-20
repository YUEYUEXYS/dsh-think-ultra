// tool-fuse.js — v0.1 大换血 · 外露工具链三层熔断（纯逻辑、零依赖、可单测）。
//
// 三层熔断（缺一不可，触顶立即终止工具链并让模型基于现有结果输出阶段总结，绝不无限递归卡死）：
//   1) 最大连续调用轮次 maxRounds —— 防止工具 A 的结果又触发 B、B 再触发 A 的无限工具链；
//   2) 单工具超时 perCallMs   —— 由 ultra-tool-factory 的 timeoutMs + execute 护盾承担，这里只做计数配合；
//   3) 总 token 预算 totalTokenBudget —— 累计输入/输出粗估 token，超顶即停，避免烧钱失控。
// 每个会话 agent 独立一个 fuse，新 turn 由 syncer 调 reset()；任何异常都 fail-safe（不阻断正常对话）。

const ROUND_LIMITS_VELOCITY = [4, 6, 8, 10, 14];   // 迅流：工具极度克制（toolAggro 0..4）
const ROUND_LIMITS_APEX = [6, 9, 12, 16, 24];       // 极境：随激进度放开，但仍有硬顶
const TOKEN_BUDGET = { t1: 12000, t2: 24000, t4: 48000, max: 96000 };
const IDLE_RESET_MS = 120000; // 距上次工具调用超过 2 分钟即视为新任务，工具链计数自动复位

export function roundLimitFor(mode, toolAggro) {
  const a = Math.max(0, Math.min(4, Math.round(Number(toolAggro) || 0)));
  const table = mode === 'apex' ? ROUND_LIMITS_APEX : ROUND_LIMITS_VELOCITY;
  return table[a];
}
export function tokenBudgetFor(tokenTier) {
  return TOKEN_BUDGET[tokenTier] || TOKEN_BUDGET.t1;
}

// 中英混合保守估算：约 3.2 字符 / token，向上取整；只用于熔断，不做计费口径。
function estimateTokens(s) {
  const len = String(s == null ? '' : s).length;
  return len <= 0 ? 0 : Math.ceil(len / 3.2);
}

export class ToolChainFuse {
  constructor(options = {}) {
    this.maxRounds = Number.isFinite(options.maxRounds) ? options.maxRounds : 8;
    this.totalTokenBudget = Number.isFinite(options.totalTokenBudget) ? options.totalTokenBudget : 24000;
    this.rounds = 0;
    this.tokens = 0;
    this.tripped = null; // null | { reason:'max-rounds'|'token-budget', limit }
    this.lastAt = 0; // 上次工具调用时间戳：跨任务空闲超过阈值自动视为新工具链
  }

  // 新对话轮次复位（同一会话内允许下一条消息重新使用工具链）
  reset() { this.rounds = 0; this.tokens = 0; this.tripped = null; }

  // 按当前 oc 配置动态调整硬顶（拖点位即时生效，不中断已累计计数，除非新上限更小且已超）
  reconfigure({ mode, toolAggro, tokenTier } = {}) {
    if (mode || toolAggro !== undefined) this.maxRounds = roundLimitFor(mode, toolAggro);
    if (tokenTier) this.totalTokenBudget = tokenBudgetFor(tokenTier);
    if (!this.tripped) return;
    if (this.tripped.reason === 'max-rounds' && this.rounds <= this.maxRounds) this.tripped = null;
    if (this.tripped.reason === 'token-budget' && this.tokens <= this.totalTokenBudget) this.tripped = null;
  }

  // 工具调用前闸门：返回 {tripped:true} 时调用方必须直接回阶段总结、不得执行该工具。
  before(args) {
    const now = Date.now();
    if (this.lastAt && now - this.lastAt > IDLE_RESET_MS) this.reset(); // 跨任务空闲：自动开始一条新工具链
    this.lastAt = now;
    if (this.tripped) return { tripped: true, ...this.tripped };
    this.rounds += 1;
    if (this.rounds > this.maxRounds) {
      this.tripped = { reason: 'max-rounds', limit: this.maxRounds };
      return { tripped: true, ...this.tripped };
    }
    const inTok = estimateTokens((() => { try { return JSON.stringify(args == null ? {} : args); } catch { return ''; } })());
    if (this.tokens + inTok > this.totalTokenBudget) {
      this.tripped = { reason: 'token-budget', limit: this.totalTokenBudget };
      return { tripped: true, ...this.tripped };
    }
    this.tokens += inTok;
    return { tripped: false };
  }

  // 工具返回后累计输出 token（失败也计入，防止用报错空转绕过预算）
  chargeResult(result) {
    let s;
    try { s = typeof result === 'string' ? result : JSON.stringify(result == null ? {} : result); } catch { s = ''; }
    this.tokens += estimateTokens(s);
  }

  stageSummary() {
    if (this.tripped && this.tripped.reason === 'max-rounds') {
      return '工具链已达连续调用上限 ' + this.maxRounds + ' 轮：立即停止再调用任何工具，基于已经获得的结果直接输出阶段总结与最终结论。';
    }
    return '工具链已达总 token 预算 ' + this.totalTokenBudget + '：立即停止再调用任何工具，基于现有结果给出结论并标注尚未覆盖的部分。';
  }

  // 包一层工具：不改原对象；熔断触发时返回结构化 isError（会被上层 execute 护盾收敛，绝不抛进 agent loop）。
  wrap(tool) {
    if (!tool || typeof tool.execute !== 'function') return tool;
    const fuse = this;
    const orig = tool.execute;
    const wrapped = Object.assign({}, tool, {
      async execute(args, exec) {
        const gate = fuse.before(args);
        if (gate.tripped) {
          return { isError: true, stopped: true, reason: gate.reason, message: fuse.stageSummary() };
        }
        let result;
        try { result = await orig.call(this, args, exec); } catch (e) { fuse.chargeResult(String(e && e.message || e)); throw e; }
        try { fuse.chargeResult(result); } catch { /* contained */ }
        return result;
      },
    });
    wrapped.__ultraFuseGuarded = true;
    return wrapped;
  }
}

export default { ToolChainFuse, roundLimitFor, tokenBudgetFor, estimateTokens };
