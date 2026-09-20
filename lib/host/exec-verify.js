// exec-verify.js — Think 可执行验证沙箱
//
// 「裁判模型说你对」不算数。凡是答案里可算/可跑的结论（算术、纯函数行为、日期、复杂度事实），
// 抽成独立断言代码，在本地隔离 VM 里【真的跑一遍】，用运行结果当裁判：跑挂/断言不符即硬伤证据。
//
// 安全是这一层的生命线：
//   - vm.createContext 建独立 realm，绝不把主 realm 的 Math/JSON 等内置对象塞进去
//     （否则 Math.constructor.constructor('return process')() 一类经典逃逸直接拿到主域 process）；
//     context 用它自己 realm 的 intrinsics，主域的 process/require/setTimeout/queueMicrotask 一概不存在。
//   - 纵深防御：抽取到的验证代码再经危险词过滤，命中即丢弃，宁可不验证也不冒险。
//   - 每条硬超时强杀，最长默认 2s；验证代码只允许纯计算，不给任何 I/O 能力。

import vm from 'node:vm';
import { sampleOnce } from './tournament-engine.js';

// 危险能力黑名单（纵深防御；vm 本身已隔离，这里再拦一层可疑写法）
const DANGER = /\b(require|process|child_process|worker_threads|import\s*\(|import\.meta|eval\s*\(|Function\s*\(|Reflect|Proxy|WebAssembly|globalThis|setTimeout|setInterval|setImmediate|queueMicrotask|setImmediate|fetch|XMLHttpRequest|EventSource|net|tls|dns|os|child|fs|http|https|crypto|stream|zlib|path)\b/;

const VERIFY_TIMEOUT_MS = 2000;

/**
 * 在隔离 VM 内跑一段纯计算验证代码。
 * 代码内可调用 TU_CHECK(name, cond, detail?) / TU_EQ(name, actual, expected)。
 * 返回 { ok, checks:[{name,pass,detail}], error }；ok=false 表示代码本身抛错/超时。
 */
export function runInSandbox(code, timeoutMs) {
  const checks = [];
  const TU_CHECK = (name, cond, detail) => {
    checks.push({ name: String(name == null ? '' : name), pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  };
  const TU_EQ = (name, actual, expected) => {
    let same = false;
    try { same = JSON.stringify(actual) === JSON.stringify(expected); } catch { same = actual === expected; }
    checks.push({
      name: String(name == null ? '' : name),
      pass: same,
      detail: same ? '' : '实际=' + safeStr(actual) + '，应为=' + safeStr(expected),
    });
  };
  // 只显式塞验证钩子与静默 console；Math/JSON/Array/Date 等由 context 自己的 realm 提供（不借主域）
  const sandbox = { TU_CHECK, TU_EQ, console: { log() {}, error() {}, warn() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(String(code), sandbox, { timeout: timeoutMs || VERIFY_TIMEOUT_MS, filename: 'tu-verify.js' });
    return { ok: true, checks };
  } catch (e) {
    return { ok: false, checks, error: String((e && e.message) || e) };
  }
}

function safeStr(v) {
  try { return String(JSON.stringify(v)).slice(0, 160); } catch { return String(v).slice(0, 160); }
}

function extractPrompt(task, answer) {
  return '从下面的答案中，找出【可以用一段独立 JavaScript 纯计算立即验证对错】的具体结论（算术结果、纯函数输入输出、日期/计数/公式事实）。\n' +
    '要求：①只挑确有客观对错、且不依赖网络/文件/用户输入的；②每条写一段自包含 JS，末尾用 TU_EQ("名称", 实际表达式, 期望值) 断言；③不许用 require/process/异步/任何 I/O；④若没有任何可执行验证的结论，返回空数组。\n' +
    '【任务】\n' + String(task || '').slice(0, 2500) +
    '\n\n【待验证答案】\n' + String(answer || '').slice(0, 7000) +
    '\n\n只输出 JSON 数组，不要额外文字：[{"desc":"这条在验证什么","code":"TU_EQ(\'sum\', 2+3, 5)"}]';
}

function parseChecks(raw) {
  if (!raw) return [];
  const fence = raw.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = body.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.code === 'string' && x.code.trim())
      .map((x) => ({ desc: String(x.desc || '').slice(0, 120), code: x.code }))
      .filter((x) => !DANGER.test(x.code))
      .slice(0, 6);
  } catch { return []; }
}

/**
 * 可执行验证主入口。
 * cfg: { provider, model, maxTokens?, signal?, timeoutMs?, extract?(async()=>[{desc,code}]), log? }
 * 返回 { ran, extracted, executed, triggered, evidence, failed, calls }
 */
export async function runExecVerify(llm, task, answer, cfg) {
  const o = cfg || {};
  const log = typeof o.log === 'function' ? o.log : () => {};
  let extracted = [];
  let calls = 0;
  try {
    if (typeof o.extract === 'function') {
      extracted = await o.extract();
    } else if (llm) {
      calls++;
      const r = await sampleOnce(llm, {
        provider: o.provider, model: o.model,
        system: '你只输出 JSON 数组。',
        prompt: extractPrompt(task, answer),
        temperature: 0.1,
        maxTokens: o.maxTokens,
        signal: o.signal,
      });
      extracted = parseChecks(r.text);
    }
  } catch (e) { log('extract failed (contained): ' + String(e)); extracted = []; }
  if (!Array.isArray(extracted)) extracted = [];

  const maxChecks = Math.max(1, Math.min(8, Number(o.maxChecks) || 6));
  const results = [];
  for (const item of extracted.slice(0, maxChecks)) {
    if (DANGER.test(item.code)) continue;
    const r = runInSandbox(item.code, o.timeoutMs || VERIFY_TIMEOUT_MS);
    results.push({ desc: item.desc, ok: r.ok, checks: r.checks, error: r.error });
  }

  const failed = [];
  for (const r of results) {
    if (!r.ok) { failed.push((r.desc ? r.desc + '：' : '') + '验证代码执行失败或超时（' + String(r.error || '').slice(0, 80) + '）'); continue; }
    for (const ck of r.checks) {
      if (!ck.pass) failed.push((r.desc ? r.desc + '：' : '') + (ck.detail || '断言不成立'));
    }
  }
  log('exec-verify: extracted=' + extracted.length + ' executed=' + results.length + ' failed=' + failed.length);
  return {
    ran: true,
    extracted: extracted.length,
    executed: results.length,
    triggered: failed.length > 0,
    evidence: failed.slice(0, 8),
    failed,
    calls,
  };
}

export default { runInSandbox, runExecVerify, parseChecks };
