// ultra-flash-tools-4.js — v0.1 Flash 认知工具箱·第四批（路由/检查单/陷阱/证伪/敏感性/因果链）
// 补齐认知闭环最后缺口；范式同前三批：纯分析可并发、内部 MAX、失败必降级。
import { defineUltraTool } from './ultra-tool-factory.js';
import { maxJson, routeOf, clip, asArr, parallelLanes } from './ultra-llm.js';

export function flashExtraTools4(deps) {
  const st = () => { try { return deps.strength() || { lanes: 2, maxTokens: 900 }; } catch { return { lanes: 2, maxTokens: 900 }; } };

  // 1) 问题分类与解法路由：先判类型再选方法，避免用错套路（plan/deep 供能）
  const problemRoute = defineUltraTool({
    name: 'ultra_problem_route',
    title: '问题类型路由',
    kind: 'search', parallel: true, timeoutMs: 22000,
    description: '开工第一步、不确定该用什么方法时调用：判定问题类型（计算/证明/设计/排查/解释/对比/规划/创作），给出最匹配的解法路线、应优先调用的工具顺序，以及这类问题最容易误用的套路。防止一上来就用错方法。',
    parameters: { problem: { type: 'string', required: true, description: '待分类与路由的原始问题。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      kind: { type: 'string', required: true }, route: { type: 'array', required: true, items: { type: 'string' } },
      toolOrder: { type: 'array', required: true, items: { type: 'string' } }, avoid: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: `类型：${v.kind}\n路线：${v.route.join(' → ')}\n建议工具序：${v.toolOrder.join('、') || '直答'}\n避坑：${v.avoid}` }],
    degrade: () => ({ kind: '', route: [], toolOrder: [], avoid: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.25, maxTokens: s.maxTokens,
        prompt: ['判定问题类型并给解法路线：kind 取 计算/证明/设计/排查/解释/对比/规划/创作 之一；route 给有序步骤；toolOrder 从 [ultra_parse_intent,ultra_step_plan,ultra_assumption_extract,ultra_persona_lens,ultra_counter_search,ultra_numeric_recheck,ultra_bestof_compete,ultra_acceptance_gate] 里挑有序子集（简单题可空）；avoid 写最该避免的误用套路。',
          '【问题】' + clip(args.problem, 3000),
          '只输出 JSON：{"kind":"","route":[""],"toolOrder":[""],"avoid":""}'].join('\n\n') });
      if (!r.ok) return { kind: '', route: [], toolOrder: [], avoid: '' };
      return { kind: clip(r.json.kind, 40), route: asArr(r.json.route).map((x) => clip(x, 160)).slice(0, 8), toolOrder: asArr(r.json.toolOrder).map((x) => clip(x, 80)).slice(0, 8), avoid: clip(r.json.avoid, 300) };
    },
  });

  // 2) 质量检查单：把任务转成可逐项勾验的验收维度（format/verify 供能）
  const qualityChecklist = defineUltraTool({
    name: 'ultra_quality_checklist',
    title: '质量检查单生成',
    kind: 'execute', parallel: true, timeoutMs: 23000,
    description: '交付前、或需要确保不遗漏质量维度时调用：针对这类产出生成一份可逐项判定的检查单（正确性/完整/一致/边界/可读/安全等），每项给判定方法，配合 ultra_acceptance_gate 使用。',
    parameters: { task: { type: 'string', required: true, description: '任务或产出类型。' }, deliverable: { type: 'string', description: '已完成的产出，可留空只生成检查单。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      items: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        point: { type: 'string', required: true }, how: { type: 'string', required: true } } } } } },
    render: (_a, v) => [{ type: 'text', text: `质量检查单 ${v.items.length} 项：\n` + v.items.map((x, i) => `${i + 1}. ${x.point}（怎么查：${x.how}）`).join('\n') }],
    degrade: () => ({ items: [] }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
        prompt: ['为该任务生成 6-10 条可独立判定的质量检查项，覆盖正确性/完整性/一致性/边界/可读性/安全与合规，每条给可操作的判定方法 how，不要空泛。',
          '【任务】' + clip(args.task, 2500), args.deliverable ? '【产出】' + clip(args.deliverable, 2500) : '',
          '只输出 JSON：{"items":[{"point":"","how":""}]}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { items: [] };
      return { items: asArr(r.json.items).map((x) => ({ point: clip(x && x.point, 200), how: clip(x && x.how, 200) })).filter((x) => x.point).slice(0, 10) };
    },
  });

  // 3) 经典陷阱扫描（falsify/critique 供能）
  const pitfallScan = defineUltraTool({
    name: 'ultra_pitfall_scan',
    title: '经典陷阱扫描',
    kind: 'search', parallel: true, timeoutMs: 23000,
    description: '当进入某类熟悉但容易反复踩坑的任务（并发、时区、浮点、索引、统计、单位、因果混淆等）时调用：列出该场景最常见的陷阱与本例是否已中招，给规避写法。用前人教训换少走弯路。',
    parameters: { scenario: { type: 'string', required: true, description: '场景描述或当前做法。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      pitfalls: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        trap: { type: 'string', required: true }, hitsHere: { type: 'boolean', required: true }, guard: { type: 'string', required: true } } } } } },
    render: (_a, v) => [{ type: 'text', text: `陷阱 ${v.pitfalls.length}：\n` + v.pitfalls.map((x) => `·${x.hitsHere ? '【本例疑似中招】' : ''}${x.trap} → ${x.guard}`).join('\n') }],
    degrade: () => ({ pitfalls: [] }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.4, maxTokens: s.maxTokens,
        prompt: ['列出该场景最经典、最高发的陷阱，逐个判断在当前做法里是否疑似中招(hitsHere)，给一句可落地的规避写法。只列真正高发的，不堆砌。',
          '【场景/做法】' + clip(args.scenario, 3500),
          '只输出 JSON：{"pitfalls":[{"trap":"","hitsHere":布尔,"guard":""}]}'].join('\n\n') });
      if (!r.ok) return { pitfalls: [] };
      return { pitfalls: asArr(r.json.pitfalls).map((x) => ({ trap: clip(x && x.trap, 220), hitsHere: !!(x && x.hitsHere), guard: clip(x && x.guard, 220) })).filter((x) => x.trap).slice(0, 10) };
    },
  });

  // 4) 最快证伪实验设计（falsify/branch 供能）
  const falsifyExperiment = defineUltraTool({
    name: 'ultra_falsify_experiment',
    title: '证伪实验设计',
    kind: 'execute', parallel: true, timeoutMs: 25000,
    description: '当你倾向相信某个假设/方案正确时调用：设计能以最小代价最快推翻它的测试或反例（边界输入、对照、关键观测点、通过/推翻判据）。先想着怎么证明自己错，而不是找理由对。',
    parameters: { hypothesis: { type: 'string', required: true, description: '当前倾向相信的假设或方案。' }, constraints: { type: 'string', description: '测试资源/环境约束，可留空。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      tests: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        test: { type: 'string', required: true }, observe: { type: 'string', required: true }, falsifyIf: { type: 'string', required: true } } } },
      fastest: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: `证伪实验 ${v.tests.length}：\n` + v.tests.map((x, i) => `${i + 1}. ${x.test}｜观测：${x.observe}｜若 ${x.falsifyIf} 则推翻`).join('\n') + `\n最快一招：${v.fastest}` }],
    degrade: () => ({ tests: [], fastest: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.45, maxTokens: s.maxTokens,
        prompt: ['为该假设设计 3-5 个以最小代价最快证伪它的实验：每个写清怎么做(test)、观测什么(observe)、出现什么结果就判定假设被推翻(falsifyIf)；最后给最快、最省的一招 fastest。',
          '【假设】' + clip(args.hypothesis, 3000), args.constraints ? '【约束】' + clip(args.constraints, 1200) : '',
          '只输出 JSON：{"tests":[{"test":"","observe":"","falsifyIf":""}],"fastest":""}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { tests: [], fastest: '' };
      return { tests: asArr(r.json.tests).map((x) => ({ test: clip(x && x.test, 240), observe: clip(x && x.observe, 200), falsifyIf: clip(x && x.falsifyIf, 200) })).filter((x) => x.test).slice(0, 6), fastest: clip(r.json.fastest, 300) };
    },
  });

  // 5) 敏感性/翻转阈值分析（verify/exec 供能）
  const sensitivity = defineUltraTool({
    name: 'ultra_sensitivity',
    title: '敏感性与翻转阈值',
    kind: 'search', parallel: true, timeoutMs: 24000,
    description: '当结论依赖若干数值/假设、需要知道它稳不稳时调用：找出结论对哪些输入最敏感、估计使结论翻转的临界阈值，给出稳健区间与需要锁死的关键参数。回答"变多少结论就不成立"。',
    parameters: { conclusion: { type: 'string', required: true, description: '当前结论及其依赖的输入/假设。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      drivers: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        input: { type: 'string', required: true }, sensitivity: { type: 'string', required: true, enum: ['high', 'med', 'low'] }, threshold: { type: 'string', required: true } } } },
      robustRange: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.drivers.map((x) => `·[${x.sensitivity}] ${x.input}：翻转阈值 ${x.threshold}`).join('\n') + `\n稳健区间：${v.robustRange}` }],
    degrade: () => ({ drivers: [], robustRange: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.35, maxTokens: s.maxTokens,
        prompt: ['分析结论对各输入/假设的敏感性：sensitivity 取 high|med|low，threshold 估计使结论翻转的临界值或方向，最后给稳健区间 robustRange。无法定量就给定性方向，不许编造精确数字。',
          '【结论与依赖】' + clip(args.conclusion, 3500),
          '只输出 JSON：{"drivers":[{"input":"","sensitivity":"high|med|low","threshold":""}],"robustRange":""}'].join('\n\n') });
      if (!r.ok) return { drivers: [], robustRange: '' };
      const LV = { high: 1, med: 1, low: 1 };
      return { drivers: asArr(r.json.drivers).map((x) => ({ input: clip(x && x.input, 160), sensitivity: LV[x && x.sensitivity] ? x.sensitivity : 'med', threshold: clip(x && x.threshold, 200) })).filter((x) => x.input).slice(0, 8), robustRange: clip(r.json.robustRange, 300) };
    },
  });

  // 6) 因果链重建与断点（deep/deps 供能）
  const causalChain = defineUltraTool({
    name: 'ultra_causal_chain',
    title: '因果链重建',
    kind: 'search', parallel: true, timeoutMs: 24000,
    description: '排查问题根因、或需要理清"为什么会这样"时调用：把现象沿因果往回追成一条有序链，标出已证实/推测/缺失的环节与最可能的断点（根因），区分相关与因果。',
    parameters: { phenomenon: { type: 'string', required: true, description: '现象/故障/结果描述与已知线索。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      chain: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        node: { type: 'string', required: true }, status: { type: 'string', required: true, enum: ['proven', 'guessed', 'missing'] } } } },
      rootCause: { type: 'string', required: true }, correlationWarnings: { type: 'array', required: true, items: { type: 'string' } } } },
    render: (_a, v) => [{ type: 'text', text: v.chain.map((x) => `[${x.status}] ${x.node}`).join(' → ') + `\n最可能根因：${v.rootCause}` + (v.correlationWarnings.length ? `\n相关≠因果：${v.correlationWarnings.join('；')}` : '') }],
    degrade: () => ({ chain: [], rootCause: '', correlationWarnings: [] }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.35, maxTokens: s.maxTokens,
        prompt: ['沿因果往回重建有序链：每环节标 proven(已证实)/guessed(推测)/missing(缺证据)，指出最可能的断点根因 rootCause，并把"只是相关、未必因果"的地方列入 correlationWarnings。',
          '【现象与线索】' + clip(args.phenomenon, 3500),
          '只输出 JSON：{"chain":[{"node":"","status":"proven|guessed|missing"}],"rootCause":"","correlationWarnings":[""]}'].join('\n\n') });
      if (!r.ok) return { chain: [], rootCause: '', correlationWarnings: [] };
      const ST = { proven: 1, guessed: 1, missing: 1 };
      return {
        chain: asArr(r.json.chain).map((x) => ({ node: clip(x && x.node, 220), status: ST[x && x.status] ? x.status : 'guessed' })).filter((x) => x.node).slice(0, 12),
        rootCause: clip(r.json.rootCause, 300),
        correlationWarnings: asArr(r.json.correlationWarnings).map((x) => clip(x, 200)).slice(0, 5),
      };
    },
  });

  return [problemRoute, qualityChecklist, pitfallScan, falsifyExperiment, sensitivity, causalChain];
}

export const FLASH_EXTRA4_NAMES = [
  'ultra_problem_route', 'ultra_quality_checklist', 'ultra_pitfall_scan',
  'ultra_falsify_experiment', 'ultra_sensitivity', 'ultra_causal_chain',
];
