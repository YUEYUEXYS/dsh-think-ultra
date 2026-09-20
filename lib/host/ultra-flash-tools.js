// ultra-flash-tools.js — v0.1 Flash 认知工具箱·第一批（理解→前提→一致性→多视角→红队→验收闭环）
// 全部为纯分析工具（parallel 可并发扇出），内部一路/多路 MAX，任何失败结构化降级、绝不炸 loop。
import { defineUltraTool } from './ultra-tool-factory.js';
import { maxJson, routeOf, clip, asArr, parallelLanes } from './ultra-llm.js';

export function flashExtraTools(deps) {
  const st = () => { try { return deps.strength() || { lanes: 2, maxTokens: 900 }; } catch { return { lanes: 2, maxTokens: 900 }; } };

  // 1) 意图与约束精确化（plan/depth 主控供能）——自重构链路第一阶段的确定性入口
  const parseIntent = defineUltraTool({
    name: 'ultra_parse_intent',
    title: '意图约束精确化',
    kind: 'search',
    parallel: true,
    timeoutMs: 25000,
    description: '当用户请求模糊、目标/约束/验收标准不清，或要开始一个多步任务之前调用：把原始请求重构成零歧义的目标、硬约束、验收标准、待澄清未知项与有序子任务，避免做偏。是自重构链路的第一步。',
    parameters: {
      request: { type: 'string', required: true, description: '用户的原始请求，逐字保留。' },
      context: { type: 'string', description: '已有的对话/项目背景，可留空。' },
    },
    outSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        goal: { type: 'string', required: true },
        constraints: { type: 'array', required: true, items: { type: 'string' } },
        acceptance: { type: 'array', required: true, items: { type: 'string' } },
        unknowns: { type: 'array', required: true, items: { type: 'string' } },
        subtasks: { type: 'array', required: true, items: { type: 'string' } },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `目标：${v.goal}\n硬约束 ${v.constraints.length}：${v.constraints.join('；')}\n验收 ${v.acceptance.length} 项；子任务 ${v.subtasks.length} 步` + (v.unknowns.length ? `\n待澄清：${v.unknowns.join('；')}` : '') }],
    degrade: () => ({ goal: '', constraints: [], acceptance: [], unknowns: [], subtasks: [] }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), {
        ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
        prompt: [
          '把下面的用户请求重构成零歧义执行规格：显式目标、不可违反的硬约束、可判定的验收标准、信息不足的待澄清项、有序子任务。不要自行脑补用户没说的目标。',
          '【原始请求】' + clip(args.request, 4000),
          args.context ? '【背景】' + clip(args.context, 3000) : '',
          '只输出 JSON：{"goal":"","constraints":[""],"acceptance":[""],"unknowns":[""],"subtasks":[""]}',
        ].filter(Boolean).join('\n\n'),
      });
      if (!r.ok) return { goal: clip(args.request, 400), constraints: [], acceptance: [], unknowns: [], subtasks: [] };
      const j = r.json;
      return {
        goal: clip(j.goal, 800),
        constraints: asArr(j.constraints).map((x) => clip(x, 200)).slice(0, 12),
        acceptance: asArr(j.acceptance).map((x) => clip(x, 200)).slice(0, 12),
        unknowns: asArr(j.unknowns).map((x) => clip(x, 200)).slice(0, 8),
        subtasks: asArr(j.subtasks).map((x) => clip(x, 200)).slice(0, 12),
      };
    },
  });

  // 2) 隐含前提抽取（rigor 主控）
  const assumptions = defineUltraTool({
    name: 'ultra_assumption_extract',
    title: '隐含前提审计',
    kind: 'search',
    parallel: true,
    timeoutMs: 25000,
    description: '在论证、方案或结论成立之前调用：列出它依赖但没有明说的全部前提，逐个标注 solid(已被保证)/likely(大概率)/unwarranted(想当然)，并指出最危险前提。防止把隐含假设当事实。',
    parameters: { argument: { type: 'string', required: true, description: '待审计的论证、方案或结论。' } },
    outSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        assumptions: {
          type: 'array', required: true,
          items: { type: 'object', additionalProperties: false, properties: {
            assumption: { type: 'string', required: true },
            certainty: { type: 'string', required: true, enum: ['solid', 'likely', 'unwarranted'] },
            risk: { type: 'string', required: true },
          } },
        },
        riskiest: { type: 'string', required: true },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `隐含前提 ${v.assumptions.length} 条：\n` + v.assumptions.map((x) => `·[${x.certainty}] ${x.assumption} — ${x.risk}`).join('\n') + (v.riskiest ? `\n最危险前提：${v.riskiest}` : '') }],
    degrade: () => ({ assumptions: [], riskiest: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), {
        ...routeOf(exec, deps), temperature: 0.3, maxTokens: s.maxTokens,
        prompt: [
          '找出下面论证依赖但没有明说的前提（含定义、事实、因果、完备性、样本代表性等），逐条判定确定性并写一旦不成立的风险。不要复述明说内容。',
          '【论证】' + clip(args.argument, 4000),
          '只输出 JSON：{"assumptions":[{"assumption":"","certainty":"solid|likely|unwarranted","risk":""}],"riskiest":"最危险的一条"}',
        ].join('\n\n'),
      });
      if (!r.ok) return { assumptions: [], riskiest: '' };
      const CER = { solid: 1, likely: 1, unwarranted: 1 };
      const list = asArr(r.json.assumptions).map((x) => ({
        assumption: clip(x && x.assumption, 240),
        certainty: CER[x && x.certainty] ? x.certainty : 'likely',
        risk: clip(x && x.risk, 200),
      })).filter((x) => x.assumption).slice(0, 10);
      return { assumptions: list, riskiest: clip(r.json.riskiest, 300) };
    },
  });

  // 3) 稻草人/偷换检测（rigor 主控）——比对被批驳对象是否还是原主张
  const strawman = defineUltraTool({
    name: 'ultra_strawman_check',
    title: '稻草人偷换检测',
    kind: 'search',
    parallel: true,
    timeoutMs: 22000,
    description: '当要反驳一个观点、或发现争论双方似乎不在说同一件事时调用：判断被攻击的版本是否忠实于原始主张，识别偷换概念/夸大/断章取义，给出忠实重述。避免驳了个不存在的靶子。',
    parameters: {
      originalClaim: { type: 'string', required: true, description: '对方真正的原始主张。' },
      attackedVersion: { type: 'string', required: true, description: '正在被批判的那个版本。' },
    },
    outSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        sameTarget: { type: 'boolean', required: true },
        verdict: { type: 'string', required: true, enum: ['faithful', 'distorted', 'unrelated'] },
        drift: { type: 'string', required: true },
        faithfulRestatement: { type: 'string', required: true },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `判定：${v.verdict === 'faithful' ? '忠实于原主张' : v.verdict === 'distorted' ? '被歪曲/偷换' : '已不是同一对象'}。${v.drift}` + (v.faithfulRestatement ? `\n忠实重述：${v.faithfulRestatement}` : '') }],
    degrade: () => ({ sameTarget: true, verdict: 'faithful', drift: '', faithfulRestatement: '' }),
    async run(args, exec) {
      const s = st();
      const r = await maxJson(deps.getLlm(), {
        ...routeOf(exec, deps), temperature: 0.2, maxTokens: s.maxTokens,
        prompt: [
          '比较「原始主张」与「被攻击版本」是否同一对象：是否存在偷换概念、夸大强度、断章取义、以偏概全。先判 sameTarget，再给 verdict，最后给对原始主张的忠实中性重述。',
          '【原始主张】' + clip(args.originalClaim, 2500),
          '【被攻击版本】' + clip(args.attackedVersion, 2500),
          '只输出 JSON：{"sameTarget":布尔,"verdict":"faithful|distorted|unrelated","drift":"偏差在哪，没有留空","faithfulRestatement":""}',
        ].join('\n\n'),
      });
      if (!r.ok) return { sameTarget: true, verdict: 'faithful', drift: '', faithfulRestatement: '' };
      const v = ['faithful', 'distorted', 'unrelated'].includes(r.json.verdict) ? r.json.verdict : 'faithful';
      return { sameTarget: !!r.json.sameTarget && v === 'faithful', verdict: v, drift: clip(r.json.drift, 300), faithfulRestatement: clip(r.json.faithfulRestatement, 500) };
    },
  });

  // 4) 多立场视角（breadth 主控）——并发生成多个独立视角的质疑与补充
  const personaLens = defineUltraTool({
    name: 'ultra_persona_lens',
    title: '多立场视角审视',
    kind: 'search',
    parallel: true,
    timeoutMs: 28000,
    description: '当问题涉及多方利益、需要跳出单一视角、或怀疑有系统性盲区时调用：并发生成多个不同立场/学科视角，各自给出最尖锐质疑与被忽略的补充，再综合。用于拓宽而不是重复自己。',
    parameters: {
      question: { type: 'string', required: true, description: '要从多视角审视的问题或方案。' },
      lenses: { type: 'array', description: '指定视角名（如 最终用户/安全审计/成本/长期维护），留空自动选 3 个最相关视角。', items: { type: 'string' } },
    },
    outSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        views: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          lens: { type: 'string', required: true }, challenge: { type: 'string', required: true }, addition: { type: 'string', required: true },
        } } },
        synthesis: { type: 'string', required: true },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `多视角（${v.views.length}）：\n` + v.views.map((x) => `·[${x.lens}] 质疑：${x.challenge}｜补充：${x.addition}`).join('\n') + (v.synthesis ? `\n综合：${v.synthesis}` : '') }],
    degrade: () => ({ views: [], synthesis: '' }),
    async run(args, exec) {
      const s = st();
      let lenses = asArr(args.lenses).map((x) => clip(x, 40)).filter(Boolean).slice(0, 5);
      if (!lenses.length) lenses = ['最终用户视角', '反方批判者视角', '长期成本/风险视角'];
      const views = await parallelLanes(deps.getLlm(), routeOf(exec, deps), lenses, (lens) => [
        '你现在只站在「' + lens + '」立场，对下面问题给出：一条最尖锐的质疑、一条最容易被忽略的补充。不要附和。',
        '【问题】' + clip(args.question, 3000),
        '只输出 JSON：{"challenge":"","addition":""}',
      ].join('\n\n'), s.maxTokens, 0.5);
      const norm = views.map((x) => ({ lens: clip(x.lane, 40), challenge: clip(x.challenge, 260), addition: clip(x.addition, 260) })).filter((x) => x.challenge || x.addition);
      if (!norm.length) return { views: [], synthesis: '' };
      const syn = await maxJson(deps.getLlm(), {
        ...routeOf(exec, deps), temperature: 0.4, maxTokens: s.maxTokens,
        prompt: ['综合下列多视角，指出真正需要纳入的关键点（去重、按重要性），不堆套话。', '【问题】' + clip(args.question, 1500), '【视角】' + norm.map((x) => `[${x.lens}] ${x.challenge};${x.addition}`).join('\n'), '只输出 JSON：{"synthesis":""}'].join('\n\n'),
      });
      return { views: norm, synthesis: syn.ok ? clip(syn.json.synthesis, 800) : '' };
    },
  });

  // 5) 红队质询（rigor/breadth）——生成最尖锐必答问题
  const redteam = defineUltraTool({
    name: 'ultra_redteam_question',
    title: '红队尖锐质询',
    kind: 'search',
    parallel: true,
    timeoutMs: 25000,
    description: '在方案/结论定稿前调用：以最强对手的角度提出必须回答的尖锐问题（失败模式、边界、反例、代价、可证伪性），按严重度排序并指出最致命的一个。用于主动找漏洞而不是等别人挑。',
    parameters: {
      target: { type: 'string', required: true, description: '待红队质询的方案、计划或结论。' },
      count: { type: 'integer', description: '需要的问题数 1-6，缺省按档位。', enum: [1, 2, 3, 4, 5, 6] },
    },
    outSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        questions: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          question: { type: 'string', required: true }, severity: { type: 'string', required: true, enum: ['critical', 'high', 'medium'] }, why: { type: 'string', required: true },
        } } },
        hardest: { type: 'string', required: true },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `红队质询 ${v.questions.length} 问：\n` + v.questions.map((x) => `·[${x.severity}] ${x.question}（${x.why}）`).join('\n') + (v.hardest ? `\n最致命：${v.hardest}` : '') }],
    degrade: () => ({ questions: [], hardest: '' }),
    async run(args, exec) {
      const s = st();
      const n = Math.max(1, Math.min(6, Number(args.count) > 0 ? Number(args.count) : Math.max(3, s.lanes + 1)));
      const r = await maxJson(deps.getLlm(), {
        ...routeOf(exec, deps), temperature: 0.5, maxTokens: s.maxTokens,
        prompt: [
          `你是最苛刻的红队评审，对下面方案提出 ${n} 个最尖锐、必须回答的问题，覆盖失败模式/边界条件/反例/隐藏代价/可证伪性，按严重度排序。`,
          '【方案】' + clip(args.target, 4000),
          '只输出 JSON：{"questions":[{"question":"","severity":"critical|high|medium","why":""}],"hardest":"最致命的一问"}',
        ].join('\n\n'),
      });
      if (!r.ok) return { questions: [], hardest: '' };
      const SEV = { critical: 1, high: 1, medium: 1 };
      const list = asArr(r.json.questions).map((x) => ({
        question: clip(x && x.question, 260), severity: SEV[x && x.severity] ? x.severity : 'high', why: clip(x && x.why, 200),
      })).filter((x) => x.question).slice(0, n);
      return { questions: list, hardest: clip(r.json.hardest, 300) };
    },
  });

  // 6) 交付验收总闸（execute/rigor）——对照验收标准逐项判，全绿才建议交付
  const acceptanceGate = defineUltraTool({
    name: 'ultra_acceptance_gate',
    title: '交付验收总闸',
    kind: 'execute',
    parallel: true,
    timeoutMs: 28000,
    description: '在输出最终答案/交付物之前必须调用：把待交付内容对照每条验收标准独立判定 pass(满足)/fail(不满足)/gap(无法判断)，任一非 pass 就给阻塞项与修补方向，全部 pass 才判定可交付。是"驳不倒才输出"的最后一道闸。',
    parameters: {
      deliverable: { type: 'string', required: true, description: '准备交付的内容（草稿/答案/方案全文）。' },
      criteria: { type: 'array', required: true, items: { type: 'string' }, description: '验收标准列表，每条可独立判定。' },
    },
    outSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        total: { type: 'integer', required: true },
        passed: { type: 'integer', required: true },
        failed: { type: 'integer', required: true },
        gaps: { type: 'integer', required: true },
        verdict: { type: 'string', required: true, enum: ['ship', 'revise'] },
        blockers: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          criterion: { type: 'string', required: true }, status: { type: 'string', required: true, enum: ['pass', 'fail', 'gap'] }, fix: { type: 'string', required: true },
        } } },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `验收：通过 ${v.passed}/${v.total}，不满足 ${v.failed}，存疑 ${v.gaps} → ${v.verdict === 'ship' ? '可交付' : '需修订'}` + (v.blockers.length ? '\n阻塞项：\n' + v.blockers.filter((x) => x.status !== 'pass').map((x) => `·[${x.status}] ${x.criterion} — ${x.fix}`).join('\n') : '') }],
    degrade: () => ({ total: 0, passed: 0, failed: 0, gaps: 0, verdict: 'revise', blockers: [] }),
    async run(args, exec) {
      const s = st();
      const criteria = asArr(args.criteria).map((x) => clip(x, 200)).filter(Boolean).slice(0, 10);
      if (!criteria.length) return { total: 0, passed: 0, failed: 0, gaps: 0, verdict: 'revise', blockers: [] };
      const rows = await parallelLanes(deps.getLlm(), routeOf(exec, deps), criteria, (criterion) => [
        '只依据「待交付内容」本身，判定它是否满足这条验收标准，不许假设没写出来的部分。',
        '【待交付内容】' + clip(args.deliverable, 4000),
        '【验收标准】' + criterion,
        '只输出 JSON：{"status":"pass|fail|gap","fix":"不满足或存疑时给最小修补方向，满足留空"}',
      ].join('\n\n'), s.maxTokens, 0.2);
      const byCrit = {}; rows.forEach((r) => { byCrit[r.lane] = r; });
      const blockers = [];
      let passed = 0, failed = 0, gaps = 0;
      for (const c of criteria) {
        const r = byCrit[c]; const status = r && ['pass', 'fail', 'gap'].includes(r.status) ? r.status : 'gap';
        if (status === 'pass') passed++; else if (status === 'fail') failed++; else gaps++;
        if (status !== 'pass') blockers.push({ criterion: c, status, fix: clip(r && r.fix, 240) });
      }
      return { total: criteria.length, passed, failed, gaps, verdict: (failed === 0 && gaps === 0) ? 'ship' : 'revise', blockers };
    },
  });

  return [parseIntent, assumptions, strawman, personaLens, redteam, acceptanceGate];
}

// 供门控登记的工具名（单一事实源）
export const FLASH_EXTRA_NAMES = [
  'ultra_parse_intent', 'ultra_assumption_extract', 'ultra_strawman_check',
  'ultra_persona_lens', 'ultra_redteam_question', 'ultra_acceptance_gate',
];
