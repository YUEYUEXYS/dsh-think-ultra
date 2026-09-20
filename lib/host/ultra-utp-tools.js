// ultra-utp-tools.js — UTP（Ultra Toolbox Protocol）增量工具箱
// 补齐用户点名的两条真实工具链：①魔鬼代言人（find_flaw / attack / defend+judge）
// ②自重构链路两阶段（阶段一：解析→歧义→对齐→压缩→补边界→自检→二次优化→一致性→汇总→重投；
// 阶段二：phase_mark 分区 + strategy_profile 让八根能力滑杆实时改变工具调用策略）。
// 全部 defineTool 注册、完整 ParameterSchemaSpec、execute 带错误处理/超时边界/signal 转发、
// presentCall(pending 态) + render(结果) + presentResult(完成态) 三层 UI 可见，标题随语言中英切换。
// 纯增量：不改 ultra-tools.js 既有稳定工具，只在 buildToolset 里 concat。
import { defineTool } from '@deepseek-ai/dsh-tools';
import { sampleOnce } from './tournament-engine.js';

function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }
function asArr(v) { return Array.isArray(v) ? v : []; }
function intIn(v, lo, hi, dft) { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dft; }

function extractJson(raw) {
  if (!raw) return null;
  const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = String(body).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// 一路内部 MAX 调用并解析 JSON；任何失败都收敛为 {ok:false}，绝不把异常抛进 agent loop。
async function maxJson(llm, opts) {
  if (!llm || typeof llm.stream !== 'function') return { ok: false, reason: 'no-llm' };
  try {
    const r = await sampleOnce(llm, {
      provider: opts.provider, model: opts.model,
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
  return { provider: header.provider || deps.provider || '', model: header.model || deps.model || '', signal: exec && exec.signal };
}

// 双语呈现字典（UI 可见标题随设置语言实时切换；模型可见 description 注册时定型，采用中文主、英文括注）
const I18N = {
  zh: {
    flaw: '魔鬼代言人 · 逻辑缺陷扫描', attack: '魔鬼代言人 · 反方攻击', defend: '魔鬼代言人 · 防御与裁判',
    parse: '第一阶段 · 语义解析', ambiguity: '第一阶段 · 歧义检测', align: '第一阶段 · 目标对齐',
    compress: '第一阶段 · 结构压缩', boundary: '第一阶段 · 边界补全', selfcheck: '第一阶段 · 重构自检',
    second: '第一阶段 · 二次优化', consist: '第一阶段 · 一致性校验', assemble: '第一阶段 · 汇总最优提示词',
    relaunch: '第一阶段 → 第二阶段 · 重投执行', phase: '阶段标记', strategy: '当前工具策略画像',
    p1: '【第一阶段·提示词重构】', p2: '【第二阶段·任务执行】',
  },
  en: {
    flaw: "Devil's Advocate · Flaw Scan", attack: "Devil's Advocate · Counter-Attack", defend: "Devil's Advocate · Defend & Judge",
    parse: 'Phase 1 · Semantic Parse', ambiguity: 'Phase 1 · Ambiguity Scan', align: 'Phase 1 · Goal Alignment',
    compress: 'Phase 1 · Structural Compress', boundary: 'Phase 1 · Boundary Completion', selfcheck: 'Phase 1 · Refactor Self-Check',
    second: 'Phase 1 · Second Pass', consist: 'Phase 1 · Consistency Check', assemble: 'Phase 1 · Assemble Optimal Prompt',
    relaunch: 'Phase 1 → 2 · Relaunch Execution', phase: 'Phase Marker', strategy: 'Active Tool Strategy Profile',
    p1: '[Phase 1 · Prompt Refactor]', p2: '[Phase 2 · Execution]',
  },
};
function T(deps) { let k = 'zh'; try { k = deps.lang && deps.lang() === 'en' ? 'en' : 'zh'; } catch { k = 'zh'; } return I18N[k]; }

// ============================================================ 魔鬼代言人三工具
function devilTools(deps) {
  // 确定性逻辑缺陷模式库（不依赖 LLM 也能先标出可疑信号，LLM 再定位具体位置）
  const FLAW_PATTERNS = [
    ['以偏概全', /(所有|全部|每个人|从来|总是|never|always|everyone|nobody)/],
    ['因果倒置/相关当因果', /(导致|因为.*所以|causes?|therefore)/],
    ['非黑即白/虚假二分', /(要么.*要么|不是.*就是|either\.or)/],
    ['循环论证', /(众所周知|显而易见|显然|obviously)/],
    ['诉诸权威/人身', /(专家说|权威|某位大牛|according to)/],
    ['滑坡谬误', /(一旦.*就会.*最终|slippery)/],
    ['稻草人/偷换概念', /(他们的意思就是|也就是说你)/],
    ['幸存者偏差/样本不足', /(我见过|我身边|个案|anecdot)/],
  ];
  return [
    defineTool({
      name: 'ultra_find_logical_flaw',
      description: '魔鬼代言人第一步：对一段论证/结论做逻辑缺陷扫描。先用规则库标出可疑谬误信号（以偏概全、因果倒置、虚假二分、循环论证、诉诸权威、滑坡、稻草人、样本不足），再在 MAX 底座上定位每处缺陷的具体位置与类型，给出修补方向。复杂论证、要对外交付的结论、自己觉得“好像没问题”的推理优先调用。Flaw scan of an argument: rule-based signals plus MAX-localized diagnosis.',
      parameters: {
        argument: { type: 'string', required: true, description: '待审查的完整论证或结论（含前提与推导）。' },
        context: { type: 'string', description: '背景与已知事实，可留空。' },
        maxFlaws: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 8], description: '最多返回缺陷数，缺省按对抗强度滑杆。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            signals: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', required: true }, hit: { type: 'string', required: true } } } },
            flaws: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', required: true }, location: { type: 'string', required: true }, why: { type: 'string', required: true }, fix: { type: 'string', required: true } } } },
            soundness: { type: 'number', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `逻辑缺陷扫描：规则信号 ${v.signals.length} 处、定位缺陷 ${v.flaws.length} 处，健全度 ${v.soundness}/100。` + v.flaws.map((f) => `\n·[${f.kind}] ${f.location}\n  问题：${f.why}\n  修补：${f.fix}`).join('') }],
      },
      async execute(args, exec) {
        const text = clip(args.argument, 4000), ctx = clip(args.context, 2000);
        const signals = [];
        for (const [kind, re] of FLAW_PATTERNS) { const m = text.match(re); if (m) signals.push({ kind, hit: clip(m[0], 40) }); }
        const st = deps.strategy ? deps.strategy() : { debateRounds: 2, maxTokens: 900 };
        const cap = intIn(args.maxFlaws, 1, 8, Math.max(2, st.debateRounds + 1));
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.3, maxTokens: st.maxTokens,
          system: '你是最严苛的逻辑审查者，只找真实存在的缺陷，不吹毛求疵，只输出严格 JSON。',
          prompt: [
            '审查下面论证，最多找出 ' + cap + ' 个最实质的逻辑缺陷（前提不成立、推导无效、概念偷换、归纳薄弱、统计错误、自相矛盾）。每个给：缺陷类型、原文位置、为什么是缺陷、怎么修补。没有实质缺陷就返回空数组并给高分。',
            '【论证】\n' + text, ctx ? '【背景】\n' + ctx : '',
            '规则库已提示这些可疑信号（需你判断是否真成立，不要照单全收）：' + (signals.map((s) => s.kind).join('、') || '无'),
            '只输出 JSON：{"flaws":[{"kind":"类型","location":"原文位置","why":"为何是缺陷","fix":"修补方向"}],"soundness":0到100的整数}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return { signals, flaws: [], soundness: signals.length ? 70 : 80 };
        const flaws = asArr(r.json.flaws).slice(0, cap).map((f) => ({ kind: clip(f.kind, 40), location: clip(f.location, 300), why: clip(f.why, 300), fix: clip(f.fix, 300) }));
        const soundness = intIn(r.json.soundness, 0, 100, flaws.length ? 60 : 85);
        return { signals, flaws, soundness };
      },
      presentCall: (a) => ({ card: 'generic', title: T(deps).flaw, kind: 'execute', rawInput: clip(a.argument, 80) }),
    }),

    defineTool({
      name: 'ultra_debate_attack',
      description: '魔鬼代言人核心：站在反方立场对一个立场/方案发起多轮最致命攻击，每轮攻击都要比上一轮更深（先打表面漏洞，再打前提，最后打整个框架）。攻击轮数与是否引入第三方裁判由“对抗强度”滑杆实时决定。用于自我对抗、压力测试结论。Launches multi-round counter-attacks against a stance; round count is driven live by the debate-strength slider.',
      parameters: {
        stance: { type: 'string', required: true, description: '被攻击的正方立场/方案/结论。' },
        supporting: { type: 'string', description: '正方目前的论据，可留空。' },
        rounds: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '攻击轮数 1-5，缺省按对抗强度滑杆。' },
        perspective: { type: 'string', enum: ['logic', 'empirical', 'edge', 'judge', 'mixed'], description: '攻击视角：逻辑派/经验派/边界派/第三方裁判/混合，缺省混合。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            attacks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { round: { type: 'integer', required: true }, angle: { type: 'string', required: true }, attack: { type: 'string', required: true }, severity: { type: 'integer', required: true } } } },
            fatal: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '反方攻击通道暂不可用，请在主流程内自行列 2 条最强反对意见。' }] : [{ type: 'text', text: `反方 ${v.attacks.length} 轮攻击：` + v.attacks.map((x) => `\nR${x.round}[${x.angle}·致命度${x.severity}] ${x.attack}`).join('') + (v.fatal.length ? '\n最致命：' + v.fatal.join('；') : '') }],
      },
      async execute(args, exec) {
        const empty = { ran: false, attacks: [], fatal: [] };
        const st = deps.strategy ? deps.strategy() : { debateRounds: 2, maxTokens: 1000 };
        const rounds = intIn(args.rounds, 1, 5, Math.max(1, st.debateRounds));
        const persp = ['logic', 'empirical', 'edge', 'judge', 'mixed'].includes(args.perspective) ? args.perspective : 'mixed';
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.55, maxTokens: st.maxTokens,
          system: '你是最锋利的反方辩手与红队，目标是真正击穿立场而非走过场，只输出严格 JSON。',
          prompt: [
            '对下面立场发起 ' + rounds + ' 轮递进攻击：R1 打表面论据漏洞；R2 打隐藏前提与定义；R3 打整个框架/适用边界；更深轮次从反常识、极端边界、激励扭曲、长期演化角度攻击。视角偏好=' + persp + '。每轮给攻击角度、攻击内容、致命度1-10；最后列出真正可能致命的攻击（没有就空数组）。',
            '【正方立场】\n' + clip(args.stance, 3000),
            args.supporting ? '【正方论据】\n' + clip(args.supporting, 2000) : '',
            '只输出 JSON：{"attacks":[{"round":1,"angle":"角度","attack":"攻击","severity":1到10}],"fatal":["最致命攻击"]}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return empty;
        const attacks = asArr(r.json.attacks).slice(0, rounds + 1).map((x, i) => ({ round: intIn(x.round, 1, rounds, i + 1), angle: clip(x.angle, 30) || 'R' + (i + 1), attack: clip(x.attack, 600), severity: intIn(x.severity, 1, 10, 5) }));
        return { ran: true, attacks, fatal: asArr(r.json.fatal).map((x) => clip(x, 400)).slice(0, 4) };
      },
      presentCall: (a) => ({ card: 'generic', title: T(deps).attack, kind: 'execute', rawInput: clip(a.stance, 80) }),
    }),

    defineTool({
      name: 'ultra_defend_against',
      description: '魔鬼代言人收束：针对 ultra_debate_attack 给出的攻击逐条防御——能挡住的给反驳依据，挡不住的诚实承认并收窄/修正立场；对抗强度拉到高档时额外引入第三方裁判对每回合做胜负判定，最后输出经过对抗淬炼的最终立场。Defends each attack, concedes what cannot hold, and (at high debate strength) adds a neutral judge verdict.',
      parameters: {
        stance: { type: 'string', required: true, description: '原立场。' },
        attacks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { angle: { type: 'string' }, attack: { type: 'string', required: true } } }, description: 'ultra_debate_attack 返回的攻击列表。' },
        useJudge: { type: 'boolean', description: '是否引入第三方裁判，缺省按对抗强度滑杆（高档自动开启）。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            rounds: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { attack: { type: 'string', required: true }, held: { type: 'boolean', required: true }, reply: { type: 'string', required: true }, judge: { type: 'string' } } } },
            conceded: { type: 'array', required: true, items: { type: 'string' } },
            finalStance: { type: 'string', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '防御通道暂不可用，请手工逐条回应反方攻击。' }] : [{ type: 'text', text: '防御回合：' + v.rounds.map((x) => `\n·[${x.held ? '挡住' : '承认'}${x.judge ? '·裁判:' + x.judge : ''}] ${x.attack} → ${x.reply}`).join('') + (v.conceded.length ? '\n承认并收窄：' + v.conceded.join('；') : '') + '\n最终立场：' + v.finalStance }],
      },
      async execute(args, exec) {
        const empty = { ran: false, rounds: [], conceded: [], finalStance: '' };
        const list = asArr(args.attacks).filter((x) => x && String(x.attack || '').trim()).slice(0, 6);
        if (!list.length) return { ran: true, rounds: [], conceded: [], finalStance: clip(args.stance, 2000) };
        const st = deps.strategy ? deps.strategy() : { debateRounds: 2, maxTokens: 1100 };
        const useJudge = args.useJudge === true || (args.useJudge !== false && st.debateRounds >= 3);
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.4, maxTokens: st.maxTokens,
          system: '你同时扮演诚实的正方与（必要时）中立裁判：挡不住就承认，绝不嘴硬，只输出严格 JSON。',
          prompt: [
            '逐条防御下面的反方攻击：held=true 表示挡住并给依据；held=false 表示确实挡不住，必须承认并说明如何收窄/修正立场。' + (useJudge ? '每条再由中立裁判判定 正方胜/反方胜/平手（judge 字段）。' : ''),
            '【原立场】\n' + clip(args.stance, 2500),
            '【反方攻击】\n' + list.map((x, i) => (i + 1) + '. ' + clip(x.attack, 400)).join('\n'),
            '最后给吸收全部攻击后的 finalStance（淬炼后的最终立场，更精确、边界更清楚）。',
            '只输出 JSON：{"rounds":[{"attack":"对应攻击摘要","held":布尔,"reply":"防御或承认+修法","judge":"正方胜/反方胜/平手或留空"}],"conceded":["承认的点"],"finalStance":"最终立场"}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return empty;
        const rounds = asArr(r.json.rounds).slice(0, list.length).map((x, i) => ({ attack: clip(x.attack, 300) || clip(list[i].attack, 200), held: !!x.held, reply: clip(x.reply, 500), judge: useJudge ? clip(x.judge, 20) : '' }));
        return { ran: true, rounds, conceded: asArr(r.json.conceded).map((x) => clip(x, 300)), finalStance: clip(r.json.finalStance, 2500) };
      },
      presentCall: (a) => ({ card: 'generic', title: T(deps).defend, kind: 'execute', rawInput: asArr(a.attacks).length + ' 次攻击' }),
    }),
  ];
}

