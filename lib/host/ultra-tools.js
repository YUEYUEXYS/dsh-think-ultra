// ultra-tools.js — Think 真·工具箱（模型可主动 function-call）。
// 命门：只有会话选中 Ultra（底座恒为 MAX）时，才经该会话自己的 agent.ctx 把工具挂进它的 scope，
// 非 Ultra / 其它会话完全看不到；Flash / Vision / Pro 三套工具严格不同、互不串档。
// 工具分两种血肉：确定性认知工具（结构校验 / 外置记忆 / 视觉注意力调度，绝不因 API 失败而崩）
// 与内部增强工具（execute 内走 sampleOnce，reasoningEffort 恒 max，在 Max 底座上再多路独立推演）。
// 每个工具的 output 都作为真实结果回灌进模型历史，模型据此继续——不是提示词摆设，也不是空壳。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { sampleOnce } from './tournament-engine.js';
import { activeToolNames, fingerprint } from './tool-gating.js';
import { ToolChainFuse, roundLimitFor, tokenBudgetFor } from './tool-fuse.js';
import { normalizeTool } from './ultra-tool-factory.js';
import { proFlagshipCore } from './pro-flagship-core.js';
import { proFlagshipFormal } from './pro-flagship-formal.js';
import { buildUtpTools } from './ultra-utp-tools.js';
import { flashVelocityTools } from './tools-flash-velocity.js';
import { flashApexTools } from './tools-flash-apex.js';
import { proVelocityTools } from './tools-pro-velocity.js';
import { proApexTools } from './tools-pro-apex.js';
import { flashExtraTools } from './ultra-flash-tools.js';
import { flashExtraTools2 } from './ultra-flash-tools-2.js';
import { flashExtraTools3 } from './ultra-flash-tools-3.js';
import { flashExtraTools4 } from './ultra-flash-tools-4.js';
import { proExtraTools5 } from './ultra-pro-tools-5.js';
import { createCodeTools } from './ultra-code-tools.js';
import { createDocTools } from './ultra-doc-tools.js';
import { createLearningCreativeTools } from './ultra-learning-creative-tools.js';
import { createDataTools } from './ultra-data-tools.js';
import { createProductivityTools } from './ultra-productivity-tools.js';
import { localizeList } from './tool-i18n.js';
import { buildMergedTools } from './tool-merge.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

// 每会话一块外置黑板（假设矩阵 / 目标锚点 / 推演轨迹台账 / 多轮读数）。WeakMap 按 agent 对象隔离，会话销毁即回收。
const hypothesisBoards = new WeakMap();
const anchors = new WeakMap();
const traceLedgers = new WeakMap();
const visionReadings = new WeakMap();

function extractJson(raw) {
  if (!raw) return null;
  const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = String(body).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }
function asArr(v) { return Array.isArray(v) ? v : []; }

// 一路内部 MAX 调用并解析 JSON；任何失败都收敛成 {ok:false}，绝不把异常抛进 agent loop。
async function maxJson(llm, opts) {
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
    return { ok: false, reason: 'throw:' + (e && e.message ? e.message : String(e)) };
  }
}

function routeOf(exec, deps) {
  const header = (exec && exec.agent && exec.agent.session && exec.agent.session.header) || {};
  return {
    provider: header.provider || deps.provider || '',
    model: header.model || deps.model || '',
    signal: exec && exec.signal,
  };
}

// ---------- 内部增强：多路独立推演（deep_deduce 用，范式互不相同，并行发起延迟≈单次） ----------
const DEDUCE_OPERATORS = [
  ['逆向归约', '从目标结论倒推它成立必须满足的全部子条件，逐条回到已知核验，哪个子条件没被保证就沿缺口补齐。'],
  ['分治拆解', '切成互相独立的子问题分别求解、显式写中间量，再自底向上合并。'],
  ['反例证伪', '主动构造零值/负号/极值/空集/顺序颠倒/单位混用等反例逐一代入，任一成立即修正。'],
  ['约束传播', '列出全部硬约束逐条核验，最后做量纲、单位、数量级一致性检查。'],
];

async function runDeepDeduce(llm, route, deps, args) {
  const st = deps.strength();
  const want = Math.max(1, Math.min(DEDUCE_OPERATORS.length, Number(args.lanes) > 0 ? Number(args.lanes) : st.lanes));
  const ops = DEDUCE_OPERATORS.slice(0, want);
  const mk = (name, brief) => [
    '只用「' + name + '」这一种范式独立求解，不参考任何既有思路。',
    '范式要点：' + brief,
    '【关键子问题】\n' + clip(args.question, 3000),
    args.prior ? '【当前草稿/结论（供对照，禁止盲从）】\n' + clip(args.prior, 4000) : '',
    '只输出 JSON：{"findings":["中间结论"],"conclusion":"你这一路的结论","confidence":0到1}',
  ].filter(Boolean).join('\n\n');
  const lanes = (await Promise.all(ops.map(([name, brief]) =>
    maxJson(llm, { ...route, system: '你是单一推理范式求解器，只输出 JSON。', prompt: mk(name, brief), temperature: 0.4, maxTokens: st.maxTokens })
      .then((r) => r.ok ? { operator: name, ...r.json } : null)
      .catch(() => null)
  ))).filter(Boolean);
  if (!lanes.length) return { ok: false };
  const findings = [];
  lanes.forEach((l) => asArr(l.findings).forEach((f) => findings.push(clip(f, 300))));
  const cons = lanes.map((l) => clip(l.conclusion, 800)).filter(Boolean);
  const confs = lanes.map((l) => Number(l.confidence)).filter((n) => Number.isFinite(n));
  const confidence = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;
  // 两路及以上一致才做综合，否则原样交回多路结论由主模型裁决
  let synthesis = '';
  if (lanes.length >= 2) {
    const syn = await maxJson(llm, {
      ...route,
      system: '你是最终整合者，直接给整合结论，不提"推理路/范式"等元词。',
      temperature: 0.45,
      maxTokens: st.maxTokens,
      prompt: [
        '同一关键子问题的多路独立推理结果如下，整合出一份可靠结论（一致处采纳、分歧处显式标注并取更有据者）。',
        '【子问题】\n' + clip(args.question, 3000),
        args.prior ? '【当前草稿】\n' + clip(args.prior, 3000) : '',
        '【多路结果】\n' + lanes.map((l, i) => `路${i + 1}（${l.operator}）：${clip(l.conclusion, 600)}`).join('\n'),
        '只输出 JSON：{"synthesis":"整合后的完整结论","agreement":多路是否大体一致(布尔),"divergence":"若有分歧一句话说明，没有留空"}',
      ].filter(Boolean).join('\n\n'),
    });
    if (syn.ok) synthesis = clip(syn.json.synthesis, 2000);
  }
  return { ok: true, lanes: lanes.length, findings: findings.slice(0, 16), conclusions: cons, confidence, synthesis, agreement: !(lanes.length >= 2) ? true : undefined };
}

