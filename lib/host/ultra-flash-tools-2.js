// ultra-flash-tools-2.js — v0.1 Flash 认知工具箱·第二批（证据/反事实/竞争/边界/消歧/综合）
// 与第一批同范式：纯分析可并发、内部 MAX、任何失败结构化降级、绝不炸 agent loop。
import { defineUltraTool } from './ultra-tool-factory.js';
import { maxJson, routeOf, clip, asArr, parallelLanes } from './ultra-llm.js';

export function flashExtraTools2(deps) {
  const st = () => { try { return deps.strength() || { lanes: 2, maxTokens: 900 }; } catch { return { lanes: 2, maxTokens: 900 }; } };

  // 1) 证据绑定：每条结论绑证据与强度，揪出无证据主张（verify/memory 供能）
  const evidenceBind = defineUltraTool({
    name: 'ultra_evidence_bind',
    title: '证据绑定审计',
    kind: 'search', parallel: true, timeoutMs: 26000,
    description: '当结论需要站得住脚、或要区分"事实/推断/猜测"时调用：为每条关键结论绑定支撑证据、判定证据强度(solid强/circumstantial弱/none无据)，单独列出无证据或证据与结论不匹配的主张。用于拒绝拍脑袋结论。',
    parameters: {
      conclusions: { type: 'array', required: true, items: { type: 'string' }, description: '待绑定证据的关键结论列表。' },
      known: { type: 'string', description: '已知事实/材料/上下文，可留空。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      bound: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        conclusion: { type: 'string', required: true }, strength: { type: 'string', required: true, enum: ['solid', 'circumstantial', 'none'] }, evidence: { type: 'string', required: true }, gap: { type: 'string', required: true } } } },
      unsupported: { type: 'array', required: true, items: { type: 'string' } },
    } },
    render: (_a, v) => [{ type: 'text', text: `证据绑定 ${v.bound.length} 条：\n` + v.bound.map((x) => `·[${x.strength}] ${x.conclusion} — ${x.evidence}${x.gap ? '（缺口：' + x.gap + '）' : ''}`).join('\n') + (v.unsupported.length ? `\n无证据主张：${v.unsupported.join('；')}` : '') }],
    degrade: () => ({ bound: [], unsupported: [] }),
    async run(args, exec) {
      const s = st();
      const list = asArr(args.conclusions).map((x) => clip(x, 400)).filter(Boolean).slice(0, 8);
      const rows = await parallelLanes(deps.getLlm(), routeOf(exec, deps), list, (c) => [
        '只依据给定材料与严密推理，为这条结论判定证据强度并给出对应证据；材料不足以支撑就判 none，不许编造证据。',
        args.known ? '【已知材料】' + clip(args.known, 3000) : '',
        '【结论】' + c,
        '只输出 JSON：{"strength":"solid|circumstantial|none","evidence":"支撑证据，没有留空","gap":"证据缺口，没有留空"}',
      ].filter(Boolean).join('\n\n'), s.maxTokens, 0.2);
      const by = {}; rows.forEach((r) => { by[r.lane] = r; });
      const bound = [], unsupported = [];
      for (const c of list) {
        const r = by[c]; const strength = r && ['solid', 'circumstantial', 'none'].includes(r.strength) ? r.strength : 'none';
        bound.push({ conclusion: c, strength, evidence: clip(r && r.evidence, 240), gap: clip(r && r.gap, 200) });
        if (strength === 'none') unsupported.push(c);
      }
      return { bound, unsupported };
    },
  });

  // 2) 反事实分支：关键节点生成"若条件不同"分支并比较（falsify/branch 供能）
  const counterfactual = defineUltraTool({
    name: 'ultra_counterfactual_fork',
    title: '反事实分支推演',
    kind: 'search', parallel: true, timeoutMs: 28000,
    description: '当结论高度依赖某个关键假设/条件、或需要评估稳健性时调用：对每个关键变量构造"若它不成立/取反/变化"的反事实分支，推演结果如何改变，比较后指出结论在什么条件下会翻转。用于压力测试而非线性复述。',
    parameters: {
      decision: { type: 'string', required: true, description: '当前结论、决策或方案。' },
      drivers: { type: 'array', items: { type: 'string' }, description: '它依赖的关键变量/假设；留空则自动识别 3 个。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      forks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        driver: { type: 'string', required: true }, altered: { type: 'string', required: true }, outcome: { type: 'string', required: true }, flips: { type: 'boolean', required: true } } } },
      robustness: { type: 'string', required: true },
    } },
    render: (_a, v) => [{ type: 'text', text: `反事实分支 ${v.forks.length}：\n` + v.forks.map((x) => `·${x.driver}→${x.altered}：${x.outcome}${x.flips ? '【结论翻转】' : ''}`).join('\n') + `\n稳健性：${v.robustness}` }],
    degrade: () => ({ forks: [], robustness: '' }),
    async run(args, exec) {
      const s = st();
      let drivers = asArr(args.drivers).map((x) => clip(x, 160)).filter(Boolean).slice(0, 5);
      if (!drivers.length) {
        const id = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.4, maxTokens: s.maxTokens,
          prompt: ['识别下面结论最依赖、且一旦变化最可能颠覆结论的 3 个关键变量/假设。', '【结论】' + clip(args.decision, 3000), '只输出 JSON：{"drivers":[""]}'].join('\n\n') });
        if (id.ok) drivers = asArr(id.json.drivers).map((x) => clip(x, 160)).slice(0, 3);
      }
      if (!drivers.length) return { forks: [], robustness: '' };
      const rows = await parallelLanes(deps.getLlm(), routeOf(exec, deps), drivers, (d) => [
        '对该关键变量做反事实：把它取反/移除/推到极端，推演结论会怎样变化，明确结论是否因此翻转(flips)。',
        '【当前结论】' + clip(args.decision, 2500), '【关键变量】' + d,
        '只输出 JSON：{"altered":"如何改变它","outcome":"反事实下的结果","flips":布尔}',
      ].join('\n\n'), s.maxTokens, 0.5);
      const forks = rows.map((r) => ({ driver: clip(r.lane, 160), altered: clip(r.altered, 220), outcome: clip(r.outcome, 300), flips: !!r.flips }));
      const flipN = forks.filter((x) => x.flips).length;
      return { forks, robustness: flipN === 0 ? '对所测变量稳健' : `有 ${flipN} 个变量可使结论翻转，需加固` };
    },
  });

  // 3) 多稿竞争择优：并行独立多版、按准则打分只留最强（branch/bestof 供能）
  const bestof = defineUltraTool({
    name: 'ultra_bestof_compete',
    title: '多稿竞争择优',
    kind: 'execute', parallel: true, timeoutMs: 30000,
    description: '当答案质量要求高、单一路径可能不是最优时调用：用互不相同的思路并行独立生成多版解答，再按正确性/完整/简洁/可执行打分，只保留最强一版并说明为何胜出。避免第一版将就。',
    parameters: {
      task: { type: 'string', required: true, description: '要解的任务/问题全文。' },
      candidates: { type: 'integer', description: '并行候选数 2-4，缺省按档位。', enum: [2, 3, 4] },
      criteria: { type: 'array', items: { type: 'string' }, description: '择优准则，留空用 正确性/完整/简洁/可执行。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      versions: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        approach: { type: 'string', required: true }, draft: { type: 'string', required: true }, score: { type: 'number', required: true } } } },
      winner: { type: 'string', required: true }, why: { type: 'string', required: true },
    } },
    render: (_a, v) => [{ type: 'text', text: `多稿竞争 ${v.versions.length} 版，胜出：${v.why}\n最优解：\n${v.winner}` }],
    degrade: () => ({ versions: [], winner: '', why: '' }),
    async run(args, exec) {
      const s = st();
      const n = Math.max(2, Math.min(4, Number(args.candidates) > 0 ? Number(args.candidates) : Math.max(2, s.lanes)));
      const crit = asArr(args.criteria).filter(Boolean).join('、') || '正确性、完整性、简洁、可执行性';
      const angles = ['最直接稳妥', '最巧妙/反常规', '最严谨保守', '最工程可落地'].slice(0, n);
      const versions = await parallelLanes(deps.getLlm(), routeOf(exec, deps), angles, (ang) => [
        '用「' + ang + '」的思路独立完整求解，不参考其他思路，给出可直接用的解答并自评 0-100 分。',
        '【任务】' + clip(args.task, 3500),
        '只输出 JSON：{"draft":"完整解答","score":0到100的数字}',
      ].join('\n\n'), s.maxTokens, 0.6);
      const vers = versions.map((r) => ({ approach: clip(r.lane, 40), draft: clip(r.draft, 1600), score: Math.max(0, Math.min(100, Number(r.score) || 0)) })).filter((x) => x.draft);
      if (!vers.length) return { versions: [], winner: '', why: '' };
      vers.sort((a, b) => b.score - a.score);
      const win = vers[0];
      const judge = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
        prompt: ['按【' + crit + '】从下列候选中选出最强一版（可融合他版优点），输出最终答案与一句话胜出理由。',
          '【任务】' + clip(args.task, 1500),
          '【候选】' + vers.map((v, i) => `版本${i + 1}（${v.approach},${v.score}分）：${v.draft}`).join('\n---\n'),
          '只输出 JSON：{"winner":"最终采用的完整答案","why":"一句话理由"}'].join('\n\n') });
      return { versions: vers, winner: judge.ok ? clip(judge.json.winner, 2200) : win.draft, why: judge.ok ? clip(judge.json.why, 240) : ('按自评最高分选用「' + win.approach + '」') };
    },
  });

  // 4) 边界/退化用例扫描（falsify/critique 供能）
  const edgeCase = defineUltraTool({
    name: 'ultra_edge_case',
    title: '边界用例扫描',
    kind: 'search', parallel: true, timeoutMs: 25000,
    description: '在方案/函数/规则定稿前调用：系统扫描空值、零、负数、极值、重复、越界、顺序颠倒、并发/时序、类型异常等边界与退化情形，逐个判断当前方案是否覆盖，给出未覆盖项的补法。专治"正常情况能跑、边界就崩"。',
    parameters: { target: { type: 'string', required: true, description: '待扫描的方案、逻辑、函数或规则。' } },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      cases: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        scenario: { type: 'string', required: true }, covered: { type: 'boolean', required: true }, patch: { type: 'string', required: true } } } },
      uncovered: { type: 'integer', required: true },
    } },
    render: (_a, v) => [{ type: 'text', text: `边界用例 ${v.cases.length}，未覆盖 ${v.uncovered}：\n` + v.cases.map((x) => `·${x.covered ? '已覆盖' : '【未覆盖】'} ${x.scenario}${x.patch ? ' → ' + x.patch : ''}`).join('\n') }],
    degrade: () => ({ cases: [], uncovered: 0 }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.4, maxTokens: s.maxTokens,
        prompt: ['对下面方案穷举最可能出问题的边界与退化情形（空/零/负/极值/重复/越界/乱序/并发时序/类型异常/资源耗尽），逐个判断当前方案是否已覆盖，未覆盖的给最小补法。',
          '【方案】' + clip(args.target, 3500),
          '只输出 JSON：{"cases":[{"scenario":"","covered":布尔,"patch":"未覆盖时的补法，覆盖留空"}]}'].join('\n\n') });
      if (!r.ok) return { cases: [], uncovered: 0 };
      const cases = asArr(r.json.cases).map((x) => ({ scenario: clip(x && x.scenario, 220), covered: !!(x && x.covered), patch: clip(x && x.patch, 220) })).filter((x) => x.scenario).slice(0, 12);
      return { cases, uncovered: cases.filter((x) => !x.covered).length };
    },
  });

  // 5) 关键术语消歧（deep/memory 供能）
  const termDefine = defineUltraTool({
    name: 'ultra_term_define',
    title: '术语口径消歧',
    kind: 'search', parallel: true, timeoutMs: 22000,
    description: '当问题里存在多义词、口径不一或各方可能各说各话时调用：锁定关键术语在本语境下的唯一定义、度量口径与边界，指出可能的歧义解读并选定一种，防止后面因定义不一致而推偏。',
    parameters: {
      text: { type: 'string', required: true, description: '含待消歧术语的问题或陈述。' },
      terms: { type: 'array', items: { type: 'string' }, description: '指定要消歧的术语，留空自动识别。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      terms: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        term: { type: 'string', required: true }, chosen: { type: 'string', required: true }, alternatives: { type: 'array', required: true, items: { type: 'string' } } } } },
    } },
    render: (_a, v) => [{ type: 'text', text: `术语消歧 ${v.terms.length}：\n` + v.terms.map((x) => `·${x.term} → ${x.chosen}${x.alternatives.length ? '（另可指：' + x.alternatives.join('/') + '）' : ''}`).join('\n') }],
    degrade: () => ({ terms: [] }),
    async run(args, exec) {
      const s = st();
      let terms = asArr(args.terms).map((x) => clip(x, 80)).filter(Boolean).slice(0, 6);
      if (!terms.length) {
        const id = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
          prompt: ['找出下面文本中存在多种理解、需要先统一定义/口径的关键术语，最多 5 个。', '【文本】' + clip(args.text, 3000), '只输出 JSON：{"terms":[""]}'].join('\n\n') });
        if (id.ok) terms = asArr(id.json.terms).map((x) => clip(x, 80)).slice(0, 5);
      }
      const rows = await parallelLanes(deps.getLlm(), routeOf(exec, deps), terms, (t) => [
        '给出该术语在当前语境下最合理的唯一定义与度量口径，列出其他可能的歧义解读。',
        '【语境】' + clip(args.text, 2500), '【术语】' + t,
        '只输出 JSON：{"chosen":"本语境采用的定义/口径","alternatives":["其他解读"]}',
      ].join('\n\n'), s.maxTokens, 0.3);
      return { terms: rows.map((r) => ({ term: clip(r.lane, 80), chosen: clip(r.chosen, 300), alternatives: asArr(r.alternatives).map((x) => clip(x, 120)).slice(0, 4) })).filter((x) => x.chosen) };
    },
  });

  // 6) 交叉综合去重（branch/sharpen 供能）
  const synthesis = defineUltraTool({
    name: 'ultra_synthesis_merge',
    title: '多路交叉综合',
    kind: 'execute', parallel: true, timeoutMs: 28000,
    description: '当手头有多路分支结论、多份材料或多个视角需要合并成一份最终答案时调用：去重、消解相互矛盾、按主线组织成结构化结论，并显式标出仍存在的分歧点。不是简单拼接。',
    parameters: {
      sources: { type: 'array', required: true, items: { type: 'string' }, description: '待综合的多路结论/材料。' },
      goal: { type: 'string', description: '综合要服务的目标/问题，可留空。' },
    },
    outSchema: { type: 'object', additionalProperties: false, properties: {
      merged: { type: 'string', required: true },
      keyPoints: { type: 'array', required: true, items: { type: 'string' } },
      conflicts: { type: 'array', required: true, items: { type: 'string' } },
    } },
    render: (_a, v) => [{ type: 'text', text: `综合要点 ${v.keyPoints.length}：\n` + v.keyPoints.map((x) => '·' + x).join('\n') + (v.conflicts.length ? `\n尚存分歧：${v.conflicts.join('；')}` : '') + `\n\n${v.merged}` }],
    degrade: () => ({ merged: '', keyPoints: [], conflicts: [] }),
    async run(args, exec) {
      const s = st();
      const sources = asArr(args.sources).map((x) => clip(x, 1200)).filter(Boolean).slice(0, 10);
      if (sources.length < 2) return { merged: sources[0] || '', keyPoints: [], conflicts: [] };
      const r = await maxJson(deps.getLlm(), { ...routeOf(exec, deps), temperature: 0.35, maxTokens: s.maxTokens,
        prompt: ['把下列多路材料综合成一份不重复、不自相矛盾、按主线组织的结论：相同信息合并，冲突信息显式列入 conflicts 而不是悄悄取舍，提炼 keyPoints。',
          args.goal ? '【服务目标】' + clip(args.goal, 800) : '',
          '【多路材料】\n' + sources.map((x, i) => `[${i + 1}] ${x}`).join('\n'),
          '只输出 JSON：{"merged":"综合后的完整结论","keyPoints":[""],"conflicts":["尚存分歧"]}'].filter(Boolean).join('\n\n') });
      if (!r.ok) return { merged: '', keyPoints: [], conflicts: [] };
      return { merged: clip(r.json.merged, 2400), keyPoints: asArr(r.json.keyPoints).map((x) => clip(x, 220)).slice(0, 12), conflicts: asArr(r.json.conflicts).map((x) => clip(x, 200)).slice(0, 8) };
    },
  });

  return [evidenceBind, counterfactual, bestof, edgeCase, termDefine, synthesis];
}

export const FLASH_EXTRA2_NAMES = [
  'ultra_evidence_bind', 'ultra_counterfactual_fork', 'ultra_bestof_compete',
  'ultra_edge_case', 'ultra_term_define', 'ultra_synthesis_merge',
];