// ============================================================ 自重构链路·第一阶段
function refactorTools(deps) {
  // 每会话一份重构工作区：阶段一各工具的产出累积到这里，assemble 汇总，relaunch 后清空进阶段二
  const boards = new WeakMap();
  const boardOf = (agent) => { if (!agent) return null; let b = boards.get(agent); if (!b) { b = { parse: null, ambiguity: null, align: null, compress: null, boundary: null, selfcheck: null, second: null, consistency: null, relaunched: false, original: '' }; boards.set(agent, b); } return b; };

  const out = (name, titleKey, kind, make) => defineTool({
    name, description: make.description,
    parameters: make.parameters,
    output: { schema: make.schema, render: make.render },
    execute: make.execute,
    presentCall: (a) => ({ card: 'generic', title: T(deps)[titleKey], kind: kind || 'execute', rawInput: make.raw ? make.raw(a) : clip(a.prompt || a.text || a.draft || '', 80) }),
  });

  const S = (extra) => ({ type: 'object', additionalProperties: false, properties: { ...extra } });
  const strArr = () => ({ type: 'array', required: true, items: { type: 'string' } });

  const tools = [
    out('ultra_refactor_parse', 'parse', 'execute', {
      description: '自重构链路第一阶段第1步·语义解析：把用户模糊的原始请求解析为结构化字段——真实任务类型、核心对象、显式约束、隐含主语、期望交付物、输入材料。后续所有重构步骤基于此，不改变用户意图。Semantic parse of a raw request into structured fields.',
      parameters: { prompt: { type: 'string', required: true, description: '用户原始请求原文。' } },
      schema: S({
        taskType: { type: 'string', required: true }, coreObject: { type: 'string', required: true },
        explicitConstraints: strArr(), implicitSubject: { type: 'string', required: true },
        deliverables: strArr(), inputs: strArr(), stage: { type: 'string', required: true },
      }),
      render: (_a, v) => [{ type: 'text', text: `语义解析：类型=${v.taskType}｜对象=${v.coreObject}｜交付物 ${v.deliverables.length} 项｜显式约束 ${v.explicitConstraints.length} 条。` }],
      execute: async (args, exec) => {
        const b = boardOf(exec && exec.agent); if (b) b.original = clip(args.prompt, 8000);
        const st = deps.strategy ? deps.strategy() : { maxTokens: 800 };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.2, maxTokens: st.maxTokens,
          prompt: ['解析下面用户请求为结构化字段，不得添加用户没说的目标，不得遗漏显式约束。', '【原始请求】\n' + clip(args.prompt, 6000),
            '只输出 JSON：{"taskType":"任务类型","coreObject":"核心对象","explicitConstraints":["显式约束"],"implicitSubject":"隐含主语/默认前提","deliverables":["期望交付物"],"inputs":["已有输入材料"],"stage":"phase1"}'],
        });
        const fb = { taskType: 'unknown', coreObject: '', explicitConstraints: [], implicitSubject: '', deliverables: [], inputs: [], stage: 'phase1' };
        const j = r.ok ? r.json : fb;
        const res = { taskType: clip(j.taskType, 60) || 'unknown', coreObject: clip(j.coreObject, 400), explicitConstraints: asArr(j.explicitConstraints).map((x) => clip(x, 300)).slice(0, 16), implicitSubject: clip(j.implicitSubject, 600), deliverables: asArr(j.deliverables).map((x) => clip(x, 200)).slice(0, 12), inputs: asArr(j.inputs).map((x) => clip(x, 200)).slice(0, 12), stage: 'phase1' };
        if (b) b.parse = res; return res;
      },
    }),

    out('ultra_refactor_ambiguity', 'ambiguity', 'execute', {
      description: '自重构链路第一阶段第2步·歧义检测：找出请求中所有可多解的词/指代/范围/度量/时态歧义，对每处给出“不同解读 + 安全默认裁决 + 是否必须向用户澄清”。零歧义是重构硬指标。Detects every ambiguity and assigns a safe default or flags it for clarification.',
      parameters: { prompt: { type: 'string', required: true, description: '原始请求（最好附带 parse 结果）。' }, parsed: { type: 'string', description: '上一步语义解析 JSON 字符串，可留空。' } },
      schema: S({ ambiguities: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { term: { type: 'string', required: true }, readings: strArr(), defaultPick: { type: 'string', required: true }, mustAsk: { type: 'boolean', required: true } } } }, mustClarify: strArr() }),
      render: (_a, v) => [{ type: 'text', text: `歧义检测：${v.ambiguities.length} 处歧义，其中必须澄清 ${v.mustClarify.length} 处。` + v.ambiguities.map((x) => `\n·${x.term}：${x.readings.join(' / ')} → 默认取「${x.defaultPick}」${x.mustAsk ? '（需澄清）' : ''}`).join('') }],
      execute: async (args, exec) => {
        const st = deps.strategy ? deps.strategy() : { maxTokens: 900, rigor: 2 };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.2, maxTokens: st.maxTokens,
          prompt: ['逐句找下面请求的歧义（多义词、指代不明、范围不清、度量单位/时态缺失、省略主语、可宽可严的标准）。每处给：歧义点、≥2种解读、不打断用户时的安全默认裁决、是否必须澄清（影响交付方向才 true）。',
            '【原始请求】\n' + clip(args.prompt, 5000), args.parsed ? '【语义解析】\n' + clip(args.parsed, 1500) : '',
            '只输出 JSON：{"ambiguities":[{"term":"歧义点","readings":["解读"],"defaultPick":"安全默认","mustAsk":布尔}],"mustClarify":["必须问用户的点"]}'],
        });
        if (!r.ok) return { ambiguities: [], mustClarify: [] };
        const amb = asArr(r.json.ambiguities).slice(0, 12).map((x) => ({ term: clip(x.term, 80), readings: asArr(x.readings).map((y) => clip(y, 160)).slice(0, 4), defaultPick: clip(x.defaultPick, 200), mustAsk: !!x.mustAsk }));
        const res = { ambiguities: amb, mustClarify: asArr(r.json.mustClarify).map((x) => clip(x, 200)).slice(0, 8) };
        const b = boardOf(exec && exec.agent); if (b) b.ambiguity = res; return res;
      },
    }),

    out('ultra_refactor_align', 'align', 'execute', {
      description: '自重构链路第一阶段第3步·目标对齐：把解析结果补全为可执行目标体系——拆解有序子目标、为每个交付物写可判定的验收标准、补充反例方向（什么情况算做错）。让优化后的提示词自带验收。Aligns goals: ordered sub-goals, acceptance criteria per deliverable, and counter-example directions.',
      parameters: { parsed: { type: 'string', required: true, description: 'parse 步骤的结构化结果（JSON 字符串）。' }, rawPrompt: { type: 'string', description: '原始请求，可留空。' } },
      schema: S({ subGoals: strArr(), acceptance: strArr(), counterDirections: strArr(), successLooksLike: { type: 'string', required: true } }),
      render: (_a, v) => [{ type: 'text', text: `目标对齐：${v.subGoals.length} 个有序子目标、${v.acceptance.length} 条验收标准、${v.counterDirections.length} 个反例方向。\n成功样态：${v.successLooksLike}` }],
      execute: async (args, exec) => {
        const st = deps.strategy ? deps.strategy() : { maxTokens: 1000, depth: 2 };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.3, maxTokens: st.maxTokens,
          prompt: ['基于语义解析，把任务补全为可执行目标体系：有序子目标（MECE、可独立完成）、每个交付物一条可判定验收标准、主动列出反例方向（什么结果算失败/不合格）、一句话描述“做完且做好长什么样”。不得新增用户没想要的交付物。',
            '【语义解析】\n' + clip(args.parsed, 2500), args.rawPrompt ? '【原始请求】\n' + clip(args.rawPrompt, 3000) : '',
            '只输出 JSON：{"subGoals":["有序子目标"],"acceptance":["验收标准"],"counterDirections":["反例方向"],"successLooksLike":"成功样态一句话"}'],
        });
        const res = r.ok ? {
          subGoals: asArr(r.json.subGoals).map((x) => clip(x, 300)).slice(0, 16),
          acceptance: asArr(r.json.acceptance).map((x) => clip(x, 300)).slice(0, 16),
          counterDirections: asArr(r.json.counterDirections).map((x) => clip(x, 200)).slice(0, 12),
          successLooksLike: clip(r.json.successLooksLike, 600),
        } : { subGoals: [], acceptance: [], counterDirections: [], successLooksLike: '' };
        const b = boardOf(exec && exec.agent); if (b) b.align = res; return res;
      },
    }),

    // 结构压缩：确定性算法（不调 LLM 也稳定），去口头语/重复/无效填充，保留信息
    out('ultra_refactor_compress', 'compress', 'other', {
      description: '自重构链路第一阶段第4步·结构压缩：确定性去除口头语、重复语义、无效铺垫与情绪填充，把散乱表述压成结构化、信息无损的紧凑表达；压缩率由“上下文压缩率”滑杆决定（档位越高压得越狠但不丢硬约束）。Deterministically strips filler/dedup and compresses without losing hard constraints; ratio driven by the compression slider.',
      parameters: { text: { type: 'string', required: true, description: '待压缩文本。' }, keepRatio: { type: 'number', description: '期望保留比例 0.3-1，缺省按压缩滑杆。' } },
      schema: S({ compressed: { type: 'string', required: true }, removed: { type: 'integer', required: true }, bullets: strArr() }),
      render: (_a, v) => [{ type: 'text', text: `结构压缩：清理 ${v.removed} 处冗余，整理为 ${v.bullets.length} 条要点。\n${v.compressed}` }],
      execute: (args) => {
        const raw = String(args.text || '');
        const st = deps.strategy ? deps.strategy() : { compressKeep: 0.7 };
        const keep = Number(args.keepRatio) >= 0.3 && Number(args.keepRatio) <= 1 ? Number(args.keepRatio) : st.compressKeep;
        const filler = /(就是说|那个|这个|其实|怎么说呢|你懂吧|反正|总之呢|um+|uh+|我觉得吧|应该是|可能大概|sort of|you know|like,)/gi;
        let removed = 0;
        const cleaned = raw.replace(filler, () => { removed += 1; return ''; })
          .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/([。！？；，])\1+/g, '$1').trim();
        // 切句去重（归一化后相同的句子只保留一条）
        const seen = new Set(); const bullets = [];
        cleaned.split(/[\n。！？；;]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
          const key = s.replace(/[\s，,。.、的了]/g, '').toLowerCase();
          if (key.length < 4 || !seen.has(key)) { seen.add(key); bullets.push(s); } else removed += 1;
        });
        const maxKeep = Math.max(1, Math.round(bullets.length * keep));
        const kept = bullets.slice(0, maxKeep);
        return { compressed: kept.join('；') + '。', removed, bullets: kept };
      },
    }),

    out('ultra_refactor_boundary', 'boundary', 'execute', {
      description: '自重构链路第一阶段第5步·边界补全：补齐任务的作用范围、前提假设、异常/失败路径、明确“不做什么（非目标）”、输入输出格式约定，防止执行时范围蔓延或漏处理异常。Completes scope, premises, failure paths, explicit non-goals, and I/O format.',
      parameters: { parsed: { type: 'string', required: true, description: 'parse 结果 JSON。' }, aligned: { type: 'string', description: 'align 结果 JSON，可留空。' } },
      schema: S({ scope: { type: 'string', required: true }, premises: strArr(), failurePaths: strArr(), nonGoals: strArr(), ioContract: { type: 'string', required: true } }),
      render: (_a, v) => [{ type: 'text', text: `边界补全：范围=${v.scope}｜前提 ${v.premises.length}｜异常路径 ${v.failurePaths.length}｜非目标 ${v.nonGoals.length}。\nI/O 约定：${v.ioContract}` }],
      execute: async (args, exec) => {
        const st = deps.strategy ? deps.strategy() : { maxTokens: 900, rigor: 2 };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.3, maxTokens: st.maxTokens,
          prompt: ['为任务补齐边界：作用范围（包含/不包含到哪）、必须显式化的前提假设、异常与失败路径（输入非法/超时/部分失败怎么办）、明确的非目标（这次不做什么，防范围蔓延）、输入输出格式契约。只补“让任务能被无歧义执行”所必需的，不扩大用户目标。',
            '【语义解析】\n' + clip(args.parsed, 2500), args.aligned ? '【目标对齐】\n' + clip(args.aligned, 1500) : '',
            '只输出 JSON：{"scope":"作用范围","premises":["前提"],"failurePaths":["异常路径处理"],"nonGoals":["非目标"],"ioContract":"输入输出格式约定"}'],
        });
        const res = r.ok ? { scope: clip(r.json.scope, 400), premises: asArr(r.json.premises).map((x) => clip(x, 200)).slice(0, 10), failurePaths: asArr(r.json.failurePaths).map((x) => clip(x, 200)).slice(0, 10), nonGoals: asArr(r.json.nonGoals).map((x) => clip(x, 200)).slice(0, 10), ioContract: clip(r.json.ioContract, 400) } : { scope: '', premises: [], failurePaths: [], nonGoals: [], ioContract: '' };
        const b = boardOf(exec && exec.agent); if (b) b.boundary = res; return res;
      },
    }),

    // 自检：确定性对照（信息丢失/加私货/改意图），LLM 补充
    out('ultra_refactor_selfcheck', 'selfcheck', 'other', {
      description: '自重构链路第一阶段·重构质量自检（重构强度拉到高档/超高才需要）：对照原始请求逐项检查重构稿是否丢信息、是否私自添加用户没有的目标、是否改变原意、约束是否全部保留、是否仍有歧义，给通过/打回与具体修补点。仅当重构强度滑杆≥高档时模型应主动调用。Checks the refactor against the original for information loss, scope creep, intent drift.',
      parameters: { original: { type: 'string', required: true, description: '原始请求。' }, refactored: { type: 'string', required: true, description: '当前重构稿。' } },
      schema: S({ passed: { type: 'boolean', required: true }, lost: strArr(), added: strArr(), drifted: strArr(), fixes: strArr(), score: { type: 'integer', required: true } }),
      render: (_a, v) => [{ type: 'text', text: (v.passed ? '重构自检通过' : '重构自检打回') + `（${v.score}/100）。` + (v.lost.length ? '\n丢信息：' + v.lost.join('；') : '') + (v.added.length ? '\n加私货：' + v.added.join('；') : '') + (v.drifted.length ? '\n改意图：' + v.drifted.join('；') : '') + (v.fixes.length ? '\n修补：' + v.fixes.join('；') : '') }],
      execute: async (args, exec) => {
        const original = String(args.original || ''), ref = String(args.refactored || '');
        // 确定性硬约束保留检查：原文中的数字/必须/禁止/文件名等硬 token 是否在重构稿出现
        const hardTokens = original.match(/\d+(?:\.\d+)?%?|必须|禁止|不得|只能|[A-Za-z]:\\[^\s，。]+|[\w.-]+\.\w+/g) || [];
        const lost = [...new Set(hardTokens)].filter((t) => !ref.includes(t)).slice(0, 12).map((t) => '硬约束丢失：' + t);
        const st = deps.strategy ? deps.strategy() : { maxTokens: 800 };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.1, maxTokens: st.maxTokens,
          prompt: ['严格对照检查重构稿：①是否丢了原始请求的任何信息/约束 ②是否添加了用户没要求的目标（私货）③是否改变了原意或语气立场 ④是否仍残留歧义。给 passed、各类问题清单、具体修补点与 0-100 分。',
            '【原始】\n' + clip(original, 4000), '【重构稿】\n' + clip(ref, 4000),
            '只输出 JSON：{"passed":布尔,"lost":["丢的信息"],"added":["私货"],"drifted":["改意处"],"fixes":["修补点"],"score":0到100}'],
        });
        if (!r.ok) { const passed = lost.length === 0; return { passed, lost, added: [], drifted: [], fixes: [], score: passed ? 80 : 55 }; }
        const res = {
          passed: !!r.json.passed && lost.length === 0,
          lost: lost.concat(asArr(r.json.lost).map((x) => clip(x, 200))).slice(0, 16),
          added: asArr(r.json.added).map((x) => clip(x, 200)).slice(0, 10),
          drifted: asArr(r.json.drifted).map((x) => clip(x, 200)).slice(0, 10),
          fixes: asArr(r.json.fixes).map((x) => clip(x, 200)).slice(0, 12),
          score: intIn(r.json.score, 0, 100, 70),
        };
        const b = boardOf(exec && exec.agent); if (b) b.selfcheck = res; return res;
      },
    }),

    out('ultra_refactor_secondpass', 'second', 'execute', {
      description: '自重构链路第一阶段·二次优化（重构强度拉到“超高/极限”才解锁）：在已通过自检的一稿上再做一轮极限优化——合并同类约束、统一术语、把祈使指令改为可执行步骤序列、把隐性评价标准显式化，推到理论最优但仍零歧义、不换意图。Second optimization pass, unlocked only at ultra/limit refactor strength.',
      parameters: { draft: { type: 'string', required: true, description: '一版重构稿。' }, selfcheck: { type: 'string', description: '自检结果 JSON，可留空。' } },
      schema: S({ optimized: { type: 'string', required: true }, changes: strArr(), tighter: { type: 'boolean', required: true } }),
      render: (_a, v) => [{ type: 'text', text: `二次优化（更紧=${v.tighter}），改动 ${v.changes.length} 处：` + v.changes.map((x) => '\n·' + x).join('') + '\n\n' + v.optimized }],
      execute: async (args, exec) => {
        const st = deps.strategy ? deps.strategy() : { maxTokens: 1400, depth: 4 };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.25, maxTokens: st.maxTokens,
          prompt: ['在不改变意图、不丢任何约束的前提下，把重构稿再优化一轮：合并重复同类项、统一全部术语口径、把模糊祈使改为有序可执行步骤、把隐性评价标准显式化、让每条指令都可被无歧义执行。输出优化后全文、改动清单、是否确实更紧。',
            '【一稿】\n' + clip(args.draft, 5000), args.selfcheck ? '【自检遗留】\n' + clip(args.selfcheck, 1200) : '',
            '只输出 JSON：{"optimated_unused":0,"optimized":"优化后全文","changes":["改动点"],"tighter":布尔}'],
        });
        if (!r.ok) return { optimized: clip(args.draft, 4000), changes: [], tighter: false };
        const res = { optimized: clip(r.json.optimized || args.draft, 6000), changes: asArr(r.json.changes).map((x) => clip(x, 200)).slice(0, 12), tighter: !!r.json.tighter };
        const b = boardOf(exec && exec.agent); if (b) b.second = res; return res;
      },
    }),

    // 一致性校验：确定性术语/口径/约束前后一致
    out('ultra_refactor_consistency', 'consist', 'other', {
      description: '自重构链路第一阶段·一致性校验：确定性扫描重构稿的术语是否前后统一、同一概念是否出现多个叫法、数字/约束是否自相矛盾、时态与口径是否一致。Deterministic terminology/number/constraint consistency scan.',
      parameters: { text: { type: 'string', required: true, description: '待校验文本。' } },
      schema: S({ conflicts: strArr(), termMap: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { canonical: { type: 'string', required: true }, variants: strArr() } } }, consistent: { type: 'boolean', required: true } }),
      render: (_a, v) => [{ type: 'text', text: (v.consistent ? '一致性校验通过' : '发现不一致') + '：' + v.termMap.length + ' 组术语。' + v.conflicts.map((x) => '\n·' + x).join('') }],
      execute: (args) => {
        const t = String(args.text || ''); const conflicts = [];
        // 数字矛盾：同一百分比/数量出现不同值（粗检相邻“X、Y”且 X!=Y 的量化对不判，这里只抓显式冲突词）
        if (/((必须|只能).{0,12}(不必|也可以|可选))|((不需要).{0,12}(需要))/.test(t)) conflicts.push('存在“必须/不必”类口径冲突，请统一');
        // 术语：中英/别名粗检——常见同义异名
        const pairs = [['文件', '文档'], ['接口', 'API'], ['函数', '方法'], ['列表', '数组'], ['提交', '保存']];
        const termMap = [];
        for (const [a, b] of pairs) { const va = t.includes(a), vb = t.includes(b); if (va && vb) { termMap.push({ canonical: a, variants: [a, b] }); conflicts.push(`术语不统一：「${a}」与「${b}」混用，建议统一为「${a}」`); } }
        const res = { conflicts: conflicts.slice(0, 16), termMap, consistent: conflicts.length === 0 };
        return res;
      },
    }),

    out('ultra_refactor_assemble', 'assemble', 'execute', {
      description: '自重构链路第一阶段·汇总：把解析/歧义裁决/目标对齐/压缩/边界/自检/二次优化/一致性的产出合成为一份零歧义、结构化、自带验收标准与反例方向的“最优推理提示词”，并显式标注它属于第一阶段产物，供 relaunch 重投进第二阶段执行。Assembles all phase-1 outputs into one optimal, unambiguous prompt.',
      parameters: { original: { type: 'string', required: true, description: '原始请求。' }, notes: { type: 'string', description: '其余各步产出的合并文本（可直接粘贴），可留空（工具也会读会话工作区）。' } },
      schema: S({ optimalPrompt: { type: 'string', required: true }, sections: strArr(), ambiguityFree: { type: 'boolean', required: true }, stage: { type: 'string', required: true } }),
      render: (_a, v) => [{ type: 'text', text: `${T(deps).p1} 已汇总为最优提示词（${v.sections.length} 个结构化区块，零歧义=${v.ambiguityFree}）。下一步调用 ultra_refactor_relaunch 进入第二阶段执行，或手动审阅后再投。\n————\n${v.optimalPrompt}` }],
      execute: async (args, exec) => {
        const b = boardOf(exec && exec.agent);
        const st = deps.strategy ? deps.strategy() : { maxTokens: 1600, depth: 3 };
        const workspace = b ? JSON.stringify({ parse: b.parse, align: b.align, boundary: b.boundary, selfcheck: b.selfcheck, second: b.second }).slice(0, 4000) : '';
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.2, maxTokens: st.maxTokens,
          prompt: ['把以下原始请求与第一阶段全部中间产出，合成为一份“最优推理提示词”：结构为【任务目标】【背景与输入】【有序执行步骤】【硬约束（逐条）】【验收标准（可判定）】【反例与失败规避】【输出格式】。要求零歧义、术语统一、不丢任何原始约束、不添加用户没要的目标。直接给可执行的提示词全文。',
            '【原始请求】\n' + clip(args.original || (b && b.original) || '', 5000),
            workspace ? '【阶段一工作区结构化产出】\n' + workspace : '',
            args.notes ? '【补充产出】\n' + clip(args.notes, 3000) : '',
            '只输出 JSON：{"optimalPrompt":"最优提示词全文","sections":["区块名"],"ambiguityFree":布尔,"stage":"phase1-assembled"}'],
        });
        if (!r.ok) {
          // 确定性兜底：用原始请求 + 骨架拼一份，绝不空手
          const skel = '【任务目标】' + clip(args.original || (b && b.original) || '', 3000) + '\n【硬约束】严格按上述要求，不增不减。\n【验收标准】完整、正确、可直接使用。\n【输出格式】结构化清晰呈现。';
          return { optimalPrompt: skel, sections: ['任务目标', '硬约束', '验收标准', '输出格式'], ambiguityFree: false, stage: 'phase1-assembled' };
        }
        const res = { optimalPrompt: clip(r.json.optimalPrompt, 8000), sections: asArr(r.json.sections).map((x) => clip(x, 40)).slice(0, 16), ambiguityFree: r.json.ambiguityFree !== false, stage: 'phase1-assembled' };
        if (b) b.assembled = res; return res;
      },
    }),

    defineTool({
      name: 'ultra_refactor_relaunch',
      description: '自重构链路·第一阶段→第二阶段的闸门：确认最优提示词后，把它作为新一轮精确任务重新投递给自己执行。工具做防重入保护（每会话每任务只重投一次，reset=true 可显式复位），并在注入内容上明确标注进入【第二阶段·任务执行】，使两阶段在对话时间线上分开显示。Relaunches the optimized prompt into phase-2 execution exactly once per task.',
      parameters: {
        optimalPrompt: { type: 'string', required: true, description: 'assemble 产出的最优提示词。' },
        reset: { type: 'boolean', description: 'true 时复位本会话重投闸门后再投，缺省 false。' },
      },
      output: {
        schema: S({ relaunched: { type: 'boolean', required: true }, reason: { type: 'string', required: true }, stage: { type: 'string', required: true } }),
        render: (_a, v) => [{ type: 'text', text: v.relaunched ? (T(deps).p2 + ' 已重投，开始按最优提示词执行。') : '未重投：' + v.reason }],
      },
      execute(args, exec) {
        const agent = exec && exec.agent;
        const b = boardOf(agent);
        if (!agent || typeof agent.inject !== 'function') return { relaunched: false, reason: '当前上下文不支持自注入，请把最优提示词作为下一条消息手动发送执行。', stage: 'phase2-blocked' };
        if (b && b.relaunched && !args.reset) return { relaunched: false, reason: '本任务已重投过一次（防循环）；确需再次重投请带 reset=true。', stage: 'phase2-already' };
        const optimal = clip(args.optimalPrompt, 8000);
        if (!optimal.trim()) return { relaunched: false, reason: '最优提示词为空。', stage: 'phase2-empty' };
        try {
          const msg = {
            role: 'user',
            content: T(deps).p2 + ' 以下是经第一阶段重构后的零歧义最优任务，请严格据此开始执行，不要再改动任务目标，直接产出结果：\n\n' + optimal,
            source: { kind: 'plugin', plugin: 'thinking-ultra', form: 'snapshot', sections: [{ name: 'thinking-ultra-refactor-relaunch', text: optimal }] },
          };
          agent.inject(msg);
          if (b) b.relaunched = true;
          return { relaunched: true, reason: 'ok', stage: 'phase2-entered' };
        } catch (e) {
          return { relaunched: false, reason: '注入失败：' + (e && e.message ? e.message : String(e)), stage: 'phase2-error' };
        }
      },
      presentCall: () => ({ card: 'generic', title: T(deps).relaunch, kind: 'execute', rawInput: 'phase1 → phase2' }),
    }),
  ];
  return tools;
}