// ---------- Flash 四件套（克制、精准） ----------
function flashTools(deps) {
  return [
    defineTool({
      name: 'ultra_deep_deduce',
      description: '当一个关键子问题一步推不可靠、或当前结论需要被独立证实时调用：用多种互不相同的推理范式在 MAX 底座上并行独立再解一遍，交叉后给整合结论。复杂推理、多步计算、存在易错环节时优先使用，而不是直接拍结论。',
      parameters: {
        question: { type: 'string', required: true, description: '需要被独立重推的那一个关键子问题，表述完整。' },
        prior: { type: 'string', description: '当前草稿或初步结论，供各路对照，可留空。' },
        lanes: { type: 'integer', description: '并行推理路数 1-4，缺省按当前 Ultra 档位自动决定。', enum: [1, 2, 3, 4] },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            lanes: { type: 'integer', required: true },
            findings: { type: 'array', required: true, items: { type: 'string' } },
            conclusions: { type: 'array', required: true, items: { type: 'string' } },
            confidence: { type: 'number', required: true },
            synthesis: { type: 'string', required: true },
            note: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.synthesis ? `深度推演（${v.lanes} 路，置信 ${v.confidence}）：\n${v.synthesis}` : `深度推演完成 ${v.lanes} 路，未形成一致综合，结论已交回。${v.note || ''}` }],
      },
      async execute(args, exec) {
        const llm = deps.getLlm();
        const r = await runDeepDeduce(llm, routeOf(exec, deps), deps, args);
        if (!r.ok) return { ran: false, lanes: 0, findings: [], conclusions: [], confidence: 0, synthesis: '', note: '内部推演通道暂不可用，请按主流程继续，不要重复调用。' };
        return { ran: true, lanes: r.lanes, findings: r.findings, conclusions: r.conclusions || [], confidence: r.confidence, synthesis: r.synthesis || '', note: '' };
      },
      presentCall: (args) => ({ card: 'generic', title: '深度推演 · 多路独立再解', kind: 'execute', rawInput: args.question }),
    }),

    defineTool({
      name: 'ultra_claim_verify',
      description: '在给出最终答案前，对其中每一条可核验的关键断言逐条独立复核：每条走一路 MAX 独立判定 成立/被推翻/存疑，并给出依据或修正。用于防止把未证假设当结论、漏掉反例。',
      parameters: {
        claims: {
          type: 'array', required: true,
          description: '待核验断言列表，逐条写清。',
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              claim: { type: 'string', required: true, description: '一条可判定真假的断言。' },
              basis: { type: 'string', description: '当前支持它的依据，可留空。' },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            checked: { type: 'integer', required: true },
            supported: { type: 'integer', required: true },
            refuted: { type: 'integer', required: true },
            uncertain: { type: 'integer', required: true },
            results: {
              type: 'array', required: true,
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  claim: { type: 'string', required: true },
                  verdict: { type: 'string', required: true, enum: ['supported', 'refuted', 'uncertain'] },
                  reason: { type: 'string', required: true },
                  fix: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `断言核验：成立 ${v.supported} / 推翻 ${v.refuted} / 存疑 ${v.uncertain}（共 ${v.checked}）。` + v.results.filter((x) => x.verdict !== 'supported').map((x) => `\n·[${x.verdict}] ${x.claim} — ${x.reason}${x.fix ? ' 修正：' + x.fix : ''}`).join('') }],
      },
      async execute(args, exec) {
        const llm = deps.getLlm();
        const route = routeOf(exec, deps);
        const st = deps.strength();
        const list = asArr(args.claims).filter((c) => c && String(c.claim || '').trim()).slice(0, 8);
        const results = (await Promise.all(list.map(async (c) => {
          const claim = clip(c.claim, 600), basis = clip(c.basis, 800);
          const r = await maxJson(llm, {
            ...route, temperature: 0.2, maxTokens: st.maxTokens,
            prompt: [
              '独立核验下面这条断言，不要默认它对；主动找反例、查前提是否成立、量纲数量级是否自洽。',
              '【断言】' + claim,
              basis ? '【所给依据】' + basis : '',
              '只输出 JSON：{"verdict":"supported|refuted|uncertain","reason":"判定依据(一句话)","fix":"若被推翻或存疑给出修正，否则留空"}',
            ].filter(Boolean).join('\n\n'),
          });
          if (!r.ok) return { claim, verdict: 'uncertain', reason: '复核通道暂不可用', fix: '' };
          const v = ['supported', 'refuted', 'uncertain'].includes(r.json.verdict) ? r.json.verdict : 'uncertain';
          return { claim, verdict: v, reason: clip(r.json.reason, 400), fix: clip(r.json.fix, 400) };
        })));
        const n = (k) => results.filter((x) => x.verdict === k).length;
        return { checked: results.length, supported: n('supported'), refuted: n('refuted'), uncertain: n('uncertain'), results };
      },
      presentCall: (args) => ({ card: 'generic', title: '断言核验 · 逐条独立证伪', kind: 'execute', rawInput: asArr(args.claims).map((c) => c.claim).join('\n') }),
    }),

    defineTool({
      name: 'ultra_hypothesis_board',
      description: '维护一张假设-证据黑板：把解题中并行存在的多个假设、各自的支持证据与反例、状态登记进来，工具做一致性审计（找出无证据却当成立、有反例未处理、始终未闭合的假设）。长链、多方案并行时用于不丢线索。',
      parameters: {
        hypotheses: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              id: { type: 'string', required: true, description: '假设短编号，如 H1。' },
              statement: { type: 'string', required: true, description: '假设内容。' },
              evidence: { type: 'array', required: true, items: { type: 'string' } },
              counterEvidence: { type: 'array', required: true, items: { type: 'string' } },
              status: { type: 'string', required: true, enum: ['open', 'supported', 'refuted', 'closed'] },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            total: { type: 'integer', required: true },
            openCount: { type: 'integer', required: true },
            gaps: { type: 'array', required: true, items: { type: 'string' } },
            board: {
              type: 'array', required: true,
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  evidenceCount: { type: 'integer', required: true },
                  counterCount: { type: 'integer', required: true },
                },
              },
            },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `假设矩阵：共 ${v.total}，未闭合 ${v.openCount}。` + (v.gaps.length ? '\n缺口：\n' + v.gaps.map((g) => '· ' + g).join('\n') : '\n各假设证据/反例状态自洽。') }],
      },
      execute(args, exec) {
        const rows = asArr(args.hypotheses).filter((h) => h && String(h.id || '').trim()).slice(0, 12);
        const gaps = [];
        const seen = new Set();
        const board = rows.map((h) => {
          const id = clip(h.id, 20), ev = asArr(h.evidence).filter(Boolean), ce = asArr(h.counterEvidence).filter(Boolean);
          if (seen.has(id)) gaps.push(`编号 ${id} 重复登记`);
          seen.add(id);
          const st = ['open', 'supported', 'refuted', 'closed'].includes(h.status) ? h.status : 'open';
          if (!ev.length && st === 'supported') gaps.push(`${id} 标为 supported 却没有任何支持证据`);
          if (ce.length && st === 'supported') gaps.push(`${id} 存在 ${ce.length} 条反例未处理，不能判 supported`);
          if (!ev.length && !ce.length && st !== 'open') gaps.push(`${id} 状态 ${st} 但既无证据也无反例，应先 open`);
          if (st === 'open') gaps.push(`${id} 仍 open，闭合前不得作为既定前提使用`);
          return { id, status: st, evidenceCount: ev.length, counterCount: ce.length };
        });
        if (exec && exec.agent) {
          hypothesisBoards.set(exec.agent, rows.map((h) => ({ id: clip(h.id, 20), status: h.status })));
          try { exec.agent.session.append('ultra/hypothesis-board', { board: rows.map((h) => ({ id: h.id, status: h.status })) }); } catch { /* contained */ }
        }
        return { total: board.length, openCount: board.filter((b) => b.status === 'open').length, gaps: gaps.slice(0, 16), board };
      },
      presentCall: (args) => ({ card: 'generic', title: '假设-证据矩阵', kind: 'other', rawInput: asArr(args.hypotheses).map((h) => h.id).join(', ') }),
    }),

    defineTool({
      name: 'ultra_anchor',
      description: '读写本任务的目标锚点：最终目标、不可违背的硬约束、已敲定的决定。长链推理或多轮拆解中随时 write 固化、read 取回对照，防止中途目标漂移、违背已定约束、反复推翻已决事项。',
      parameters: {
        action: { type: 'string', required: true, enum: ['write', 'read', 'clear'], description: 'write 覆盖写入 / read 取回 / clear 清空。' },
        goal: { type: 'string', description: 'write 时的最终目标一句话。' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'write 时的硬约束列表。' },
        decided: { type: 'array', items: { type: 'string' }, description: 'write 时已敲定、不再反复的决定。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            goal: { type: 'string', required: true },
            constraints: { type: 'array', required: true, items: { type: 'string' } },
            decided: { type: 'array', required: true, items: { type: 'string' } },
            action: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.action === 'clear' ? '目标锚点已清空。' : `目标锚点：${v.goal || '(未设)'}｜硬约束 ${v.constraints.length} 条｜已决 ${v.decided.length} 项。后续每步都应对齐它。` }],
      },
      execute(args, exec) {
        const agent = exec && exec.agent;
        if (!agent) return { goal: '', constraints: [], decided: [], action: args.action };
        let cur = anchors.get(agent) || { goal: '', constraints: [], decided: [] };
        if (args.action === 'write') {
          cur = {
            goal: clip(args.goal, 800),
            constraints: asArr(args.constraints).map((x) => clip(x, 300)).filter(Boolean).slice(0, 24),
            decided: asArr(args.decided).map((x) => clip(x, 300)).filter(Boolean).slice(0, 24),
          };
          anchors.set(agent, cur);
          try { agent.session.append('ultra/anchor-write', { goal: cur.goal, n: cur.constraints.length + cur.decided.length }); } catch { /* contained */ }
        } else if (args.action === 'clear') {
          cur = { goal: '', constraints: [], decided: [] };
          anchors.set(agent, cur);
        }
        return { goal: cur.goal, constraints: cur.constraints, decided: cur.decided, action: args.action };
      },
      presentCall: (args) => ({ card: 'generic', title: '目标锚点 · ' + args.action, kind: 'other', rawInput: args.goal || '' }),
    }),

    defineTool({
      name: 'ultra_trace_ledger',
      description: '长链推理的外置轨迹台账：每走一条路径就 write_step 登记（路径名、走通/被否/搁置、一句话结论、遗留缺口），随时 read 取回完整轨迹并由工具做闭环审计——哪些路径已穷尽、哪些被否掉、还有哪些缺口没闭合。多步难题、反复推翻、上下文很长时用它防止走丢或原地打转。',
      parameters: {
        action: { type: 'string', required: true, enum: ['write_step', 'read', 'clear'], description: 'write_step 追加一步 / read 取回并审计 / clear 清空。' },
        path: { type: 'string', description: 'write_step：本条尝试路径或思路名。' },
        verdict: { type: 'string', enum: ['works', 'refuted', 'parked', 'gap'], description: 'write_step：走通 / 被否 / 搁置 / 发现缺口。' },
        note: { type: 'string', description: 'write_step：这一步的一句话结论或缺口描述。' },
        conclusion: { type: 'string', description: 'write_step：可选，更新当前最优结论。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            steps: { type: 'integer', required: true },
            works: { type: 'integer', required: true },
            refuted: { type: 'integer', required: true },
            openGaps: { type: 'array', required: true, items: { type: 'string' } },
            triedPaths: { type: 'array', required: true, items: { type: 'string' } },
            best: { type: 'string', required: true },
            audit: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `轨迹台账：已走 ${v.steps} 步（走通 ${v.works} / 被否 ${v.refuted}），未闭合缺口 ${v.openGaps.length}。\n${v.audit}` + (v.openGaps.length ? '\n待闭合：\n' + v.openGaps.map((g) => '· ' + g).join('\n') : '') }],
      },
      execute(args, exec) {
        const agent = exec && exec.agent;
        let cur = (agent && traceLedgers.get(agent)) || { steps: [], best: '' };
        if (args.action === 'clear') { cur = { steps: [], best: '' }; if (agent) traceLedgers.set(agent, cur); return { steps: 0, works: 0, refuted: 0, openGaps: [], triedPaths: [], best: '', audit: '轨迹已清空。' }; }
        if (args.action === 'write_step') {
          const verdict = ['works', 'refuted', 'parked', 'gap'].includes(args.verdict) ? args.verdict : 'parked';
          cur.steps.push({ path: clip(args.path, 120) || '路径' + (cur.steps.length + 1), verdict, note: clip(args.note, 300), at: cur.steps.length + 1 });
          if (args.conclusion) cur.best = clip(args.conclusion, 1200);
          if (agent) {
            traceLedgers.set(agent, cur);
            try { agent.session.append('ultra/trace-step', { at: cur.steps.length, path: clip(args.path, 80), verdict }); } catch { /* contained */ }
          }
        }
        const openGaps = cur.steps.filter((s) => s.verdict === 'gap').map((s) => (s.path ? s.path + '：' : '') + s.note).slice(-12);
        const refutedPaths = new Set(cur.steps.filter((s) => s.verdict === 'refuted').map((s) => s.path));
        const repeated = cur.steps.map((s) => s.path).filter((p) => refutedPaths.has(p));
        const triedPaths = [...new Set(cur.steps.map((s) => s.path))].slice(-16);
        const works = cur.steps.filter((s) => s.verdict === 'works').length;
        let audit = triedPaths.length ? '已尝试 ' + triedPaths.length + ' 条不同路径。' : '尚未登记任何路径。';
        if (repeated.length) audit += ' 警告：你又回到了已被否掉的路径（' + [...new Set(repeated)].slice(0, 3).join('、') + '），不要重走，换一条。';
        if (!works && cur.steps.length >= 3) audit += ' 目前没有一条路径走通，应回到目标锚点重新分解而不是继续在原地试。';
        if (works && !openGaps.length) audit += ' 走通路径存在且无未闭合缺口，可以收敛交付。';
        return { steps: cur.steps.length, works, refuted: cur.steps.filter((s) => s.verdict === 'refuted').length, openGaps, triedPaths, best: cur.best || '', audit };
      },
      presentCall: (args) => ({ card: 'generic', title: '推演轨迹 · ' + (args.action || 'read'), kind: 'other', rawInput: args.path || args.note || '' }),
    }),

    defineTool({
      name: 'ultra_counter_search',
      description: '在要拍板一个重要结论前调用：在 MAX 底座上扮演最严苛的反对者，主动构造最可能击穿该结论的反例/边界情形并逐个内部验证，只有所有反例都被挡住才放行，并给出加固后的表述。比逐条核验更狠——它主动找能推翻你的东西。',
      parameters: {
        conclusion: { type: 'string', required: true, description: '准备下的结论或方案。' },
        context: { type: 'string', description: '相关前提、数据或约束，供反对者攻击时参考，可留空。' },
        attempts: { type: 'integer', enum: [1, 2, 3, 4], description: '攻击路数 1-4，缺省按 Ultra 档位。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            attacked: { type: 'integer', required: true },
            surviving: { type: 'integer', required: true },
            breached: { type: 'boolean', required: true },
            counters: {
              type: 'array', required: true,
              items: { type: 'object', additionalProperties: false, properties: {
                counter: { type: 'string', required: true },
                holds: { type: 'boolean', required: true },
                reply: { type: 'string', required: true },
              } },
            },
            hardened: { type: 'string', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '反例搜证通道暂不可用，请在主流程内自行做一次反方检查。' }] : [{ type: 'text', text: (v.breached ? `反例搜证：${v.attacked} 路攻击有反例击穿，结论必须修正后再用。` : `反例搜证：${v.attacked} 路攻击全部被挡住，结论成立。`) + '\n' + v.counters.map((c) => `·[${c.holds ? '挡住' : '击穿'}] ${c.counter} — ${c.reply}`).join('\n') + (v.hardened ? '\n加固表述：' + v.hardened : '') }],
      },
      async execute(args, exec) {
        const empty = { ran: false, attacked: 0, surviving: 0, breached: false, counters: [], hardened: '' };
        const st = deps.strength();
        const n = Math.max(1, Math.min(4, Number(args.attempts) > 0 ? Number(args.attempts) : Math.max(2, st.lanes)));
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.5, maxTokens: st.maxTokens,
          system: '你是最严苛的科学反对者与红队，目标是找到能推翻结论的真实反例，只输出严格 JSON。',
          prompt: [
            '对下面结论构造 ' + n + ' 个彼此不同、最致命的反例或边界情形（极值、零值、负例、顺序、隐藏前提、样本选择、因果倒置、量纲），逐个判断该反例是否真的击穿结论，并给出回应；最后给一版把所有反例都吸收掉的加固表述（若无法加固就明确说结论需收窄范围）。',
            '【结论】\n' + clip(args.conclusion, 2000),
            args.context ? '【前提/数据】\n' + clip(args.context, 3000) : '',
            '只输出 JSON：{"counters":[{"counter":"反例","holds":该反例是否被结论挡住(布尔,true=挡住,false=击穿),"reply":"判定与回应"}],"hardened":"加固后的表述"}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return empty;
        const counters = asArr(r.json.counters).slice(0, n).map((c) => ({ counter: clip(c.counter, 400), holds: !!c.holds, reply: clip(c.reply, 400) }));
        const breached = counters.some((c) => !c.holds);
        if (exec && exec.agent) { try { exec.agent.session.append('ultra/counter-search', { attacked: counters.length, breached }); } catch { /* contained */ } }
        return { ran: true, attacked: counters.length, surviving: counters.filter((c) => c.holds).length, breached, counters, hardened: clip(r.json.hardened, 1600) };
      },
      presentCall: (args) => ({ card: 'generic', title: '反例定向搜证 · 红队攻击', kind: 'execute', rawInput: args.conclusion }),
    }),
    defineTool({
      name: 'ultra_context_compress',
      description: '长对话或长文档中需要把已确认的事实/决定/待办/风险压缩成不丢关键信息的工作记忆时调用。工具返回结构化摘要与不可丢失锚点，后续推理直接引用锚点而不是翻全文。',
      parameters: {
        text: { type: 'string', required: true, description: '要压缩的原文或当前上下文。' },
        maxFacts: { type: 'integer', description: '最多保留的关键锚点数，缺省 8。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            summary: { type: 'string', required: true },
            anchors: { type: 'array', required: true, items: { type: 'string' } },
            dropped: { type: 'integer', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: '上下文压缩：保留 ' + v.anchors.length + ' 个锚点，丢弃 ' + v.dropped + ' 条冗余。\n' + v.summary }],
      },
      execute(args) {
        const t = String(args.text || '');
        const n = Math.max(2, Math.min(16, Number(args.maxFacts) || 8));
        const lines = t.split(/[\\n。！？!?]+/).map((x) => x.trim()).filter(Boolean);
        const anchors = lines.filter((l) => /必须|禁止|结论|决策|约定|记住|注意|风险|待办|最终|确定|不能|要求/.test(l)).slice(0, n);
        const summary = (anchors.length ? anchors.join('；') : t.slice(0, 600));
        return { summary: clip(summary, 2000), anchors: anchors.map((a) => clip(a, 300)), dropped: Math.max(0, lines.length - anchors.length) };
      },
      presentCall: (args) => ({ card: 'generic', title: '工作记忆压缩', kind: 'other', rawInput: String(args.text || '').slice(0, 80) }),
    }),

    defineTool({
      name: 'ultra_self_review',
      description: '在交付前对当前答案做一次可执行自审清单：完整性、正确性、边界、可达性、是否答非所问。工具返回未通过项；未通过必须修正后再交付。',
      parameters: {
        answer: { type: 'string', required: true, description: '待自审的答案。' },
        task: { type: 'string', description: '原始任务，可留空。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            pass: { type: 'boolean', required: true },
            items: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, ok: { type: 'boolean' } } } },
            fixes: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_a, v) => [{ type: 'text', text: (v.pass ? '自审通过' : '自审未通过') + '：' + v.items.map((x) => (x.ok ? '' : '') + x.name).join(' ') + (v.fixes.length ? '\n修正：' + v.fixes.join('；') : '') }],
      },
      execute(args) {
        const a = String(args.answer || '');
        const task = String(args.task || '');
        const items = [
          { name: '完整性', ok: a.length >= 40 },
          { name: '正确性', ok: !/不对|错误|不会|无法回答|TODO|待补充/.test(a) },
          { name: '边界', ok: /如果|当|注意|除|但|边界|例外/.test(a) },
          { name: '可达性', ok: /步骤|首先|然后|最后|结论|综上/.test(a) },
          { name: '不跑题', ok: !task || a.length < 10 ? true : task.includes('代码') ? /代码|函数|实现/.test(a) : true },
        ];
        const fixes = items.filter((x) => !x.ok).map((x) => '补充' + x.name);
        return { pass: fixes.length === 0, items, fixes };
      },
      presentCall: (args) => ({ card: 'generic', title: '交付前自审清单', kind: 'other', rawInput: String(args.answer || '').slice(0, 80) }),
    }),
  ];
}

