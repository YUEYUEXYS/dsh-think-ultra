// ultra-tool-adapter.js — 老一代工具箱（code/doc/data/learning/productivity，共 30 工具）兼容层
//
// 背景：@deepseek-ai/dsh-tools 的官方 defineTool 强制要求
//   ① 输入字段名必须是 parameters（老工具写的是 schema）；
//   ② 必须声明 output: { schema, render }，否则注册阶段直接抛 TypeError。
// 老工具统一用 schema 描述输入、且没有 output。为零侵入恢复这 30 个工具，这里导出一个
// 同名 defineTool：把 schema 透明映射为 parameters，并补一个「宽松 object 输出契约 + 安全文本渲染」，
// 再委托给官方 defineTool。这样老工具内部一行都不用改。
import { defineTool as officialDefineTool } from '@deepseek-ai/dsh-tools';

// 结果里优先作为人类可读正文展示的字段（按优先级）；这些老工具普遍把 LLM 原文放在 raw。
const PREFERRED_TEXT_FIELDS = [
  'raw', 'report', 'summary', 'conclusion', 'result', 'text',
  'analysis', 'review', 'architecture', 'diagnosis', 'optimization', 'plan', 'answer',
];

function renderGeneric(_args, v) {
  try {
    let text = '';
    if (v && typeof v === 'object') {
      for (const k of PREFERRED_TEXT_FIELDS) {
        if (typeof v[k] === 'string' && v[k].trim()) { text = v[k]; break; }
      }
      if (!text) {
        // 没有现成正文字段：把结构化结果漂亮打印（去掉噪音字段）
        const clone = {};
        for (const [k, val] of Object.entries(v)) {
          if (k === 'ok') continue;
          clone[k] = val;
        }
        text = Object.keys(clone).length ? JSON.stringify(clone, null, 2) : '结果已生成。';
      }
      if (v.ok === false) text = '本次分析未能完成：' + (v.error || '内部通道暂不可用') + '\n\n' + text;
    } else {
      text = String(v ?? '结果已生成。');
    }
    if (!text || !text.trim()) text = '结果已生成。';
    if (text.length > 8000) text = text.slice(0, 8000) + '\n…（已截断）';
    return [{ type: 'text', text }];
  } catch {
    return [{ type: 'text', text: '结果已生成。' }];
  }
}

// 宽松输出契约：显式 additionalProperties:true（dsh-tools 对 object 要求显式声明），放行任意结果字段。
const GENERIC_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: renderGeneric,
};

export function defineTool(spec) {
  if (!spec || typeof spec !== 'object') return officialDefineTool(spec);
  // 输入：优先 parameters，回退老工具的 schema，再退为空对象参数
  const parameters = spec.parameters || spec.schema || { type: 'object', properties: {} };
  // 输出：已声明 output 的工具保持原样；其余补通用契约
  const output = (spec.output && typeof spec.output === 'object') ? spec.output : GENERIC_OUTPUT;
  // 去掉老的 schema 键，避免官方编译时出现未知字段
  const { schema: _legacySchema, ...rest } = spec;
  return officialDefineTool({ ...rest, parameters, output });
}

export default defineTool;
