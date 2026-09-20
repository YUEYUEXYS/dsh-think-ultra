// ultra-tool-factory.js — v0.1 正式版 · Ultra 工具统一工厂
// 作用：把一个工具「必须重复写对」的样板（超时/取消/异常收敛/进行态/完成态/并发安全/双语无关）
// 全部收敛到一处，新增工具只声明 name/参数/输出契约/核心 run，质量统一、绝不把异常抛进 agent loop。
import { defineTool } from '@deepseek-ai/dsh-tools';

const KIND_OK = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'fetch', 'other']);

/**
 * @param spec
 *  name, title(时间线标题), description(模型何时调用——决定 DeepSeek 是否稳定选用),
 *  parameters(ParameterSchemaSpec), outSchema(canonical 输出 JSON Schema),
 *  render(args,value)->ContentBlock[], run(args,exec)->Promise<canonical value>,
 *  kind(ToolCallKind，决定时间线小图标), callSummary(args)->一行参数摘要,
 *  timeoutMs(默认 20s), parallel(纯分析无副作用=true，允许 Flash 高并发扇出),
 *  degrade(err)->符合 outSchema 的安全降级对象（必须字段齐全）。
 */
export function defineUltraTool(spec) {
  const kind = KIND_OK.has(spec.kind) ? spec.kind : 'execute';
  const timeoutMs = Number.isFinite(spec.timeoutMs) ? spec.timeoutMs : 20000;

  const tool = {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters || {},
    output: {
      schema: spec.outSchema,
      render: (args, value) => {
        try { return spec.render ? spec.render(args, value) : [{ type: 'text', text: spec.title + '完成。' }]; }
        catch { return [{ type: 'text', text: spec.title + '完成。' }]; }
      },
    },
    timeoutMs,
    // 纯分析工具声明并发安全：Flash 多路扇出时可真并行（默认工具被当不可并行会被串行化）
    ...(spec.parallel ? { isConcurrencySafe: () => true } : {}),

    async execute(args, exec) {
      try {
        const v = await spec.run(args, exec);
        // 硬保护：run 绝不能返回 undefined/null 触发 output schema 校验失败
        return v == null ? (spec.degrade ? spec.degrade(new Error('empty-result')) : { ok: false }) : v;
      } catch (e) {
        // 任何异常收敛为结构化降级值，绝不抛进 agent loop（模型一遇到工具报错就不敢再用）
        try { if (typeof spec.degrade === 'function') return spec.degrade(e); } catch { /* fall through */ }
        return { ok: false, error: String((e && e.message) || e) };
      }
    },

    // 进行中行：图标按 kind 自动配（Harness 原生时间线，不按工具名写死）
    presentCall: (args) => {
      let raw = '';
      try { raw = spec.callSummary ? spec.callSummary(args) : ((args && (args.question || args.topic || args.text || args.goal)) || ''); } catch { raw = ''; }
      return { card: 'generic', title: spec.title, kind, rawInput: String(raw || '').slice(0, 240) };
    },

    // 完成态行：标题随成败切换，稳定不抛；content 交给 output.render 自动出
    presentResult: (_args, result) => {
      try {
        const failed = result && result.isError;
        return { card: 'generic', title: failed ? spec.title + ' · 已降级' : spec.title + ' · 完成', kind };
      } catch { return undefined; }
    },
  };
  return defineTool(tool);
}

// 通用输出 schema 片段，减少重复
export const OBJ = (properties, extra = {}) => ({ type: 'object', additionalProperties: false, properties, ...extra });
export const STR = (description, required) => ({ type: 'string', description, ...(required ? { required: true } : {}) });
export const INT = (description, required) => ({ type: 'integer', description, ...(required ? { required: true } : {}) });
export const BOOL = (description, required) => ({ type: 'boolean', description, ...(required ? { required: true } : {}) });
export const ARR_STR = (description, required) => ({ type: 'array', description, ...(required ? { required: true } : {}), items: { type: 'string' } });

// 统一补齐旧工具（不改其实现、零回归）：超时、完成态时间线、纯分析默认并发安全。
// 在注册前对每个工具过一遍，保证「时间线必有完成态 / 不会无限挂起 / Flash 可真并行扇出」。
export function normalizeTool(tool) {
  if (!tool || typeof tool !== 'object') return tool;
  if (!(tool.timeoutMs > 0)) tool.timeoutMs = 20000;
  if (typeof tool.presentResult !== 'function') {
    tool.presentResult = (args, result) => {
      try {
        let title = tool.name || 'Ultra 工具'; let kind = 'execute';
        if (typeof tool.presentCall === 'function') {
          const pc = tool.presentCall(args);
          if (pc) { title = pc.title || title; kind = pc.kind || kind; }
        }
        return { card: 'generic', title: title + ((result && result.isError) ? ' · 已降级' : ' · 完成'), kind };
      } catch { return undefined; }
    };
  }
  // Ultra 工具均为纯内部分析/推演，无外部副作用：未显式声明者默认允许并发（解开默认串行化）
  if (typeof tool.isConcurrencySafe !== 'function') tool.isConcurrencySafe = () => true;
  // execute 终极护盾（幂等）：参数校验失败/运行时异常一律收敛为 isError 结果，绝不抛进 agent loop。
  // 模型看到结构化错误会自行补参/改道，而不是因一次抛错就再也不敢调用该工具。
  if (typeof tool.execute === 'function' && !tool.__ultraExecGuarded) {
    const origExecute = tool.execute;
    tool.execute = async function guardedExecute(args, exec) {
      try {
        const v = await origExecute.call(this, args, exec);
        return v == null ? { isError: true, error: 'empty-result' } : v;
      } catch (e) {
        return { isError: true, error: String((e && e.message) || e) };
      }
    };
    tool.__ultraExecGuarded = true;
  }
  // render 终极护盾（幂等）：LLM 偶尔返回残缺 JSON 时，手写工具的 render 直接 .map 可能抛错，
  // 那会让对话时间线的完成卡片整个崩掉。统一兜底为安全文本块，保证任何结果都渲染得出。
  if (tool.output && typeof tool.output.render === 'function' && !tool.__ultraRenderGuarded) {
    const origRender = tool.output.render;
    tool.output.render = function guardedRender(args, value) {
      try {
        const blocks = origRender.call(this, args, value);
        return Array.isArray(blocks) && blocks.length ? blocks : [{ type: 'text', text: '结果已生成。' }];
      } catch {
        let summary = '';
        try { summary = String(value && (value.summary || value.conclusion || value.result) || '').slice(0, 600); } catch { summary = ''; }
        return [{ type: 'text', text: '（结果渲染已安全降级）' + (summary ? '\n' + summary : '') }];
      }
    };
    tool.__ultraRenderGuarded = true;
  }
  return tool;
}