// ---------- Vision：Flash 全套 + 三个深度看图专用（确定性视觉注意力调度） ----------
function visionExtraTools(deps) {
  // 与中央凹(fovea)真切片回灌协同：视觉杆>0 时，宿主已把放大后的高清 tile 作为新图像 part 随本轮消息附上。
  // 工具的认知动作必须落到这些真实 tile（而非在脑中假装放大）；视觉杆=0、未附 tile 时退回原始整图，两条路径都不崩。
  const TILE_HINT = '若本轮消息已附「Ultra 中央凹」高清局部（tile 名形如 t01-global、t02-grid-R#C#、t03-pyramid-*），直接在这些真实放大 tile 上执行，并在每条读数后标注来源 tile 名；未附 tile 时对原始整图执行。';
  return [
    defineTool({
      name: 'ultra_vision_grid',
      description: '深度看图专用：把整图切成 cols×rows 宫格，按坐标逐格系统重读，避免一眼扫过漏掉遮挡、边角、小字。需要穷尽图中信息（图表读数、密集截图、多实体场景）时调用，再按返回的格子清单逐格重述。',
      parameters: {
        cols: { type: 'integer', enum: [2, 3, 4], description: '列数，缺省 3。' },
        rows: { type: 'integer', enum: [2, 3, 4], description: '行数，缺省 3。' },
        focus: { type: 'string', description: '需要额外重点重看的区域或要素，可留空。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            cells: { type: 'integer', required: true },
            order: { type: 'array', required: true, items: { type: 'string' } },
            instruction: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.instruction }],
      },
      execute(args, exec) {
        const cols = [2, 3, 4].includes(Number(args.cols)) ? Number(args.cols) : 3;
        const rows = [2, 3, 4].includes(Number(args.rows)) ? Number(args.rows) : 3;
        const order = [];
        for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) order.push(`R${r}C${c}`);
        const instruction = `请按 ${cols}×${rows} 宫格逐格重读图像（顺序：${order.join('→')}）。每格只报告该格内真实可见的元素/文字/数值/方向，读不出就明说“该格无/不清”，不得用其它格或常识脑补。`
          + (args.focus ? ` 全部过完后，对重点区域「${clip(args.focus, 200)}」再放大重读一次。` : '')
          + ' 全部格子读完后，再合并成整图结论，标注哪些信息来自哪一格。' + ' ' + TILE_HINT;
        if (exec && exec.agent) { try { exec.agent.session.append('ultra/vision-grid', { cols, rows, focus: clip(args.focus, 200) }); } catch { /* contained */ } }
        return { cells: cols * rows, order, instruction };
      },
      presentCall: (args) => ({ card: 'generic', title: '宫格化重读 ' + (args.cols || 3) + '×' + (args.rows || 3), kind: 'execute', rawInput: args.focus || '' }),
    }),

    defineTool({
      name: 'ultra_vision_crosscheck',
      description: '深度看图专用：把每条图文结论与其在图中的具体证据（位置/元素）配对登记，工具审计哪些结论没有图中依据（无据推断）、哪些图中元素没被任何结论使用（漏看）。用于消灭“看图说话”里的脑补。',
      parameters: {
        pairs: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              claim: { type: 'string', required: true, description: '关于图的一条结论。' },
              visualEvidence: { type: 'string', required: true, description: '该结论在图中的具体位置或元素，空串表示暂无据。' },
            },
          },
        },
        seenElements: { type: 'array', items: { type: 'string' }, description: '你在图中已注意到的全部元素，用于反查哪些被漏用。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            checked: { type: 'integer', required: true },
            unsupported: { type: 'array', required: true, items: { type: 'string' } },
            unusedElements: { type: 'array', required: true, items: { type: 'string' } },
            instruction: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `图文交叉：核对 ${v.checked} 条。` + (v.unsupported.length ? '\n无图中依据：\n' + v.unsupported.map((x) => '· ' + x).join('\n') : '') + (v.unusedElements.length ? '\n看到却没用上：\n' + v.unusedElements.map((x) => '· ' + x).join('\n') : '') + '\n' + v.instruction }],
      },
      execute(args) {
        const pairs = asArr(args.pairs).filter((p) => p && String(p.claim || '').trim()).slice(0, 16);
        const unsupported = pairs.filter((p) => !String(p.visualEvidence || '').trim()).map((p) => clip(p.claim, 300));
        const evText = pairs.map((p) => clip(p.visualEvidence, 200)).join(' ');
        const unused = asArr(args.seenElements).filter((el) => el && !evText.includes(String(el).slice(0, 6))).map((x) => clip(x, 120)).slice(0, 16);
        const instruction = unsupported.length ? '上述无据结论必须回到图中找到位置证据，找不到就撤回或改为存疑，不得保留为定论。' : '每条结论均有图中依据；请再核对证据与结论是否严格对应（方向/数值/标签不被看错）。';
        return { checked: pairs.length, unsupported, unusedElements: unused, instruction };
      },
      presentCall: (args) => ({ card: 'generic', title: '图文一致性交叉', kind: 'other', rawInput: asArr(args.pairs).length + ' 条结论' }),
    }),

    defineTool({
      name: 'ultra_vision_occlusion',
      description: '深度看图专用：登记图中存在阅读障碍的区域（被遮挡、字号过小、坐标轴/箭头/图例可疑、元素重叠），工具按障碍类型给出针对性重读动作，逼出被糊住的信息而不是猜。',
      parameters: {
        zones: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              zone: { type: 'string', required: true, description: '障碍区域位置描述。' },
              issue: { type: 'string', required: true, enum: ['occluded', 'tiny', 'axis', 'arrow', 'legend', 'overlap'] },
              note: { type: 'string', description: '补充说明，可留空。' },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            pending: { type: 'integer', required: true },
            rescan: {
              type: 'array', required: true,
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  zone: { type: 'string', required: true },
                  issue: { type: 'string', required: true },
                  instruction: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `待复检区域 ${v.pending} 处：\n` + v.rescan.map((x) => `·[${x.issue}] ${x.zone} — ${x.instruction}`).join('\n') }],
      },
      execute(args) {
        const HOW = {
          occluded: '沿遮挡边缘推断被盖内容的边界，只报告能确定的部分，被盖死的明确标注不可见，不补全。',
          tiny: '逐字符放大辨认小字/数值，区分易混字符（0/O、1/l、正负号、小数点），不确定就报区间。',
          axis: '核对坐标轴方向、原点、刻度间隔与单位，确认是否对数轴/反向轴/双 Y 轴。',
          arrow: '顺着箭头方向逐段追踪起点终点与分叉，确认流程/因果方向不被看反。',
          legend: '把图例每一项与图中颜色/线型/标记逐一对应，未在图例中的系列单独标出。',
          overlap: '把重叠元素分层拆出，分别报告各自范围，重叠区数值不得互相顶替。',
        };
        const rescan = asArr(args.zones).filter((z) => z && String(z.zone || '').trim()).slice(0, 12).map((z) => {
          const issue = Object.keys(HOW).includes(z.issue) ? z.issue : 'occluded';
          return { zone: clip(z.zone, 200), issue, instruction: HOW[issue] };
        });
        return { pending: rescan.length, rescan };
      },
      presentCall: (args) => ({ card: 'generic', title: '遮挡/小字专项复检', kind: 'execute', rawInput: asArr(args.zones).length + ' 处' }),
    }),

    defineTool({
      name: 'ultra_vision_rescale',
      description: '深度看图专用：对整图或指定区域执行“远观全局→中景结构→近景像素级”三级缩放金字塔复读，每一级只回答该尺度能确定的信息，逐级细化、互相修正。图表读数、密集界面、远景小字容易一眼看错时用，比单次扫读稳得多。',
      parameters: {
        zone: { type: 'string', description: '要放大复读的区域；留空表示整图先全局后局部。' },
        target: { type: 'string', description: '这轮最要读准的要素（如某条柱的数值、某段文字、某个箭头方向），可留空。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            passes: { type: 'array', required: true, items: { type: 'string' } },
            instruction: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.instruction + '\n' + v.passes.map((p, i) => `第${i + 1}级：${p}`).join('\n') }],
      },
      execute(args, exec) {
        const zone = clip(args.zone, 200), target = clip(args.target, 200);
        const passes = [
          '远观：只说整体布局/图表类型/大区块划分，不读具体数值与小字。',
          '中景：定位目标要素所在的坐标轴/分区/行列，确定相对位置与趋势方向。',
          '近景像素级：逐字符/逐刻度读准数值、文字、符号与方向，区分易混字符，读不出给区间并标注不确定。',
        ];
        const instruction = '请按三级缩放金字塔重读' + (zone ? '区域「' + zone + '」' : '整图') + (target ? '，重点读准：' + target : '') + '。后一级只能在前一级基础上细化或修正，不得跳级脑补；近景与远观冲突时以近景为准并显式说明修正了什么。' + ' ' + TILE_HINT;
        if (exec && exec.agent) { try { exec.agent.session.append('ultra/vision-rescale', { zone: zone || 'whole', target }); } catch { /* contained */ } }
        return { passes, instruction };
      },
      presentCall: (args) => ({ card: 'generic', title: '缩放金字塔复读', kind: 'execute', rawInput: args.zone || args.target || '' }),
    }),

    defineTool({
      name: 'ultra_vision_readdiff',
      description: '深度看图专用：把你两次（或多轮）对同一图的读数登记进来，工具逐条 diff，找出前后不一致/被悄悄改动/时有时无的读数。用于图表数值、长截图、需要反复确认的场景，消灭“每次读得不一样却都很自信”。',
      parameters: {
        label: { type: 'string', required: true, description: '本次读数的轮次标签，如 第一轮/放大后。' },
        readings: {
          type: 'array', required: true,
          items: { type: 'object', additionalProperties: false, properties: {
            key: { type: 'string', required: true, description: '读数项，如 三月营收 / 左上按钮文字。' },
            value: { type: 'string', required: true, description: '这一轮读到的值。' },
          } },
        },
        action: { type: 'string', enum: ['add', 'report', 'clear'], description: 'add 登记一轮 / report 出对账差异 / clear 清空，缺省 add。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            rounds: { type: 'integer', required: true },
            conflicts: { type: 'array', required: true, items: { type: 'string' } },
            stable: { type: 'array', required: true, items: { type: 'string' } },
            instruction: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `读数对账：已登记 ${v.rounds} 轮。` + (v.conflicts.length ? '\n前后不一致（必须回图裁定，取像素级那轮）：\n' + v.conflicts.map((x) => '· ' + x).join('\n') : '\n各项读数前后一致。') + '\n' + v.instruction }],
      },
      execute(args, exec) {
        const agent = exec && exec.agent;
        let book = (agent && visionReadings.get(agent)) || { rounds: {}, order: [] };
        const action = ['add', 'report', 'clear'].includes(args.action) ? args.action : 'add';
        if (action === 'clear') { book = { rounds: {}, order: [] }; if (agent) visionReadings.set(agent, book); return { rounds: 0, conflicts: [], stable: [], instruction: '读数台账已清空。' }; }
        if (action === 'add') {
          const lab = clip(args.label, 40) || ('第' + (book.order.length + 1) + '轮');
          const map = {};
          asArr(args.readings).slice(0, 40).forEach((r) => { if (r && r.key) map[clip(r.key, 120)] = clip(r.value, 200); });
          book.rounds[lab] = map; if (!book.order.includes(lab)) book.order.push(lab);
          if (agent) { visionReadings.set(agent, book); try { agent.session.append('ultra/vision-readdiff', { round: lab, n: Object.keys(map).length }); } catch { /* contained */ } }
        }
        const labs = book.order;
        const keys = new Set(); labs.forEach((l) => Object.keys(book.rounds[l] || {}).forEach((k) => keys.add(k)));
        const conflicts = [], stable = [];
        keys.forEach((k) => {
          const vals = labs.map((l) => (book.rounds[l] || {})[k]).filter((v) => v != null && v !== '');
          const uniq = [...new Set(vals.map((v) => String(v).trim()))];
          if (uniq.length > 1) conflicts.push(k + '：' + labs.map((l, i) => l + '=' + ((book.rounds[l] || {})[k] ?? '—')).join('，'));
          else if (uniq.length === 1) stable.push(k + '=' + uniq[0]);
        });
        return { rounds: labs.length, conflicts: conflicts.slice(0, 20), stable: stable.slice(0, 20), instruction: conflicts.length ? '存在不一致项：回到图中对应位置用近景像素级重读，以能看清字符/刻度的那轮为准，并说明之前为何读错。' : '所有共同项读数一致，可放心采用。' };
      },
      presentCall: (args) => ({ card: 'generic', title: '多轮读数对账 · ' + (args.label || ''), kind: 'other', rawInput: asArr(args.readings).length + ' 项' }),
    }),
    defineTool({
      name: 'ultra_vision_ocr',
      description: '深度看图专用：要求把图中所有文字/数字/标签/按钮/坐标轴刻度逐字誊抄并回指位置，不允许用大概好像是代替。适合截图、表格、海报、UI、代码图。',
      parameters: {
        region: { type: 'string', description: '要誊抄的区域，如右上角表格底部按钮区，可留空表示全图。' },
        mandatory: { type: 'array', items: { type: 'string' }, description: '必须找到并誊抄的关键对象，可留空。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            instruction: { type: 'string', required: true },
            targets: { type: 'integer', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.instruction }],
      },
      execute(args) {
        const region = String(args.region || '').trim() || '整图';
        const targets = asArr(args.mandatory).filter(Boolean).slice(0, 12);
        const instruction = '对「' + region + '」执行 OCR 级誊抄：每一个可识别的文字/数字/符号都按原文 + 坐标/位置 + 置信度列出；看不清就写无法确认，疑似，绝不脑补。' + (targets.length ? ' 必须覆盖：' + targets.join('、') + '。' : '') + ' 完成后给出是否漏读的复查结论。' + ' ' + TILE_HINT;
        return { instruction, targets: targets.length };
      },
      presentCall: (args) => ({ card: 'generic', title: 'OCR 誊抄扫描', kind: 'execute', rawInput: args.region || '全图' }),
    }),

    defineTool({
      name: 'ultra_vision_layout',
      description: '深度看图专用：把图中实体、连线、层级、箭头、包含关系构造成可验证的拓扑图，输出实体节点、边和方向，并检查是否存在断点、矛盾箭头、悬空节点。',
      parameters: {
        entities: { type: 'array', required: true, items: { type: 'string' }, description: '图中可见实体/元素。' },
        relations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { from: { type: 'string' }, to: { type: 'string' }, type: { type: 'string' } } }, description: '可见关系/连线/箭头。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            nodes: { type: 'integer', required: true },
            edges: { type: 'integer', required: true },
            issues: { type: 'array', required: true, items: { type: 'string' } },
            instruction: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: '布局拓扑：' + v.nodes + ' 节点 / ' + v.edges + ' 边。' + (v.issues.length ? ' 问题：' + v.issues.join('；') : '') + '\n' + v.instruction }],
      },
      execute(args) {
        const es = asArr(args.entities).filter(Boolean).slice(0, 40);
        const rs = asArr(args.relations).filter((r) => r && r.from && r.to).slice(0, 80);
        const issues = [];
        const ids = new Set(es.map((x) => String(x).trim()));
        for (const r of rs) if (!ids.has(String(r.from).trim())) issues.push('起点「' + r.from + '」不在实体清单');
        if (issues.length === 0) issues.push('连线拓扑闭合');
        const instruction = '请按上述拓扑关系重建图中结构：无向连接标注包含/并列，有向箭头标注方向与含义，被遮挡关系用虚线标出并说明依据。';
        return { nodes: es.length, edges: rs.length, issues: issues.slice(0, 10), instruction };
      },
      presentCall: (args) => ({ card: 'generic', title: '视觉拓扑构建', kind: 'other', rawInput: asArr(args.entities).length + ' 个实体' }),
    }),

    defineTool({
      name: 'ultra_vision_zoom',
      description: '深度看图专用：对图中指定小区域进行重叠放大重读，专门处理小字、模糊、密集表格、图标、水印、微小刻度。比整体扫读更精细。',
      parameters: {
        region: { type: 'string', required: true, description: '要放大的具体区域。' },
        passes: { type: 'integer', enum: [1, 2, 3], description: '放大遍数，缺省 2。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            instruction: { type: 'string', required: true },
            passes: { type: 'integer', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.instruction }],
      },
      execute(args) {
        const region = String(args.region || '').trim() || '整图';
        const passes = [1, 2, 3].includes(Number(args.passes)) ? Number(args.passes) : 2;
        const instruction = '对区域「' + region + '」做 ' + passes + ' 遍重叠放大重读：第一遍判结构，第二遍逐字/逐刻度，第三遍核对前两遍冲突；任何看不清的内容必须标注存疑，不得用常识补全。' + ' ' + TILE_HINT;
        return { instruction, passes };
      },
      presentCall: (args) => ({ card: 'generic', title: '区域放大重读  ' + (args.region || ''), kind: 'execute', rawInput: args.region }),
    }),
  ];
}

