// ultra-flash-tools-3.js — v0.1 Flash 认知工具箱·第三批（复算/步骤/风险/对比/类比/摘要）
import { defineUltraTool } from './ultra-tool-factory.js';
import { maxJson, routeOf, clip, asArr, parallelLanes } from './ultra-llm.js';

export function flashExtraTools3(deps) {
  const st = () => { try { return deps.strength() || { lanes: 2, maxTokens: 900 }; } catch { return { lanes: 2, maxTokens: 900 }; } };

  // 1) 数值独立复算：用第二种方法重算关键数值并比对（verify/exec 供能）
  const numericRecheck = defineUltraTool({
    name: 'ultra_numeric_recheck',
    title: '数值独立复算',
    kind: 'execute', parallel: true, timeoutMs: 26000,
    description: '当答案包含关键计算结果、统计数字、单位换算或公式推导时调用：用与原方法不同的第二条独立路径重算，两路一致才确认，不一致就定位偏差来源并给修正值。专治"看起来对其实算错"。',
    parameters: {
      expression: { type: 'string', required: true, description: '需要复算的问题、原始算式或结论，写清已知量与单位。' },
      original: { type: 'string', description: '第一次得到的结果与算法，供比对。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      method: { type: 'string', required: true }, recomputed: { type: 'string', required: true },
      agrees: { type: 'boolean', required: true }, corrected: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: `独立复算（${v.method}）：${v.recomputed} — ${v.agrees ? '与原结果一致' : '不一致！修正：' + v.corrected}` }],
    degrade: () => ({ method: '', recomputed: '', agrees: true, corrected: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.1, maxTokens: s.maxTokens,
        prompt: ['用一条与原始解法明显不同的独立路径（换公式/换顺序/倒推/量纲检查/估算区间）重新计算，逐步写出，最后给数值结果，并判断与原结果是否一致；不一致指出错处与修正值。',
          '【待复算】' + clip(args.expression, 3000), args.original ? '【原结果/解法】' + clip(args.original, 2000) : '',
          '只输出 JSON：{"method":"第二种方法名","recomputed":"逐步与结果","agrees":布尔,"corrected":"不一致时的修正值，一致留空"}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { method: '', recomputed: '', agrees: true, corrected: '' };
      return { method: clip(r.json.method, 80), recomputed: clip(r.json.recomputed, 900), agrees: !!r.json.agrees, corrected: clip(r.json.corrected, 400) };
    },
  });

  // 2) 可执行步骤序列：排依赖、每步验收、关键路径（plan/exec 供能）
  const stepPlan = defineUltraTool({
    name: 'ultra_step_plan',
    title: '步骤序列规划',
    kind: 'execute', parallel: true, timeoutMs: 26000,
    description: '当任务需要多步执行、有先后依赖或容易漏步时调用：把目标拆成有序、可执行、可验收的步骤，标注每步依赖与完成判据，识别关键路径与可并行项，输出可直接照做的序列。',
    parameters: { goal: { type: 'string', required: true, description: '要规划的目标/任务。' }, constraints: { type: 'string', description: '约束条件，可留空。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      steps: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        step: { type: 'string', required: true }, dependsOn: { type: 'array', required: true, items: { type: 'integer' } }, doneWhen: { type: 'string', required: true } } } },
      criticalPath: { type: 'array', required: true, items: { type: 'integer' } } } },
    render: (_a, v) => [{ type: 'text', text: `步骤序列 ${v.steps.length} 步：\n` + v.steps.map((x, i) => `${i + 1}. ${x.step}（依赖[${(x.dependsOn || []).map((d) => d + 1).join(',') || '无'}]，完成判据：${x.doneWhen}）`).join('\n') + `\n关键路径：${v.criticalPath.map((i) => i + 1).join('→')}` }],
    degrade: () => ({ steps: [], criticalPath: [] }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
        prompt: ['把目标拆成有序可执行步骤：每步写清动作、依赖哪些前序步骤(用从0开始的下标数组)、可判定的完成判据；最后给关键路径下标数组与可并行项。不要空话。',
          '【目标】' + clip(args.goal, 3000), args.constraints ? '【约束】' + clip(args.constraints, 1500) : '',
          '只输出 JSON：{"steps":[{"step":"","dependsOn":[0],"doneWhen":""}],"criticalPath":[0]}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { steps: [], criticalPath: [] };
      const steps = asArr(r.json.steps).map((x) => ({ step: clip(x && x.step, 300), dependsOn: asArr(x && x.dependsOn).map(Number).filter(Number.isFinite), doneWhen: clip(x && x.doneWhen, 200) })).filter((x) => x.step).slice(0, 15);
      return { steps, criticalPath: asArr(r.json.criticalPath).map(Number).filter(Number.isFinite) };
    },
  });

  // 3) 风险登记（verify/plan 供能）
  const riskRegister = defineUltraTool({
    name: 'ultra_risk_register',
    title: '风险登记与缓解',
    kind: 'search', parallel: true, timeoutMs: 25000,
    description: '在方案/计划执行前调用：识别可能失败的风险，逐个评估概率与影响、给出预防措施、应急预案和早期触发信号，按风险值排序。用于提前排雷而不是事后补救。',
    parameters: { plan: { type: 'string', required: true, description: '待评估的方案或计划。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      risks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        risk: { type: 'string', required: true }, probability: { type: 'string', required: true, enum: ['low', 'med', 'high'] }, impact: { type: 'string', required: true, enum: ['low', 'med', 'high'] },
        prevent: { type: 'string', required: true }, signal: { type: 'string', required: true } } } } } },
    render: (_a, v) => [{ type: 'text', text: `风险 ${v.risks.length} 项：\n` + v.risks.map((x) => `·[${x.probability}/${x.impact}] ${x.risk}｜预防：${x.prevent}｜预警：${x.signal}`).join('\n') }],
    degrade: () => ({ risks: [] }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.4, maxTokens: s.maxTokens,
        prompt: ['识别执行该方案最现实的失败风险，每项给概率/影响(low|med|high)、预防措施、能最早发现它的触发信号，按风险高低排序。不要列不可能的杞人忧天项。',
          '【方案】' + clip(args.plan, 3500),
          '只输出 JSON：{"risks":[{"risk":"","probability":"low|med|high","impact":"low|med|high","prevent":"","signal":""}]}'].join('\n\n') });
      if (!r.ok) return { risks: [] };
      const LV = { low: 1, med: 1, high: 1 };
      return { risks: asArr(r.json.risks).map((x) => ({ risk: clip(x && x.risk, 220), probability: LV[x && x.probability] ? x.probability : 'med', impact: LV[x && x.impact] ? x.impact : 'med', prevent: clip(x && x.prevent, 220), signal: clip(x && x.signal, 200) })).filter((x) => x.risk).slice(0, 10) };
    },
  });

  // 4) 方案对比（branch/exec 供能）
  const compareOptions = defineUltraTool({
    name: 'ultra_compare_options',
    title: '多方案维度对比',
    kind: 'execute', parallel: true, timeoutMs: 28000,
    description: '当存在多个可选方案/技术路线/取舍需要决策时调用：按统一维度（收益/成本/风险/时效/可逆性）逐方案打分对比，显式列权衡，给出带前提的推荐。避免凭感觉选。',
    parameters: { question: { type: 'string', required: true, description: '决策问题。' }, options: { type: 'array', required: true, items: { type: 'string' }, description: '候选方案列表。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      rows: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        option: { type: 'string', required: true }, pros: { type: 'array', required: true, items: { type: 'string' } }, cons: { type: 'array', required: true, items: { type: 'string' } }, score: { type: 'number', required: true } } } },
      recommend: { type: 'string', required: true }, tradeoff: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.rows.map((x) => `·${x.option}（${x.score}分）优：${x.pros.join('/')}；劣：${x.cons.join('/')}`).join('\n') + `\n推荐：${v.recommend}（权衡：${v.tradeoff}）` }],
    degrade: () => ({ rows: [], recommend: '', tradeoff: '' }),
    async run(args, exec) {
      const s = st();
      const options = asArr(args.options).map((x) => clip(x, 200)).filter(Boolean).slice(0, 6);
      if (options.length < 2) return { rows: [], recommend: '', tradeoff: '' };
      const rows = await parallelLanes(deps.getLlm(), routeOf(exec, deps), options, (opt) => [
        '按 收益/成本/风险/时效/可逆性 客观评估该方案，列优缺点并给 0-100 综合分，不要预设立场。',
        '【决策问题】' + clip(args.question, 2000), '【方案】' + opt,
        '只输出 JSON：{"pros":[""],"cons":[""],"score":0到100数字}',
      ].join('\n\n'), s.maxTokens, 0.4);
      const by = {}; options.forEach((o, i) => { by[o] = rows[i]; });
      const norm = options.map((o) => { const r = by[o] || {}; return { option: o, pros: asArr(r.pros).map((x) => clip(x, 160)).slice(0, 5), cons: asArr(r.cons).map((x) => clip(x, 160)).slice(0, 5), score: Math.max(0, Math.min(100, Number(r.score) || 0)) }; });
      norm.sort((a, b) => b.score - a.score);
      const j = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
        prompt: ['基于下列对比给带前提的推荐和一句话核心权衡。', '【问题】' + clip(args.question, 1200), '【对比】' + norm.map((x) => `${x.option}:${x.score}分`).join('；'),
          '只输出 JSON：{"recommend":"","tradeoff":""}'].join('\n\n') });
      return { rows: norm, recommend: j.ok ? clip(j.json.recommend, 400) : (norm[0] ? norm[0].option : ''), tradeoff: j.ok ? clip(j.json.tradeoff, 300) : '' };
    },
  });

  // 5) 类比迁移（breadth/depth 供能）
  const analogy = defineUltraTool({
    name: 'ultra_analogy_bridge',
    title: '跨域类比迁移',
    kind: 'search', parallel: true, timeoutMs: 25000,
    description: '当问题陌生、直接想没有思路时调用：从结构相似的已知领域找类比，迁移其解法结构，同时标出类比失效的边界，借他山之石构造新思路。用于打破思维定式。',
    parameters: { problem: { type: 'string', required: true, description: '卡住的陌生问题。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      bridges: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        domain: { type: 'string', required: true }, mapping: { type: 'string', required: true }, transferred: { type: 'string', required: true }, limit: { type: 'string', required: true } } } },
      lead: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.bridges.map((x) => `·[${x.domain}] ${x.mapping}→迁移：${x.transferred}（失效边界：${x.limit}）`).join('\n') + `\n启发：${v.lead}` }],
    degrade: () => ({ bridges: [], lead: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.7, maxTokens: s.maxTokens,
        prompt: ['为下面陌生问题找 2-3 个结构同构的已知领域类比：写清结构映射、可迁移的解法、以及类比在哪里会失效（避免误导），最后给一条最可行动的启发。',
          '【问题】' + clip(args.problem, 3000),
          '只输出 JSON：{"bridges":[{"domain":"","mapping":"结构如何对应","transferred":"迁移来的解法","limit":"失效边界"}],"lead":""}'].join('\n\n') });
      if (!r.ok) return { bridges: [], lead: '' };
      return { bridges: asArr(r.json.bridges).map((x) => ({ domain: clip(x && x.domain, 80), mapping: clip(x && x.mapping, 240), transferred: clip(x && x.transferred, 300), limit: clip(x && x.limit, 200) })).filter((x) => x.transferred).slice(0, 3), lead: clip(r.json.lead, 400) };
    },
  });

  // 6) 渐进式工作记忆摘要（compress/memory 供能）
  const progressiveSummary = defineUltraTool({
    name: 'ultra_progressive_summary',
    title: '工作记忆压缩',
    kind: 'execute', parallel: true, timeoutMs: 24000,
    description: '当对话/材料很长、上下文即将超限或需要阶段性沉淀时调用：把已有内容压缩成结构化工作记忆——保留关键实体、已确定结论、未决问题、约束与数字，丢弃寒暄与重复，并给出可继续的断点。信息有损但不丢关键点。',
    parameters: { content: { type: 'string', required: true, description: '要压缩的对话/材料全文。' }, priorSummary: { type: 'string', description: '上一版摘要，用于增量合并，可留空。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      facts: { type: 'array', required: true, items: { type: 'string' } }, decisions: { type: 'array', required: true, items: { type: 'string' } },
      open: { type: 'array', required: true, items: { type: 'string' } }, constraints: { type: 'array', required: true, items: { type: 'string' } }, resumePoint: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: `工作记忆：事实${v.facts.length}/已定${v.decisions.length}/未决${v.open.length}/约束${v.constraints.length}。断点：${v.resumePoint}` }],
    degrade: () => ({ facts: [], decisions: [], open: [], constraints: [], resumePoint: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.2, maxTokens: s.maxTokens,
        prompt: ['把内容压缩为结构化工作记忆：facts关键事实与数字、decisions已确定的决定、open未决问题、constraints硬约束；只保留后续继续所必需的信息，丢弃重复与寒暄；给 resumePoint 一句话说明从哪继续。',
          args.priorSummary ? '【上一版摘要，增量合并不要丢】' + clip(args.priorSummary, 2000) : '',
          '【内容】' + clip(args.content, 5000),
          '只输出 JSON：{"facts":[""],"decisions":[""],"open":[""],"constraints":[""],"resumePoint":""}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { facts: [], decisions: [], open: [], constraints: [], resumePoint: '' };
      const arr = (x, n) => asArr(x).map((y) => clip(y, 220)).slice(0, n);
      return { facts: arr(r.json.facts, 12), decisions: arr(r.json.decisions, 8), open: arr(r.json.open, 8), constraints: arr(r.json.constraints, 8), resumePoint: clip(r.json.resumePoint, 300) };
    },
  });

  return [numericRecheck, stepPlan, riskRegister, compareOptions, analogy, progressiveSummary];
}

export const FLASH_EXTRA3_NAMES = [
  'ultra_numeric_recheck', 'ultra_step_plan', 'ultra_risk_register',
  'ultra_compare_options', 'ultra_analogy_bridge', 'ultra_progressive_summary',
];