// ============================================================ 阶段标记 + 八滑杆策略契约
function controlTools(deps) {
  return [
    defineTool({
      name: 'ultra_phase_mark',
      description: '在对话时间线上显式标记当前处于第一阶段（提示词重构）还是第二阶段（任务执行），让两阶段工具调用分区可见、不混在一起。Marks the current pipeline phase so phase-1 refactor calls and phase-2 execution calls are visually separated.',
      parameters: { phase: { type: 'string', required: true, enum: ['phase1-refactor', 'phase2-execute'], description: '阶段。' }, note: { type: 'string', description: '本阶段一句话说明，可留空。' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { phase: { type: 'string', required: true }, label: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: '— ' + v.label + ' —' }] },
      execute(args) {
        const zh = args.phase === 'phase1-refactor';
        const en = deps.lang && deps.lang() === 'en';
        const label = en ? (zh ? 'Phase 1 · Prompt Refactor' : 'Phase 2 · Execution') : (zh ? '第一阶段 · 提示词重构' : '第二阶段 · 任务执行');
        return { phase: args.phase, label: label + (args.note ? '：' + clip(args.note, 120) : '') };
      },
      presentCall: (a) => ({ card: 'generic', title: T(deps).phase, kind: 'other', rawInput: a.phase }),
    }),

    defineTool({
      name: 'ultra_strategy_profile',
      description: '只读：返回当前八根能力滑杆（推理深度/创造力/严谨度/速度-质量/工具激进度/自校验轮次/上下文压缩率/对抗强度）解析出的“真实工具调用策略画像”——并行路数、温度、重试/校验轮数、压缩保留率、攻击轮数、token 预算。模型在决定调用几个工具、开几路并行、自校验几遍之前先读它，从而让每一档滑杆变化都真实改变工具行为，而不是纸面状态。Read-only: returns the live tool-call strategy derived from the eight capability sliders.',
      parameters: { detail: { type: 'boolean', description: 'true 返回每根滑杆原始档位，缺省只返回可执行策略值。' } },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => [{ type: 'text', text: `当前工具策略：并行 ${v.parallel} 路｜温度 ${v.temperature}｜自校验 ${v.selfCheckRounds} 轮｜重试 ${v.retries} 次｜压缩保留 ${Math.round(v.compressKeep * 100)}%｜对抗 ${v.debateRounds} 轮｜token 预算 ${v.maxTokens}。档位越高，调用越并行、越严格、越深。` }],
      },
      execute(_args, exec) {
        const s = deps.strategy ? deps.strategy() : { depth: 1, creativity: 1, rigor: 1, pace: 1, aggression: 1, selfCheckRounds: 1, compressKeep: 0.7, debateRounds: 1, parallel: 1, temperature: 0.4, retries: 1, maxTokens: 800 };
        const profile = { ...s, modelTier: deps.modelTier ? deps.modelTier(exec && exec.agent) : 'pro', at: Date.now() };
        if (_args.detail) { const sl = deps.sliders ? deps.sliders() : {}; profile.sliderTiers = sl; }
        return profile;
      },
      presentCall: () => ({ card: 'generic', title: T(deps).strategy, kind: 'other', rawInput: 'read-only' }),
    }),
  ];
}

// 组装：Flash 与 Pro 都拿全套 UTP（Pro 的深度上限由 deps.strategy 在 agent-hooks 按模型给，工具内部已消费，无需在此裁剪功能有无）
export function buildUtpTools(deps) {
  return [...devilTools(deps), ...refactorTools(deps), ...controlTools(deps)];
}

export default { buildUtpTools };