// ---------- Pro：Flash 全套 + 四个最重的形式化/分解/证明义务工具 ----------
function proExtraTools(deps) {
  return [
    defineTool({
      name: 'ultra_first_principles',
      description: 'Pro 专用：问题被经验套路或类比带偏、或需要从根上重建时调用。在 MAX 底座上把问题剥到不可再分的公理/定义/不变量，再逐层向上重建，显式标出哪一步原先依赖了未证假设。',
      parameters: {
        problem: { type: 'string', required: true, description: '要从第一性原理重建的问题。' },
        strip: { type: 'array', items: { type: 'string' }, description: '明确要求剥离的既有假设/惯例，可留空。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            axioms: { type: 'array', required: true, items: { type: 'string' } },
            rebuildChain: { type: 'array', required: true, items: { type: 'string' } },
            liftedAssumptions: { type: 'array', required: true, items: { type: 'string' } },
            conclusion: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.ran ? `第一性重建：\n公理层：${v.axioms.join('；') || '（见内）'}\n结论：${v.conclusion}` : '第一性重建通道暂不可用，请改用主流程推理。' }],
      },
      async execute(args, exec) {
        const empty = { ran: false, axioms: [], rebuildChain: [], liftedAssumptions: [], conclusion: '' };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.4, maxTokens: deps.strength().maxTokens,
          system: '你是第一性原理求解器，只输出严格 JSON。',
          prompt: [
            '把问题剥到不可再分的事实/定义/不变量（不引用惯例、类比、行业默认做法），再逐层重建到结论，逐层写清推导。',
            '【问题】\n' + clip(args.problem, 3000),
            asArr(args.strip).length ? '【必须剥离的假设】' + asArr(args.strip).join('；') : '',
            '只输出 JSON：{"axioms":["不可再分的公理/事实"],"rebuildChain":["从公理向上的每一层"],"liftedAssumptions":["被识别并移除的未证假设"],"conclusion":"重建后的最终结论"}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return empty;
        return {
          ran: true,
          axioms: asArr(r.json.axioms).map((x) => clip(x, 300)).slice(0, 10),
          rebuildChain: asArr(r.json.rebuildChain).map((x) => clip(x, 400)).slice(0, 12),
          liftedAssumptions: asArr(r.json.liftedAssumptions).map((x) => clip(x, 300)).slice(0, 10),
          conclusion: clip(r.json.conclusion, 2000),
        };
      },
      presentCall: (args) => ({ card: 'generic', title: '第一性原理重建', kind: 'execute', rawInput: args.problem }),
    }),

    defineTool({
      name: 'ultra_formalize',
      description: 'Pro 专用：自然语言描述容易含混、需要严格求解时调用。在 MAX 底座上把问题重写成方程/状态机/类型约束/形式逻辑之一，在形式层求解后无损映射回原问题，并列出形式化过程引入的注意点。',
      parameters: {
        problem: { type: 'string', required: true, description: '要形式化的问题。' },
        form: { type: 'string', required: true, enum: ['equation', 'statemachine', 'types', 'logic'], description: '形式化载体。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            formalModel: { type: 'string', required: true },
            solved: { type: 'string', required: true },
            mappedBack: { type: 'string', required: true },
            caveats: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.ran ? `形式化（${'见内'}）：\n模型：${v.formalModel}\n求解：${v.solved}\n映射回：${v.mappedBack}` : '形式化通道暂不可用，请改用主流程。' }],
      },
      async execute(args, exec) {
        const empty = { ran: false, formalModel: '', solved: '', mappedBack: '', caveats: [] };
        const formName = { equation: '方程/不等式组', statemachine: '状态机与转移', types: '类型与不变量约束', logic: '形式逻辑命题' }[args.form] || '方程';
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.3, maxTokens: deps.strength().maxTokens,
          system: '你是形式化求解器，只输出严格 JSON，符号必须良定义。',
          prompt: [
            `把下面问题无损重写为「${formName}」，先给良定义的符号，再在形式层严格求解，最后把形式解无损映射回原问题语义；任何在形式化中被丢掉或额外加入的假设都写进 caveats。`,
            '【问题】\n' + clip(args.problem, 3000),
            '只输出 JSON：{"formalModel":"符号定义与形式模型","solved":"形式层求解过程与结果","mappedBack":"映射回原问题的最终答案","caveats":["形式化注意点"]}',
          ].join('\n\n'),
        });
        if (!r.ok) return empty;
        return {
          ran: true,
          formalModel: clip(r.json.formalModel, 1800),
          solved: clip(r.json.solved, 1800),
          mappedBack: clip(r.json.mappedBack, 1800),
          caveats: asArr(r.json.caveats).map((x) => clip(x, 300)).slice(0, 8),
        };
      },
      presentCall: (args) => ({ card: 'generic', title: '形式化求解 · ' + args.form, kind: 'execute', rawInput: args.problem }),
    }),

    defineTool({
      name: 'ultra_decompose_dag',
      description: 'Pro 专用：面对一个复杂大任务时调用，在 MAX 底座上把它拆成互相正交、可独立验收的子任务，给出依赖关系 DAG、每个子任务的验收标准与一条关键路径，供多智能体/多步骤并行推进，避免子任务重叠或漏块。',
      parameters: {
        goal: { type: 'string', required: true, description: '复杂任务总目标。' },
        maxNodes: { type: 'integer', enum: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], description: '子任务上限，缺省 7。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            count: { type: 'integer', required: true },
            nodes: {
              type: 'array', required: true,
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  dependsOn: { type: 'array', required: true, items: { type: 'string' } },
                  acceptance: { type: 'string', required: true },
                },
              },
            },
            criticalPath: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_a, v) => [{ type: 'text', text: v.ran ? `任务分解为 ${v.count} 个正交子任务，关键路径：${v.criticalPath.join(' → ')}。` : '分解通道暂不可用，请手工拆解。' }],
      },
      async execute(args, exec) {
        const empty = { ran: false, count: 0, nodes: [], criticalPath: [] };
        const cap = Number(args.maxNodes) >= 3 && Number(args.maxNodes) <= 12 ? Number(args.maxNodes) : 7;
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.4, maxTokens: deps.strength().maxTokens,
          system: '你是任务分解器，子任务必须 MECE 正交、可独立验收，只输出严格 JSON。',
          prompt: [
            `把复杂总目标拆成不超过 ${cap} 个互相正交（不重叠、合起来穷尽）的子任务，显式给依赖（只依赖已声明的 id）、每个子任务可判定完成的验收标准，以及由依赖推出的一条关键路径 id 序列。`,
            '【总目标】\n' + clip(args.goal, 3000),
            '只输出 JSON：{"nodes":[{"id":"T1","title":"子任务","dependsOn":[],"acceptance":"验收标准"}],"criticalPath":["T1","T3"]}',
          ].join('\n\n'),
        });
        if (!r.ok) return empty;
        const ids = new Set();
        const nodes = asArr(r.json.nodes).slice(0, cap).map((n) => {
          const id = clip(n.id, 12) || ('T' + (ids.size + 1));
          ids.add(id);
          return { id, title: clip(n.title, 300), dependsOn: asArr(n.dependsOn).map((x) => clip(x, 12)).slice(0, 8), acceptance: clip(n.acceptance, 400) };
        });
        return { ran: true, count: nodes.length, nodes, criticalPath: asArr(r.json.criticalPath).map((x) => clip(x, 12)).filter((id) => ids.has(id)).slice(0, cap) };
      },
      presentCall: (args) => ({ card: 'generic', title: '正交子任务 DAG 分解', kind: 'execute', rawInput: args.goal }),
    }),

    defineTool({
      name: 'ultra_proof_obligations',
      description: 'Pro 专用：登记一个方案/证明要成立必须先闭合的全部“证明义务”，工具审计哪些仍是 open、哪些只是被当假设(assumed)蒙混、哪些被推迟(deferred)，强制逐条 close，防止结论建立在未证义务上。',
      parameters: {
        obligations: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              statement: { type: 'string', required: true, description: '必须被证明/保证的义务。' },
              state: { type: 'string', required: true, enum: ['open', 'proved', 'assumed', 'deferred'] },
              proof: { type: 'string', description: 'state=proved 时的依据。' },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            total: { type: 'integer', required: true },
            closed: { type: 'integer', required: true },
            openObligations: { type: 'array', required: true, items: { type: 'string' } },
            risks: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `证明义务：闭合 ${v.closed}/${v.total}。` + (v.openObligations.length ? '\n未闭合：\n' + v.openObligations.map((x) => '· ' + x).join('\n') : '') + (v.risks.length ? '\n风险：\n' + v.risks.map((x) => '· ' + x).join('\n') : '') }],
      },
      execute(args) {
        const list = asArr(args.obligations).filter((o) => o && String(o.id || '').trim()).slice(0, 16);
        const openObligations = [], risks = [];
        list.forEach((o) => {
          const id = clip(o.id, 12), st = ['open', 'proved', 'assumed', 'deferred'].includes(o.state) ? o.state : 'open';
          const stmt = clip(o.statement, 300);
          if (st !== 'proved') openObligations.push(`${id}: ${stmt}（${st}）`);
          if (st === 'assumed') risks.push(`${id} 仅被当作假设，尚未证明，结论对它敏感，需降级或补证`);
          if (st === 'deferred') risks.push(`${id} 被推迟，当前结论只在该义务成立时有效`);
          if (st === 'proved' && !String(o.proof || '').trim()) risks.push(`${id} 标 proved 却没给依据`);
        });
        return { total: list.length, closed: list.length - openObligations.length, openObligations: openObligations.slice(0, 16), risks: risks.slice(0, 16) };
      },
      presentCall: (args) => ({ card: 'generic', title: '证明义务清单', kind: 'other', rawInput: asArr(args.obligations).length + ' 项' }),
    }),

    defineTool({
      name: 'ultra_invariant_audit',
      description: 'Pro 专用：审查一个方案/系统/算法在所有执行路径下都必须恒成立的不变量（如状态守恒、边界不越界、数据一致、并发下不丢更新），在 MAX 底座上逐条寻找能破坏它的具体路径与输入，只有每条不变量都找不到反例路径才算通过。改代码、设计并发/状态机/数据结构时优先用。',
      parameters: {
        subject: { type: 'string', required: true, description: '被审查的方案/系统/算法描述。' },
        assumed: { type: 'array', items: { type: 'string' }, description: '你认为它必须满足的不变量，可留空由工具补全。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            invariants: { type: 'array', required: true, items: { type: 'string' } },
            violations: {
              type: 'array', required: true,
              items: { type: 'object', additionalProperties: false, properties: {
                invariant: { type: 'string', required: true },
                breakingPath: { type: 'string', required: true },
                fix: { type: 'string', required: true },
              } },
            },
            verdict: { type: 'string', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '不变量审计通道暂不可用，请在主流程手工枚举不变量。' }] : [{ type: 'text', text: `不变量审计：${v.invariants.length} 条不变量，${v.violations.length} 条被找到破坏路径。\n` + (v.violations.length ? v.violations.map((x) => `·[破坏] ${x.invariant}\n  路径：${x.breakingPath}\n  修法：${x.fix}`).join('\n') : '所有不变量在已知路径下均保持。') + '\n结论：' + v.verdict }],
      },
      async execute(args, exec) {
        const empty = { ran: false, invariants: [], violations: [], verdict: '' };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.35, maxTokens: deps.strength().maxTokens,
          system: '你是形式化审查者，专门找破坏不变量的具体执行路径与输入，只输出严格 JSON。',
          prompt: [
            '先列出该系统在任意执行路径（含并发、异常、边界、空输入、中断恢复）下都必须恒成立的不变量，再对每条构造最可能破坏它的具体路径；破坏得了就写 breakingPath 与修法，破坏不了就不列入 violations。',
            '【系统/方案】\n' + clip(args.subject, 3000),
            asArr(args.assumed).length ? '【已提出的不变量】\n' + asArr(args.assumed).join('\n') : '',
            '只输出 JSON：{"invariants":["不变量"],"violations":[{"invariant":"被破坏的不变量","breakingPath":"具体破坏路径/输入","fix":"使其重新恒成立的修法"}],"verdict":"总体判定一句话"}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return empty;
        if (exec && exec.agent) { try { exec.agent.session.append('ultra/invariant-audit', { n: asArr(r.json.invariants).length, bad: asArr(r.json.violations).length }); } catch { /* contained */ } }
        return {
          ran: true,
          invariants: asArr(r.json.invariants).map((x) => clip(x, 300)).slice(0, 12),
          violations: asArr(r.json.violations).slice(0, 12).map((x) => ({ invariant: clip(x.invariant, 300), breakingPath: clip(x.breakingPath, 500), fix: clip(x.fix, 400) })),
          verdict: clip(r.json.verdict, 800),
        };
      },
      presentCall: (args) => ({ card: 'generic', title: '不变量审计 · 全路径', kind: 'execute', rawInput: args.subject }),
    }),

    defineTool({
      name: 'ultra_reflection_chain',
      description: 'Pro 专用：对一份初稿/结论做多层“对反思的反思”——第1层挑错并修正，第2层批判第1层的反思是否片面，继续向上直到收益耗尽，输出每层要点与最终收敛结论。当你担心自己的自我修正流于表面、或高风险结论需要反复淬炼时用。',
      parameters: {
        draft: { type: 'string', required: true, description: '要被层层反思的初稿或结论。' },
        depth: { type: 'integer', enum: [2, 3, 4], description: '反思层数 2-4，缺省按 Ultra 档位。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            levels: { type: 'array', required: true, items: { type: 'string' } },
            converged: { type: 'boolean', required: true },
            final: { type: 'string', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '反思链通道暂不可用，请在主流程多做一次自我批判。' }] : [{ type: 'text', text: '反思链（' + v.levels.length + ' 层' + (v.converged ? '，已收敛' : '，达层数上限') + '）：\n' + v.levels.map((l, i) => `L${i + 1}：${l}`).join('\n') + '\n最终：' + v.final }],
      },
      async execute(args, exec) {
        const empty = { ran: false, levels: [], converged: false, final: '' };
        const depth = [2, 3, 4].includes(Number(args.depth)) ? Number(args.depth) : Math.min(4, Math.max(2, Math.round(deps.strength().lanes / 2) + 2));
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.4, maxTokens: deps.strength().maxTokens,
          system: '你执行递归反思：每一层都批判上一层，只输出严格 JSON，不重复套话。',
          prompt: [
            '对初稿做 ' + depth + ' 层递归反思：L1 挑错并修正；L2 批判 L1 的反思是否片面/过度/引入新错；L3 批判 L2，依此类推。每层给出实质要点，若某层已无新问题即收敛。',
            '【初稿】\n' + clip(args.draft, 3000),
            '只输出 JSON：{"levels":["L1要点","L2要点",...],"converged":是否在层数内已收敛(布尔),"final":"层层淬炼后的最终结论"}',
          ].join('\n\n'),
        });
        if (!r.ok) return empty;
        if (exec && exec.agent) { try { exec.agent.session.append('ultra/reflection-chain', { depth: asArr(r.json.levels).length }); } catch { /* contained */ } }
        return { ran: true, levels: asArr(r.json.levels).map((x) => clip(x, 600)).slice(0, depth), converged: !!r.json.converged, final: clip(r.json.final, 2000) };
      },
      presentCall: (args) => ({ card: 'generic', title: '反思链纵深 · ' + (args.depth || '') , kind: 'execute', rawInput: args.draft }),
    }),

    defineTool({
      name: 'ultra_decision_matrix',
      description: 'Pro 专用：多个候选方案/答案难以取舍时调用。沿统一维度（正确性、证据强度、风险、代价、可逆性、覆盖度）给每个候选打分并写理由，工具做确定性聚合与帕累托前沿筛选，输出排序与明确推荐，避免凭感觉选。多分支推演/多稿之后用它收敛。',
      parameters: {
        candidates: {
          type: 'array', required: true,
          items: { type: 'object', additionalProperties: false, properties: {
            name: { type: 'string', required: true, description: '候选方案名。' },
            scores: { type: 'object', additionalProperties: true, description: '维度->0到5分，缺项按0。' },
            reason: { type: 'string', description: '一句话理由。' },
          } },
        },
        weights: { type: 'object', additionalProperties: true, description: '维度权重(0-2)，缺省全1，如 {"风险":2}。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ranked: {
              type: 'array', required: true,
              items: { type: 'object', additionalProperties: false, properties: {
                name: { type: 'string', required: true },
                weighted: { type: 'number', required: true },
                pareto: { type: 'boolean', required: true },
                reason: { type: 'string', required: true },
              } },
            },
            recommend: { type: 'string', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: '方案锦标赛排序：\n' + v.ranked.map((c, i) => `${i + 1}. ${c.name}（加权 ${c.weighted}${c.pareto ? '·帕累托前沿' : ''}）${c.reason ? ' — ' + c.reason : ''}`).join('\n') + '\n推荐：' + v.recommend }],
      },
      execute(args, exec) {
        const DIMS = ['正确性', '证据强度', '风险', '代价', '可逆性', '覆盖度', 'correctness', 'evidence', 'risk', 'cost', 'reversibility', 'coverage'];
        const w = args.weights && typeof args.weights === 'object' ? args.weights : {};
        const rows = asArr(args.candidates).filter((c) => c && String(c.name || '').trim()).slice(0, 8).map((c) => {
          const sc = c.scores && typeof c.scores === 'object' ? c.scores : {};
          let sum = 0, wsum = 0;
          Object.keys(sc).forEach((d) => {
            const rawVal = Number(sc[d]); const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(5, rawVal)) : 0;
            const rawW = Number(w[d]); const ww = Number.isFinite(rawW) && rawW > 0 ? Math.max(0, Math.min(2, rawW)) : 1;
            // 风险/代价是负向维度：分高代表越可控（统一为越大越优），由调用方按同一口径打分
            sum += val * ww; wsum += ww;
          });
          return { name: clip(c.name, 120), weighted: wsum ? Math.round((sum / wsum) * 100) / 100 : 0, raw: sc, reason: clip(c.reason, 300) };
        });
        rows.sort((a, b) => b.weighted - a.weighted);
        // 帕累托前沿：不存在另一候选在所有维度都不差且至少一维严格更优
        const dimsUsed = new Set(); rows.forEach((r) => Object.keys(r.raw).forEach((d) => dimsUsed.add(d)));
        const dominates = (a, b) => { let oneStrict = false; for (const d of dimsUsed) { const va = Math.max(0, Math.min(5, Number(a.raw[d]) || 0)), vb = Math.max(0, Math.min(5, Number(b.raw[d]) || 0)); if (va < vb) return false; if (va > vb) oneStrict = true; } return oneStrict; };
        rows.forEach((r) => { r.pareto = !rows.some((o) => o !== r && dominates(o, r)); });
        const ranked = rows.map(({ raw, ...rest }) => ({ ...rest, reason: rest.reason || '' }));
        const best = ranked.find((r) => r.pareto) || ranked[0];
        if (exec && exec.agent) { try { exec.agent.session.append('ultra/decision-matrix', { n: ranked.length, top: best ? best.name : '' }); } catch { /* contained */ } }
        return { ranked, recommend: best ? best.name + '（加权 ' + best.weighted + '，处于帕累托前沿）' : '无有效候选' };
      },
      presentCall: (args) => ({ card: 'generic', title: '方案锦标赛矩阵', kind: 'other', rawInput: asArr(args.candidates).length + ' 个候选' }),
    }),
  ].concat(proFlagshipCore(deps), proFlagshipFormal(deps));
}

