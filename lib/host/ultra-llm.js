// ultra-llm.js — Ultra 工具箱共享的「内部一路 MAX 调用」健壮封装（纯函数 + 收敛，不抛异常）
// 与 ultra-tools.js 内部私有实现同构；新工具统一从这里取，避免重复造轮子且不改旧代码（零回归）。
import { sampleOnce } from './tournament-engine.js';

export function extractJson(raw) {
  if (!raw) return null;
  const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = String(body).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
export function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }
export function asArr(v) { return Array.isArray(v) ? v : []; }

// 一路内部 MAX 采样并解析 JSON；任何失败都收敛 {ok:false}，绝不把异常抛进 agent loop。
export async function maxJson(llm, opts) {
  if (!llm || typeof llm.stream !== 'function') return { ok: false, reason: 'no-llm' };
  try {
    const r = await sampleOnce(llm, {
      provider: opts.provider,
      model: opts.model,
      system: opts.system || '你只输出严格 JSON，不要输出多余文字。',
      prompt: opts.prompt,
      temperature: opts.temperature ?? 0.4,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    });
    if (!r || r.ok === false || !r.text) return { ok: false, reason: 'sample-failed' };
    const j = extractJson(r.text);
    if (j == null) return { ok: false, reason: 'not-json', text: r.text };
    return { ok: true, json: j, text: r.text };
  } catch (e) {
    return { ok: false, reason: 'throw:' + ((e && e.message) || String(e)) };
  }
}

export function routeOf(exec, deps) {
  const header = (exec && exec.agent && exec.agent.session && exec.agent.session.header) || {};
  return {
    provider: header.provider || deps.provider || '',
    model: header.model || deps.model || '',
    signal: exec && exec.signal,
  };
}

// 并行跑 N 路同构 JSON 判定，单路失败丢弃，全部失败返回空数组（调用方负责降级）。
export async function parallelLanes(llm, route, lanes, build, maxTokens, temperature) {
  const out = await Promise.all(lanes.map(async (lane, i) => {
    const r = await maxJson(llm, { ...route, prompt: build(lane, i), maxTokens, temperature });
    return r.ok ? { lane, ...r.json } : null;
  }));
  return out.filter(Boolean);
}
