// ultra-pro-tools-5.js — Pro 第五批·更抽象/更危险的高阶推演工具（仅 Pro 全集挂载，门控分级解锁）
// 与既有 Pro13 件正交不重复：first_principles 做"重建"，本批做公理多世界、模态可能世界、
// 递归不动点、自指怪圈、本体坍缩、观察者相对化。范式同 Flash 四批：纯分析可并发、内部 MAX、失败必降级。
import { defineUltraTool } from './ultra-tool-factory.js';
import { maxJson, routeOf, clip, asArr } from './ultra-llm.js';

export function proExtraTools5(deps) {
  const st = () => { try { return deps.strength() || { lanes: 2, maxTokens: 1200 }; } catch { return { lanes: 2, maxTokens: 1200 }; } };

  // ① 公理回溯解构 + 多套互斥公理体系并行推演（axiom/abst/deep 供能）
  const axiomUnwind = defineUltraTool({
    name: 'ultra_axiom_unwind', title: '公理回溯·多地基推演', kind: 'execute', parallel: true, timeoutMs: 26000,
    description: 'Pro 专用·公理回溯解构：当结论高度依赖某个看似不证自明的前提时调用。把论证一路下钻到不可再分的公理层，区分事实/定义/可替换假设/价值预设，并在 2-3 套互斥公理体系下分别推演，指出替换哪条公理后结论会改变。比第一性原理更狠：不止重建，而是枚举换地基后的不同大厦。',
    parameters: {
      claim: { type: 'string', required: true, description: '要下钻的结论或论证。' },
      context: { type: 'string', description: '结论依赖的背景，可留空。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      ran: { type: 'boolean', required: true },
      axiomStack: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        layer: { type: 'string', required: true }, kind: { type: 'string', required: true }, replaceable: { type: 'boolean', required: true } } } },
      rivalSystems: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        swappedAxiom: { type: 'string', required: true }, resultingClaim: { type: 'string', required: true }, plausibility: { type: 'string' } } } },
      bedrock: { type: 'string', required: true } } },
    render: (_a, v) => !v.ran ? [{ type: 'text', text: '公理回溯通道暂不可用，可手工列出隐含前提。' }]
      : [{ type: 'text', text: '公理栈下钻：\n' + v.axiomStack.map((x) => `·[${x.kind}${x.replaceable ? '·可替换' : ''}] ${x.layer}`).join('\n')
        + '\n互斥公理体系下的不同结论：\n' + v.rivalSystems.map((r) => `·换「${r.swappedAxiom}」→ ${r.resultingClaim}（${r.plausibility || '待定'}）`).join('\n')
        + '\n不可再分的地基：' + v.bedrock }],
    degrade: () => ({ ran: false, axiomStack: [], rivalSystems: [], bedrock: '' }),
    async run(args, exec) {
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.5, maxTokens: st().maxTokens,
        system: '你是公理回溯引擎，只输出严格 JSON；必须把伪装成事实的价值预设与可替换假设揪出来，不许停在第一层。',
        prompt: ['把下面结论的论证一路下钻到不可再分的公理：逐层标注它是 事实/定义/可替换假设/价值预设，以及是否可替换；然后选 2-3 条最关键的可替换公理，分别换成一个互斥但自洽的替代公理，在新地基上重新推演结论会变成什么，并评估替代体系合理性。',
          '【背景】' + clip(args.context, 1200), '【结论】' + clip(args.claim, 2500),
          '只输出 JSON：{"axiomStack":[{"layer":"该层前提","kind":"事实|定义|可替换假设|价值预设","replaceable":布尔}],"rivalSystems":[{"swappedAxiom":"被替换公理","resultingClaim":"新地基下结论","plausibility":"合理性"}],"bedrock":"不可再分的最小地基"}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { ran: false, axiomStack: [], rivalSystems: [], bedrock: '' };
      return { ran: true,
        axiomStack: asArr(r.json.axiomStack).slice(0, 10).map((x) => ({ layer: clip(x.layer, 400), kind: clip(x.kind, 20), replaceable: !!x.replaceable })),
        rivalSystems: asArr(r.json.rivalSystems).slice(0, 4).map((x) => ({ swappedAxiom: clip(x.swappedAxiom, 300), resultingClaim: clip(x.resultingClaim, 600), plausibility: clip(x.plausibility, 200) })),
        bedrock: clip(r.json.bedrock, 800) };
    },
    callSummary: (a) => clip(a.claim, 50),
  });

  // ② 模态可能世界（modality/branch/fractal 供能）
  const modalWorlds = defineUltraTool({
    name: 'ultra_modal_worlds', title: '模态可能世界巡检', kind: 'execute', parallel: true, timeoutMs: 26000,
    description: 'Pro 专用·模态可能世界：判断一个结论究竟必然成立、只是可能、纯属偶然还是不可能时调用。构造多个反事实可能世界（含最不利世界），逐世界检验结论是否仍成立，列出在什么样的世界会崩塌，把“碰巧为真”和“必然为真”严格区分。',
    parameters: {
      claim: { type: 'string', required: true, description: '要做模态判定的结论。' },
      knownFacts: { type: 'string', description: '已知事实与约束，可留空。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      ran: { type: 'boolean', required: true }, modality: { type: 'string', required: true },
      worlds: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        world: { type: 'string', required: true }, holds: { type: 'boolean', required: true }, note: { type: 'string' } } } },
      collapseConditions: { type: 'array', required: true, items: { type: 'string' } } } },
    render: (_a, v) => !v.ran ? [{ type: 'text', text: '模态分析通道暂不可用。' }]
      : [{ type: 'text', text: '模态判定：' + v.modality + '\n可能世界巡检：\n' + v.worlds.map((w) => `·${w.holds ? '成立' : '崩塌'}｜${w.world}${w.note ? '（' + w.note + '）' : ''}`).join('\n')
        + (v.collapseConditions.length ? '\n崩塌条件：\n' + v.collapseConditions.map((x) => '· ' + x).join('\n') : '') }],
    degrade: () => ({ ran: false, modality: '', worlds: [], collapseConditions: [] }),
    async run(args, exec) {
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.55, maxTokens: st().maxTokens,
        system: '你是模态逻辑引擎，只输出严格 JSON；在所有自洽可能世界里检验，不把现实世界的偶然当成必然。',
        prompt: ['对下面结论做模态分析：构造至少 4 个有实质差异的自洽可能世界（含最不利世界），逐世界判断结论是否成立；据此给总判定（必然/可能/偶然/不可能），并列出在哪些条件下会崩塌。',
          '【已知事实】' + clip(args.knownFacts, 1200), '【结论】' + clip(args.claim, 2500),
          '只输出 JSON：{"modality":"必然|可能|偶然|不可能 + 一句理由","worlds":[{"world":"世界关键设定","holds":布尔,"note":"说明"}],"collapseConditions":["崩塌条件"]}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { ran: false, modality: '', worlds: [], collapseConditions: [] };
      return { ran: true, modality: clip(r.json.modality, 300),
        worlds: asArr(r.json.worlds).slice(0, 8).map((x) => ({ world: clip(x.world, 400), holds: !!x.holds, note: clip(x.note, 200) })),
        collapseConditions: asArr(r.json.collapseConditions).slice(0, 8).map((x) => clip(x, 300)) };
    },
    callSummary: (a) => clip(a.claim, 50),
  });

  // ③ 递归不动点自省（recursion/reflect/deep 供能）
  const recursionFixpoint = defineUltraTool({
    name: 'ultra_recursion_fixpoint', title: '递归不动点追问', kind: 'execute', parallel: true, timeoutMs: 28000,
    description: 'Pro 专用·递归不动点：需要彻底追问“我到底凭什么相信它”时调用。对每条理由递归追问“又凭什么”，直到不动点（无需再证的自明项）或暴露循环论证/无穷回溯，输出最小自洽信念核与必须切断的坏链。',
    parameters: {
      belief: { type: 'string', required: true, description: '要递归追问的信念/结论。' },
      maxDepth: { type: 'integer', description: '最大追问层数 3-8，缺省 6。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      ran: { type: 'boolean', required: true },
      chains: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        path: { type: 'array', required: true, items: { type: 'string' } }, ending: { type: 'string', required: true } } } },
      circular: { type: 'array', required: true, items: { type: 'string' } },
      fixpointCore: { type: 'array', required: true, items: { type: 'string' } } } },
    render: (_a, v) => !v.ran ? [{ type: 'text', text: '递归不动点通道暂不可用。' }]
      : [{ type: 'text', text: v.chains.map((c) => '追问链（' + c.ending + '）：\n' + c.path.map((p, i) => '  '.repeat(Math.min(i, 6)) + '↳ ' + p).join('\n')).join('\n\n')
        + (v.circular.length ? '\n循环论证（须切断）：\n' + v.circular.map((x) => '· ' + x).join('\n') : '')
        + '\n最小自洽信念核：\n' + v.fixpointCore.map((x) => '· ' + x).join('\n') }],
    degrade: () => ({ ran: false, chains: [], circular: [], fixpointCore: [] }),
    async run(args, exec) {
      const depth = Math.max(3, Math.min(8, Number(args.maxDepth) || 6));
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.4, maxTokens: st().maxTokens,
        system: '你是递归不动点引擎，只输出严格 JSON；每层都要真的继续追问，不许用“显然/众所周知”提前终止。',
        prompt: ['对下面信念的每条支撑理由递归追问“又凭什么”，最多追问 ' + depth + ' 层，每条链结局只能是：自明不动点/经验证据/循环论证/无穷回溯/外部假设。明确指出哪些链构成循环论证，并收敛出真正的最小自洽信念核。',
          '【信念】' + clip(args.belief, 2500),
          '只输出 JSON：{"chains":[{"path":["第1层理由","…直到结局"],"ending":"自明不动点|经验证据|循环论证|无穷回溯|外部假设"}],"circular":["具体循环"],"fixpointCore":["最小信念核"]}'].join('\n\n') });
      if (!r.ok) return { ran: false, chains: [], circular: [], fixpointCore: [] };
      return { ran: true,
        chains: asArr(r.json.chains).slice(0, 6).map((x) => ({ path: asArr(x.path).slice(0, 9).map((p) => clip(p, 300)), ending: clip(x.ending, 20) })),
        circular: asArr(r.json.circular).slice(0, 8).map((x) => clip(x, 300)),
        fixpointCore: asArr(r.json.fixpointCore).slice(0, 10).map((x) => clip(x, 300)) };
    },
    callSummary: (a) => clip(a.belief, 50),
  });

  // ④ 自指怪圈消融（fractal/meta/recursion + antiloop 模块，高阶危险）
  const strangeLoop = defineUltraTool({
    name: 'ultra_strange_loop', title: '自指怪圈消融', kind: 'execute', parallel: true, timeoutMs: 26000,
    description: 'Pro 专用·自指怪圈消融（高阶危险）：当问题出现自指——本命题、系统描述自身、观察者即被观察者、“这句话”、规则谈论规则本身——时调用。区分良性自指（可层级化）与恶性悖论（真矛盾），用对象语言/元语言层级把怪圈拆开，给出去自指改写与残余不可判定项。',
    parameters: { expression: { type: 'string', required: true, description: '含自指/自我缠绕的命题或系统描述。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      ran: { type: 'boolean', required: true }, selfRefs: { type: 'array', required: true, items: { type: 'string' } },
      kind: { type: 'string', required: true },
      stratification: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        level: { type: 'integer', required: true }, statement: { type: 'string', required: true } } } },
      rewritten: { type: 'string', required: true }, undecidable: { type: 'string', required: true } } },
    render: (_a, v) => !v.ran ? [{ type: 'text', text: '自指分析通道暂不可用。' }]
      : [{ type: 'text', text: '自指点：' + v.selfRefs.join('；') + '\n性质：' + v.kind + '\n层级化拆解：\n'
        + v.stratification.map((s) => `L${s.level}：${s.statement}`).join('\n') + '\n去自指改写：' + v.rewritten + '\n残余不可判定：' + v.undecidable }],
    degrade: () => ({ ran: false, selfRefs: [], kind: '', stratification: [], rewritten: '', undecidable: '' }),
    async run(args, exec) {
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.35, maxTokens: st().maxTokens,
        system: '你是自指与悖论分析引擎，只输出严格 JSON；严格区分良性自指与恶性悖论，用对象语言/元语言层级拆分，不制造伪深刻。',
        prompt: ['定位下面表达式中所有自我指涉点，判断它属于：良性自指/说谎者型恶性悖论/罗素型集合自指/观察者自缠/无自指。然后用层级化（L0 对象层、L1 元层、L2 元元层…）拆开缠绕，给出不再自我指涉的等价改写，并诚实标出哥德尔意义上残余的不可判定项。',
          '【表达式】' + clip(args.expression, 2500),
          '只输出 JSON：{"selfRefs":["自指点"],"kind":"良性自指|恶性悖论|集合自指|观察者自缠|无自指","stratification":[{"level":0,"statement":"该层陈述"}],"rewritten":"去自指改写","undecidable":"残余不可判定项，无则填无"}'].join('\n\n') });
      if (!r.ok) return { ran: false, selfRefs: [], kind: '', stratification: [], rewritten: '', undecidable: '' };
      return { ran: true,
        selfRefs: asArr(r.json.selfRefs).slice(0, 8).map((x) => clip(x, 300)), kind: clip(r.json.kind, 30),
        stratification: asArr(r.json.stratification).slice(0, 6).map((x, i) => ({ level: Math.max(0, Math.min(9, Math.round(Number(x.level) || i))), statement: clip(x.statement, 500) })),
        rewritten: clip(r.json.rewritten, 1200), undecidable: clip(r.json.undecidable, 500) };
    },
    callSummary: (a) => clip(a.expression, 50),
  });

  // ⑤ 本体坍缩（fusion/synth/abst 供能）
  const onticCollapse = defineUltraTool({
    name: 'ultra_ontic_collapse', title: '本体坍缩·奥卡姆剃刀', kind: 'execute', parallel: true, timeoutMs: 26000,
    description: 'Pro 专用·本体坍缩：多个解释互相竞争、复杂度不一时调用。为每个解释清点它必须假设的不可观测实体数量（本体论承诺），在不损失解释力前提下坍缩到承诺最少者，同时保留删不掉、必须多元并存的解释，避免错误剃掉真东西。',
    parameters: {
      phenomenon: { type: 'string', required: true, description: '要被解释的现象。' },
      explanations: { type: 'array', required: true, items: { type: 'string' }, description: '当前互相竞争的若干解释。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      ran: { type: 'boolean', required: true },
      ledger: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        explanation: { type: 'string', required: true }, unobservables: { type: 'integer', required: true },
        coverage: { type: 'string', required: true }, keep: { type: 'boolean', required: true } } } },
      collapsed: { type: 'string', required: true }, indispensable: { type: 'array', required: true, items: { type: 'string' } } } },
    render: (_a, v) => !v.ran ? [{ type: 'text', text: '本体坍缩通道暂不可用。' }]
      : [{ type: 'text', text: '本体论账本：\n' + v.ledger.map((x) => `·${x.keep ? '保留' : '坍缩掉'}｜不可观测实体×${x.unobservables}｜覆盖${x.coverage}｜${x.explanation}`).join('\n')
        + '\n坍缩结果：' + v.collapsed + (v.indispensable.length ? '\n删不掉、必须保留：\n' + v.indispensable.map((x) => '· ' + x).join('\n') : '') }],
    degrade: () => ({ ran: false, ledger: [], collapsed: '', indispensable: [] }),
    async run(args, exec) {
      const exps = asArr(args.explanations).map((x) => clip(x, 600)).filter(Boolean).slice(0, 8);
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.4, maxTokens: st().maxTokens,
        system: '你是本体论坍缩引擎，只输出严格 JSON；既敢用奥卡姆剃刀删冗余实体，也诚实保留解释力不可替代的多元解释。',
        prompt: ['对同一现象的下列竞争解释，逐个清点必须假设多少个不可观测实体（越多越不经济）、能覆盖哪些证据、是否保留。在不损失解释力前提下坍缩到承诺最少者；若某解释覆盖了其它解释覆盖不了的关键证据，列入不可删的 indispensable。',
          '【现象】' + clip(args.phenomenon, 1500), '【竞争解释】' + exps.map((e, i) => (i + 1) + '. ' + e).join('\n'),
          '只输出 JSON：{"ledger":[{"explanation":"解释","unobservables":整数,"coverage":"覆盖范围","keep":布尔}],"collapsed":"最终坍缩到的解释与理由","indispensable":["删不掉的解释及原因"]}'].join('\n\n') });
      if (!r.ok) return { ran: false, ledger: [], collapsed: '', indispensable: [] };
      return { ran: true,
        ledger: asArr(r.json.ledger).slice(0, 8).map((x) => ({ explanation: clip(x.explanation, 500), unobservables: Math.max(0, Math.min(99, Math.round(Number(x.unobservables) || 0))), coverage: clip(x.coverage, 300), keep: !!x.keep })),
        collapsed: clip(r.json.collapsed, 1200), indispensable: asArr(r.json.indispensable).slice(0, 6).map((x) => clip(x, 400)) };
    },
    callSummary: (a) => clip(a.phenomenon, 50),
  });

  // ⑥ 观察者相对化（crossmodel/reflect/breadth 供能）
  const observerRelativity = defineUltraTool({
    name: 'ultra_observer_relativity', title: '观察者相对化矩阵', kind: 'execute', parallel: true, timeoutMs: 26000,
    description: 'Pro 专用·观察者相对化：结论被说成“客观如此”但其实依赖特定立场时调用。为不同观察者（角色、利益、时间尺度、信息集）分别判定结论是否成立，输出相对化矩阵，剥掉伪装成客观的主观前提，并给出跨观察者不变的真正客观内核（若存在）。',
    parameters: {
      claim: { type: 'string', required: true, description: '被当作客观的结论。' },
      observers: { type: 'array', items: { type: 'string' }, description: '要对照的观察者/立场/时间尺度，可留空由工具补全。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      ran: { type: 'boolean', required: true },
      matrix: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        observer: { type: 'string', required: true }, holds: { type: 'string', required: true }, why: { type: 'string', required: true } } } },
      hiddenStance: { type: 'array', required: true, items: { type: 'string' } }, invariantCore: { type: 'string', required: true } } },
    render: (_a, v) => !v.ran ? [{ type: 'text', text: '观察者相对化通道暂不可用。' }]
      : [{ type: 'text', text: '相对化矩阵：\n' + v.matrix.map((m) => `·[${m.observer}] ${m.holds}：${m.why}`).join('\n')
        + (v.hiddenStance.length ? '\n被伪装成客观的立场前提：\n' + v.hiddenStance.map((x) => '· ' + x).join('\n') : '')
        + '\n跨观察者不变内核：' + v.invariantCore }],
    degrade: () => ({ ran: false, matrix: [], hiddenStance: [], invariantCore: '' }),
    async run(args, exec) {
      const obs = asArr(args.observers).map((x) => clip(x, 120)).filter(Boolean).slice(0, 8);
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.5, maxTokens: st().maxTokens,
        system: '你是观察者相对化引擎，只输出严格 JSON；把立场相关项与真正跨立场不变项分开，不搞极端相对主义也不假装中立。',
        prompt: ['对下面“看似客观”的结论，选取至少 4 个有实质差异的观察者（不同角色/利益/时间尺度/信息集' + (obs.length ? '，必须包含用户指定的：' + obs.join('、') : '') + '），分别判断结论在该观察者处是 成立/不成立/反转并说明原因；揪出偷偷预设的立场；最后给出对所有观察者都成立的不变内核，若不存在就明确说没有。',
          '【结论】' + clip(args.claim, 2500),
          '只输出 JSON：{"matrix":[{"observer":"观察者","holds":"成立|不成立|反转","why":"原因"}],"hiddenStance":["隐藏的立场前提"],"invariantCore":"跨观察者不变内核，无则填不存在"}'].join('\n\n') });
      if (!r.ok) return { ran: false, matrix: [], hiddenStance: [], invariantCore: '' };
      return { ran: true,
        matrix: asArr(r.json.matrix).slice(0, 8).map((x) => ({ observer: clip(x.observer, 120), holds: clip(x.holds, 12), why: clip(x.why, 400) })),
        hiddenStance: asArr(r.json.hiddenStance).slice(0, 8).map((x) => clip(x, 300)), invariantCore: clip(r.json.invariantCore, 800) };
    },
    callSummary: (a) => clip(a.claim, 50),
  });

  return [axiomUnwind, modalWorlds, recursionFixpoint, strangeLoop, onticCollapse, observerRelativity];
}

export const PRO_EXTRA5_NAMES = ['ultra_axiom_unwind', 'ultra_modal_worlds', 'ultra_recursion_fixpoint', 'ultra_strange_loop', 'ultra_ontic_collapse', 'ultra_observer_relativity'];
export default { proExtraTools5 };