// 双模型工具集（严格包含、互不串档）：Flash 8 个；Vision = Flash 全套 + 8 个看图（共 16）；Pro = Flash 全套 + 7 重 + 6 旗舰（共 21，最多最深）。
function fallbackStrategy() {
  return { depth: 2, creativity: 1, rigor: 2, pace: 1, aggression: 1, selfCheckRounds: 1,
    parallel: 2, temperature: 0.4, retries: 1, compressKeep: 0.7, debateRounds: 2, lanes: 2, maxTokens: 900 };
}

// ========== 超级思考工具（Super Think）==========
// 开工前的超级思考由系统在请求前自动完成；本工具用于执行途中遇到"全新高难子问题"时补充深度推演。
// 【多次调用控制】受配置驱动：allowMultiple=false 时整个任务最多1次；true 时最多 maxCalls 次，两次调用间隔≥minIntervalSec。
// 闭包内做幂等防自激：短时间内对相似任务的重复调用直接返回"继续执行"信号，不再烧 token 重跑。
function createSuperThinkTool(deps, options = {}) {
  const allowMultiple = options.allowMultiple === true;
  const maxCalls = allowMultiple ? Math.max(1, Math.min(5, options.maxCalls || 2)) : 1;
  const minIntervalSec = allowMultiple ? Math.max(10, Math.min(300, options.minIntervalSec || 30)) : 120;
  let __lastAt = 0;
  let __lastKey = '';
  let __callCount = 0;
  const descSingle = '【可选·深度自我推演】对一个真正困难、且现有思考不足以覆盖的"全新子问题"做一次结构化深度推演。注意：开工前的超级思考已由系统在请求前自动完成，无需、也不要把本工具当作第一步反复调用；整个任务最多调用一次，调用后必须立即继续正式工作，严禁连环调用或以此停滞。简单任务不要调用。';
  const descMulti = `【可选·深度自我推演】对一个真正困难、且现有思考不足以覆盖的"全新子问题"做结构化深度推演。开工前的超级思考已由系统前置完成；本工具仅用于执行途中遇到全新高难子问题时补充。当前允许多次调用（最多${maxCalls}次，两次间隔≥${minIntervalSec}秒），每次调用后必须立即继续正式工作，严禁连环调用或以此停滞。简单任务不要调用。`;
  return defineTool({
    name: 'super_think',
    description: allowMultiple ? descMulti : descSingle,
    parameters: {
      task: { type: 'string', required: true, description: '需要进行超级思考的任务描述，必须完整、详细地描述用户的原始需求。' },
      depth: { type: 'string', description: '思考深度级别，可选：light/standard/deep/extreme。默认extreme（极限级）。', enum: ['light', 'standard', 'deep', 'extreme'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          thought: { type: 'string', required: true, description: '完整的思考过程，必须包含所有推理步骤、分析、自我反驳、交叉验证等。' },
          summary: { type: 'string', required: true, description: '思考结论的简要总结。' },
          steps: { type: 'integer', required: true, description: '思考的步数。' },
          duration_ms: { type: 'integer', required: true, description: '思考耗时（毫秒）。' },
          quality: { type: 'string', required: true, description: '思考质量评估。' },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.thought ? `🚀 【超级思考 Super Think】· 极限模式已激活\n\n${v.thought}\n\n思考结论：${v.summary}\n思考步数：${v.steps}步，耗时：${(v.duration_ms / 1000).toFixed(1)}秒\n质量评估：${v.quality}` : `🚀 【超级思考 Super Think】已完成\n${v.summary || ''}` }],
    },
    async execute(args, exec) {
      const started = Date.now();
      const llm = deps.getLlm();
      const task = String(args.task || '');
      const depth = args.depth || 'extreme';

      // 调用次数上限检查（多次调用模式下受 maxCalls 限制，单次模式下 maxCalls=1）
      if (__callCount >= maxCalls) {
        return {
          thought: `超级思考调用次数已达上限（${maxCalls}次）。前置超级思考已完成，请勿再次调用 super_think / Think 等思考类工具，立即基于已有结论继续正式工作：读取所需文件、调用真正的执行工具、产出结果。`,
          summary: `已达超级思考调用上限（${maxCalls}次），立即继续执行。`,
          steps: 0,
          duration_ms: Date.now() - started,
          quality: '次数上限短路（防滥用）',
        };
      }
      // 幂等防自激：minIntervalSec 秒内对同一/空任务再次调用，直接返回"继续执行"信号，不重跑、不烧 token，
      // 从工具侧根除 "I must call super_think first" 的连环调用死循环。
      const __key = task.replace(/\s+/g, '').slice(0, 80);
      if (__lastAt && (started - __lastAt) < minIntervalSec * 1000 && (__key === __lastKey || __key.length < 4)) {
        return {
          thought: `前置超级思考已完成，且你在 ${minIntervalSec} 秒内重复请求了同一思考。请勿再次调用 super_think / Think 等思考类工具，立即基于已有结论继续正式工作：读取所需文件、调用真正的执行工具、产出结果。`,
          summary: '已完成前置超级思考，请勿重复调用，立即继续执行。',
          steps: 0,
          duration_ms: Date.now() - started,
          quality: '幂等短路（防循环）',
        };
      }
      __lastAt = started; __lastKey = __key; __callCount++;

      // 根据深度级别设置思考参数
      const depthConfig = {
        light: { maxTokens: 2000, temperature: 0.7, label: '轻量级' },
        standard: { maxTokens: 4000, temperature: 0.6, label: '标准级' },
        deep: { maxTokens: 8000, temperature: 0.5, label: '深度级' },
        extreme: { maxTokens: 16000, temperature: 0.4, label: '极限级' },
      };
      const config = depthConfig[depth] || depthConfig.extreme;
      
      // 构建超级思考的提示词
      const superThinkPrompt = `你现在处于 Thinker Ultra 极限模式。请对以下任务进行一次完整的、超长的、深度的、极限的思考。

【任务】
${task}

【思考要求】
1. 思考时间不得少于30秒，思考内容不得少于2000字。
2. 必须按照以下步骤进行思考：
   ① 目标重述与本质提炼
   ② 约束条件穷举
   ③ 子目标原子级分解
   ④ 依赖关系有向图构建
   ⑤ 资源需求评估
   ⑥ 风险建模
   ⑦ 失败模式与效应分析（FMEA）
   ⑧ 反事实推演
   ⑨ 可证伪性检验
   ⑩ 鲁棒性边界探测
   ⑪ 多路径推演（正向推导、逆向归纳、类比迁移、第一性原理）
   ⑫ 多路径对比与融合
   ⑬ 制定带检查点的分阶段执行计划
   ⑭ 自我反驳（至少2轮）
   ⑮ 交叉验证（至少3种方法）
   ⑯ 反事实攻击（三维极限推演）
   ⑰ 元认知校验（至少2轮）
   ⑱ 思考质量自检
   ⑲ 终极收敛
3. 每完成一个大的阶段，都必须在该阶段开头显示一个小标题，如【①目标重述】【②约束穷举】等。
4. 思考过程必须完整可见，不得跳过、不得敷衍、不得提前终止。
5. 思考完成后，给出一个简要的总结和执行计划。

请开始你的超级思考：`;
      
      // 调用LLM进行超长深度思考
      const result = await sampleOnce(llm, {
        provider: deps.provider,
        model: deps.model,
        system: '你是一个超级思考引擎，专门进行超长、深度、极限的思考。你的思考必须完整、详细、结构化。',
        prompt: superThinkPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
      
      const duration = Date.now() - started;
      const thought = result.text || '';
      const steps = (thought.match(/【[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲]/g) || []).length;
      
      // 生成思考总结
      let summary = '';
      if (thought.length > 100) {
        // 尝试提取最后一段作为总结
        const paragraphs = thought.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        if (paragraphs.length > 0) {
          summary = paragraphs[paragraphs.length - 1].trim().substring(0, 500);
        }
      }
      if (!summary) {
        summary = thought.substring(0, 500) + (thought.length > 500 ? '...' : '');
      }
      
      // 思考质量评估
      let quality = '基础';
      if (thought.length > 2000) quality = '良好';
      if (thought.length > 5000) quality = '优秀';
      if (thought.length > 10000) quality = '卓越';
      if (steps >= 15) quality += '，结构完整';
      
      return {
        thought,
        summary,
        steps: steps || 1,
        duration_ms: duration,
        quality,
      };
    },
    presentCall: (args) => ({ 
      card: 'generic', 
      title: '🚀 超级思考 Super Think · 极限模式', 
      kind: 'execute', 
      rawInput: String(args.task || '').substring(0, 100) 
    }),
  });
}

// 模型档归一：兼容全名（deepseek-flash / deepseek-v4-pro / ...-vision-exp）与短名（flash/vision/pro）。
// 运行时 detectModel 只产出全名；vision 是 Flash 通道看图时的视觉档（由 syncer 按 hasImage 升级）。
function normTier(t) {
  const k = String(t || '').toLowerCase();
  if (k.includes('pro')) return 'pro';
  if (k.includes('vision')) return 'vision';
  if (k.includes('flash') || k.includes('vl') || k.includes('image') || k.includes('multimodal')) return 'flash';
  return 'flash';
}

function buildToolset(modelTier, deps) {
  // 从滑杆配置读取多次超级思考选项（开关+最大次数+最小间隔）
  let multiStOpts = {};
  try {
    const sl = (typeof deps.sliders === 'function' ? deps.sliders() : {}) || {};
    multiStOpts = {
      allowMultiple: sl.multiSuperThink === true || sl.allowMultiSuperThink === true,
      maxCalls: Number(sl.multiSuperThinkMax) || 2,
      minIntervalSec: Number(sl.multiSuperThinkInterval) || 30,
    };
  } catch { /* 降级为单次调用 */ }
  // 超级思考工具（放在最前面）
  const superThinkTool = createSuperThinkTool(deps, multiStOpts);
  // UTP：魔鬼代言人三工具 + 自重构链路两阶段 + 八滑杆策略契约，双模型全挂，深度由 deps.strategy 按模型区分
  const utp = buildUtpTools(deps);
  // 代码理解与分析工具箱（6个工具）：经 ultra-tool-adapter 补齐 parameters/output 契约后恢复
  const codeTools = createCodeTools(deps);
  // 文档处理与知识管理工具箱（6个工具）
  const docTools = createDocTools(deps);
  // 学习辅助与创意工具箱（6个工具）
  const learningCreativeTools = createLearningCreativeTools(deps);
  // 数据分析与可视化工具箱（6个工具）
  const dataTools = createDataTools(deps);
  // 项目管理与生产力工具箱（6个工具）
  const productivityTools = createProductivityTools(deps);
  // v0.1 基础认知工具（理解/前提/一致性/多视角/红队/验收）双模型全挂，Pro/Vision 再各自叠加
  const base = [superThinkTool].concat(flashTools(deps)).concat(utp).concat(codeTools).concat(docTools).concat(learningCreativeTools).concat(dataTools).concat(productivityTools).concat(flashExtraTools(deps)).concat(flashExtraTools2(deps)).concat(flashExtraTools3(deps)).concat(flashExtraTools4(deps));
  // 模型档归一：兼容全名（deepseek-flash/deepseek-v4-pro）与短名；vision 是 Flash 看图视觉档
  const tier = normTier(modelTier);
  // 严格包含分层：flash 文本档无视觉；vision/pro 追加视觉；pro 再追加 Pro 专属高阶
  const list = (tier === 'vision' || tier === 'pro')
    ? base.concat(visionExtraTools(deps), tier === 'pro' ? proExtraTools(deps).concat(proExtraTools5(deps)) : [])
    : base;
  // 【四模式独立工具集】按 model × mode 追加专属工具，每个模式独立容器、不共用
  let modeTools = [];
  try {
    const sl = (deps && typeof deps.sliders === 'function') ? deps.sliders() : {};
    const ocMode = sl.ocMode || sl.mode || (sl.apex ? 'apex' : 'velocity');
    const isApex = ocMode === 'apex' || ocMode === '极境' || sl.apex === true;
    if (tier === 'pro') {
      modeTools = isApex ? proApexTools(deps) : proVelocityTools(deps);
    } else {
      // flash / vision 同属 Flash 通道，统一用 flash 模式工具（绝不串到 pro）
      modeTools = isApex ? flashApexTools(deps) : flashVelocityTools(deps);
    }
  } catch { modeTools = []; }
  const finalList = list.concat(modeTools);
  // 先按语言本地化（英文模式替换标题/描述），再统一补齐契约；顺序保证 presentResult 引用英文化后的 presentCall。
  let lang = 'zh';
  try { lang = deps && typeof deps.lang === 'function' ? (deps.lang() || 'zh') : 'zh'; } catch { lang = 'zh'; }
  const atomicTools = localizeList(finalList, lang).map((t) => normalizeTool(t));
  // 按模型档分层合并：flash=7 / vision=8 / pro=9（严格递增），sub_action 路由到原子工具
  return buildMergedTools(atomicTools, deps, tier);
}

/**
 * 造一个按会话同步工具挂载的同步器。
 * deps: {
 *   isActive(agentId) -> bool,              // 是否选中 Ultra（底座 MAX）
 *   modelKeyOf(agent) -> 'flash'|'vision'|'pro'|'',
 *   getLlm() -> llm,
 *   strength() -> { lanes, maxTokens },     // 由当前档位实时决定工具内部强度
 *   provider?, model?, log?
 * }
 * 返回 { sync(agent), disposeAll() }。
 */
export function createUltraToolsSyncer(deps) {
  const mounted = new Map(); // agentId -> rec {key,agent,map,offs,svc,fiber,fp,fuse,disposed}
  const log = typeof deps.log === "function" ? deps.log : () => {};

  function serviceReady(actx) {
    try {
      if (actx.tools && typeof actx.tools.register === "function") return actx.tools;
      if (typeof actx.get === "function") { const svc = actx.get("tools"); if (svc && typeof svc.register === "function") return svc; }
    } catch { /* fall through */ }
    return null;
  }
  function toolDepsFor(agent) {
    return {
      getLlm: () => deps.getLlm(),
      strength: () => { try { return deps.strength() || { lanes: 2, maxTokens: 900 }; } catch { return { lanes: 2, maxTokens: 900 }; } },
      provider: deps.provider, model: deps.model, log,
      strategy: () => { try { return deps.strategy ? deps.strategy() : fallbackStrategy(); } catch { return fallbackStrategy(); } },
      sliders: () => { try { return deps.sliders ? deps.sliders() : {}; } catch { return {}; } },
      lang: () => { try { return deps.lang ? deps.lang() : "zh"; } catch { return "zh"; } },
      modelTier: (a) => { try { return deps.modelKeyOf ? deps.modelKeyOf(a) : "pro"; } catch { return "pro"; } },
    };
  }
  // 当前能量配置（决定哪些工具上线）。任何异常都安全降级。
  function configFor(agent, key) {
    let lang = 'zh';
    try { lang = deps.lang ? (deps.lang() || 'zh') : 'zh'; } catch { lang = 'zh'; }
    const withLang = (o) => Object.assign({}, o, { lang: o && o.lang ? o.lang : lang });
    try {
      if (typeof deps.activeConfig === "function") return withLang(deps.activeConfig(agent, key) || { ultraOn: true, sliders: {}, modules: {}, hasImage: false });
      return withLang({ ultraOn: true, sliders: deps.sliders ? deps.sliders() : {}, modules: {}, hasImage: false });
    } catch { return { ultraOn: true, sliders: {}, modules: {}, hasImage: false, lang }; }
  }

  // 全名/短名 → 三档之一；Flash 通道在「看图」时升级到视觉档（视觉合并工具随之上线）
  function effectiveTier(rawKey, agent) {
    const base = normTier(rawKey);
    if (base !== 'flash') return base;
    try {
      const cfg = typeof deps.activeConfig === 'function' ? deps.activeConfig(agent, rawKey) : null;
      if (cfg && cfg.hasImage === true) return 'vision';
    } catch { /* 读取失败按纯文本 flash */ }
    return 'flash';
  }

  function buildMap(key, agent) {
    const arr = buildToolset(key, toolDepsFor(agent));
    const m = new Map();
    for (const x of arr) { const t = normalizeTool(x); m.set(t.name, t); }
    return m;
  }

  // 在已就绪的 tools 服务上做最小 diff 挂载：只注销被移除的、只注册新加入的。
  function reconcile(rec, svc) {
    const cfg = configFor(rec.agent, rec.key);
    const allNames = Array.from(rec.map.keys()); // 该档真实全集；门控决定当前外露集合
    // 三层熔断之「连续轮次 + 总 token 预算」：每会话一个 fuse，按 oc 模式/激进度/Token 档动态定硬顶
    const ocNow = cfg.oc || {};
    const fuseMode = ocNow.mode === 'apex' ? 'apex' : 'velocity';
    if (!rec.fuse) rec.fuse = new ToolChainFuse({ maxRounds: roundLimitFor(fuseMode, ocNow.toolAggro), totalTokenBudget: tokenBudgetFor(ocNow.token) });
    else rec.fuse.reconfigure({ mode: fuseMode, toolAggro: ocNow.toolAggro, tokenTier: ocNow.token });
    rec.fp = fingerprint(rec.key, cfg, allNames);
    const target = activeToolNames(rec.key, cfg, allNames);
    const want = new Set(target);
    for (const name of Array.from(rec.offs.keys())) {
      if (!want.has(name)) { try { rec.offs.get(name) && rec.offs.get(name)(); } catch { /* contained */ } rec.offs.delete(name); }
    }
    for (const name of target) {
      if (rec.offs.has(name)) continue;
      const bare = rec.map.get(name);
      if (!bare) continue;
      const tool = rec.fuse.wrap(bare); // 注册前统一包一层熔断（单工具超时由 normalizeTool 承担，三层在此闭合）
      try {
        const off = svc.register(tool);
        if (typeof off === "function") rec.offs.set(name, off);
      } catch (e) {
        log("ultra-tools register " + name + " failed: " + String(e));
      }
    }
    return target.length;
  }

  function unmount(agentId) {
    const rec = mounted.get(agentId);
    if (!rec) return;
    try { rec.dispose && rec.dispose(); } catch (e) { log("ultra-tools unmount failed: " + String(e)); }
    mounted.delete(agentId);
  }

  function mount(agent, key) {
    const actx = agent && agent.ctx;
    if (!actx) return false;
    let builtMap = null;
    try {
      builtMap = buildMap(key, agent);
    } catch (e) {
      log("ultra-tools buildMap failed: " + String(e));
      return false;
    }
    const rec = { key, agent, map: builtMap, offs: new Map(), svc: null, fiber: null, fp: null, fuse: null, disposed: false };
    rec.dispose = () => {
      if (rec.disposed) return; rec.disposed = true;
      for (const off of rec.offs.values()) { try { off && off(); } catch { /* contained */ } }
      rec.offs.clear();
      try { rec.fiber && typeof rec.fiber.dispose === "function" && rec.fiber.dispose(); } catch { /* contained */ }
    };
    const ready = serviceReady(actx);
    if (ready) {
      try {
        rec.svc = ready;
        const n = reconcile(rec, ready);
        mounted.set(agent.id, rec);
        log("ultra-tools mounted " + agent.id + " tier=" + key + " active=" + n + "/" + rec.map.size);
        return true;
      } catch (e) {
        log("ultra-tools reconcile failed: " + String(e));
        return false;
      }
    } else if (typeof actx.inject === "function") {
      try {
        rec.fiber = actx.inject(["tools"], (scope) => {
          // fiber 拿到服务可能晚于多次 sync：注册时一律按「最新配置」对齐，避免闭包旧值。
          if (!rec.disposed && scope && scope.tools) { rec.svc = scope.tools; const n = reconcile(rec, scope.tools); mounted.set(agent.id, rec); log("ultra-tools(inject) " + agent.id + " active=" + n); }
          return rec.dispose;
        });
        mounted.set(agent.id, rec);
        return true;
      } catch (e) { log("ultra-tools inject tools failed: " + String(e)); return false; }
    }
    return false;
  }

  return {
    // 每请求调用：关 Ultra 全卸；切模型/看图升档换套；同档则按配置指纹做最小 diff（拖杆/开关即时上下线）。
    sync(agent) {
      if (!agent || !agent.id) return;
      let raw = null;
      try { if (deps.isActive(agent.id)) raw = deps.modelKeyOf(agent) || null; } catch { raw = null; }
      const cur = mounted.get(agent.id);
      if (!raw) { if (cur) unmount(agent.id); return; }
      const desired = effectiveTier(raw, agent);
      if (!cur) { mount(agent, desired); return; }
      if (cur.key !== desired) { unmount(agent.id); mount(agent, desired); return; }
      if (cur.svc) {
        const cfg = configFor(agent, desired);
        const fp = fingerprint(desired, cfg, Array.from(cur.map.keys()));
        if (fp !== cur.fp) reconcile(cur, cur.svc); // 配置变了：最小 diff
      }
    },
    unmount(agentId) { unmount(agentId); },
    disposeAll() { for (const id of Array.from(mounted.keys())) unmount(id); },
    mountedCount(agentId) { const c = mounted.get(agentId); return c ? c.offs.size : 0; },
    mountedTier(agentId) { const c = mounted.get(agentId); return c ? c.key : null; },
    // 当前真正注册给该 agent、模型可见的工具名（SOP 注入的唯一真相，避免"手册有、工具无"）
    activeNames(agentId) { const c = mounted.get(agentId); return c ? Array.from(c.offs.keys()).sort() : []; },
    catalogNames(agentId) { const c = mounted.get(agentId); return c ? Array.from(c.map.keys()).sort() : []; },
  };
}

export default { createUltraToolsSyncer, buildToolset };
