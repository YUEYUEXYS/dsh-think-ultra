// super-think-primer.js — Thinker Ultra 后端强制超级思考预演引擎
// ------------------------------------------------------------------
// 解决的根本问题：单靠系统提示词要求模型"第一步调用 super_think / 思考久一点"
// 并不可靠——模型经常只做一段 200 字的浅思考就直接作答。
// 本引擎在 agent/pre-step（请求真正发给模型之前）由【插件后端】直接、确定性地
// 先跑一次 reasoningEffort=max 的超长深度思考（Super Think Primer），
// 再把这段"超级思考预演"作为合法 plugin 上下文注入，模型在此基础上继续。
// 这样不依赖模型自觉，每一轮、每一次都 100% 有一段与能力滑块档位严格对应的超长思考。
//
// 设计铁律：
//   1. 能力滑块 0..20，每过 5 格一个【大跃升】（极端非线性，不是线性增长）；
//   2. 档位越高越耗 token、思考越久、路径/自检/反驳越多——能力是等出来的；
//   3. 哪怕只是"你好"，拉到极限档也要解释语义、猜测意图、展开多层思考；
//   4. 极境(apex)模式完整包含讯流(velocity)底层，再叠加数倍深度 + 爆炸式多模态精读；
//   5. 必须有明确结束条件（步骤闭环 + 字数下限 + 收敛自检），杜绝死循环；
//   6. 任何异常/超时一律 fail-open，绝不阻塞主对话。
// 纯逻辑 + 一次受控 LLM 调用，零 UI 依赖，可独立单测。
// 版本：2.0.0（强制预演·四档非线性·双模式隔离）

import { sampleOnce } from './tournament-engine.js';

export const PRIMER_VERSION = '2.0.0-forced';
export const PRIMER_BUILD = '20260915-superthink';

// ============================================================
// §1 能力档位模型：0..20 → 四档，每 5 格一个大跃升（极端非线性）
// ============================================================

// 四档区间（左闭右闭，20 为满）
export const CAP_TIERS = [
  {
    key: 'rush', name: '极速', range: [0, 5], notch: 5,
    // 极速：几乎不做后端预演，只给一句轻量定心，保证批量/简单任务快
    enabled: false, maxTokens: 0, minChars: 0, steps: 0, paths: 0,
    selfChecks: 0, refutes: 0, crossVerify: 0, metacog: 0,
    tokenMult: 0.25, thinkLabel: '极速', minThinkSec: 0,
  },
  {
    key: 'balanced', name: '均衡', range: [6, 10], notch: 10,
    enabled: true, maxTokens: 2600, minChars: 900, steps: 6, paths: 1,
    selfChecks: 1, refutes: 0, crossVerify: 1, metacog: 0,
    tokenMult: 1.0, thinkLabel: '均衡', minThinkSec: 6,
  },
  {
    key: 'deep', name: '深度', range: [11, 15], notch: 15,
    enabled: true, maxTokens: 7200, minChars: 2600, steps: 12, paths: 2,
    selfChecks: 2, refutes: 1, crossVerify: 2, metacog: 1,
    tokenMult: 3.0, thinkLabel: '深度', minThinkSec: 12,
  },
  {
    key: 'extreme', name: '极限', range: [16, 20], notch: 20,
    enabled: true, maxTokens: 24000, minChars: 8000, steps: 32, paths: 6,
    selfChecks: 4, refutes: 3, crossVerify: 4, metacog: 3,
    tokenMult: 10.0, thinkLabel: '极限', minThinkSec: 30,
  },
];

// 档位内连续插值：让同一档内越靠近上沿越强（档间大跃升 + 档内平滑爬升）
export function capabilityToTier(capability) {
  let cap = Number(capability);
  if (!Number.isFinite(cap)) cap = 5;
  cap = Math.max(0, Math.min(20, Math.round(cap)));
  let tier = CAP_TIERS[0];
  for (const t of CAP_TIERS) {
    if (cap >= t.range[0] && cap <= t.range[1]) { tier = t; break; }
  }
  // 档内位置 0..1（用于连续放大 maxTokens / minChars，避免档内无差异）
  const span = tier.range[1] - tier.range[0] || 1;
  const within = Math.max(0, Math.min(1, (cap - tier.range[0]) / span));
  // 连续预算：在本档基线与下一阶之间按 within 插值（幂律，越靠近上沿涨得越快）
  const k = 1.8;
  const curve = Math.pow(within, k);
  const prev = CAP_TIERS[Math.max(0, CAP_TIERS.indexOf(tier) - 1)];
  const interp = (a, b) => Math.round(a + (b - a) * curve);
  const prevFloor = (prev && prev.minChars) ? prev.minChars : Math.round(tier.minChars * 0.5);
  return {
    cap,
    tier,
    within,
    curve,
    // 实际生效预算（档内连续，档间跃升）——maxTokens/steps 也随档内位置连续变化
    budget: tier.enabled ? {
      maxTokens: interp(prev.maxTokens || Math.round(tier.maxTokens * 0.4), tier.maxTokens),
      minChars: interp(prevFloor, tier.minChars),
      steps: interp(prev.steps || Math.round(tier.steps * 0.4), tier.steps),
      paths: tier.paths,
      selfChecks: tier.selfChecks,
      refutes: tier.refutes,
      crossVerify: tier.crossVerify,
      metacog: tier.metacog,
      minThinkSec: tier.minThinkSec,
      tokenMult: tier.tokenMult,
    } : null,
  };
}

// ============================================================
// §2 双模式隔离：讯流(velocity) vs 极境(apex)
//   极境【完整包含】讯流底层，再叠加数倍深度与爆炸式多模态精读。
// ============================================================

export const MODE_PROFILE = {
  // 讯流：快速、单链为主，保证响应速度的同时仍有深度
  velocity: {
    key: 'velocity', label: '讯流',
    depthMult: 1.0,
    pathMult: 1.0,
    extraSteps: 0,
    tokenMult: 1.0,
    multimodal: false,
  },
  // 极境：在讯流全部底层之上，深度/路径/预算数倍放大，并点燃爆炸式多模态
  apex: {
    key: 'apex', label: '极境',
    depthMult: 2.2,       // 思考深度是讯流的 2.2 倍
    pathMult: 2.0,        // 候选路径翻倍
    extraSteps: 8,        // 额外 8 个极境专属深推步骤
    tokenMult: 2.4,       // token 预算 2.4 倍
    multimodal: true,     // 点燃爆炸式多模态精读
  },
};

export function modeProfileOf(mode) {
  const m = String(mode || 'velocity').toLowerCase();
  if (m === 'apex' || m === 'jijing' || m === 'extreme') return MODE_PROFILE.apex;
  return MODE_PROFILE.velocity;
}

// ============================================================
// §2.5 递归反思复审轮次（真实多次 MAX 调用的断层来源）
//   主预演（第 1 次真实调用）完成后，档位越高，后端再串行追加 N 轮
//   「最严厉批判者 → 带缺陷重铸」的独立 MAX 调用；每轮都建立在上一轮
//   完整预演文本之上，是真实的多次 LLM 调用，不是提示词摆设。
//   16-17：0 轮（仅主预演）；18：1 轮；19：2 轮；20：3 轮（断层）。
//   极境在讯流底座上再叠 1 轮；能力 20 + 极境 = 主预演 + 4 轮复审。
// ============================================================

export function reflectionPassesFor(cap, modeKey) {
  const c = Number(cap);
  const v = Number.isFinite(c) ? Math.max(0, Math.min(20, Math.round(c))) : 0;
  let n = 0;
  if (v >= 20) n = 3;
  else if (v >= 19) n = 2;
  else if (v >= 18) n = 1;
  else n = 0;
  // 极境底座完整继承讯流，再叠一轮批判性复审
  if (modeKey === 'apex' && n > 0) n += 1;
  // 极境下 16-17 也给 1 轮，保证切到极境可感知到加深
  if (modeKey === 'apex' && n === 0 && v >= 16) n = 1;
  return n;
}

// 每轮复审的角色切片：逼模型从不同角度攻击上一轮预演，避免 N 轮重复同一句话
const REFLECTION_LENSES = [
  {
    zh: '逻辑硬伤审查者：专门猎杀推理链条中的逻辑断裂、偷换概念、因果倒置、循环论证、未证明就当作前提的断言。',
    en: 'Logic-hardship reviewer: hunt broken inference chains, equivocation, reversed causality, circular reasoning, and claims assumed without proof.',
  },
  {
    zh: '约束与边界审查者：逐条核对用户的显式约束、隐藏约束、边界条件、极端输入是否全部被覆盖，找出任何遗漏。',
    en: 'Constraint & boundary reviewer: verify every explicit and implicit requirement, edge case and extreme input is covered; find anything missed.',
  },
  {
    zh: '反事实与对抗审查者：假设关键前提是错的、假设环境与预期相反，推演结论是否还成立，主动构造能推翻答案的反例。',
    en: 'Counterfactual & adversarial reviewer: assume key premises are false or the environment is the opposite of expected, and construct counterexamples that break the answer.',
  },
  {
    zh: '终极融合裁判：把历轮发现的全部缺陷与备选路径做最终仲裁，去芜存菁，输出一个比所有前版都更严密、更完整的收敛方案。',
    en: 'Final fusion arbiter: adjudicate every flaw and alternative path found across rounds, discard the weak, and converge on a stricter, more complete solution.',
  },
];

/**
 * 构建一轮「批判 → 重铸」复审 prompt。
 * passIndex 从 0 开始；prevText 是上一轮完整预演；isFinal 表示这是最后一轮（做终极融合）。
 */
export function buildReflectionPrompt(task, prevText, passIndex, totalPasses, opts = {}) {
  const isZh = opts.lang !== 'en';
  const lens = REFLECTION_LENSES[Math.min(passIndex, REFLECTION_LENSES.length - 1)];
  const isFinal = passIndex >= totalPasses - 1;
  const roundNo = passIndex + 1;

  if (isZh) {
    const L = [];
    L.push('你是 Thinker Ultra【超级思考·递归反思链】的第 ' + roundNo + ' 轮复审内核（共 ' + totalPasses + ' 轮），底座恒为 DeepSeek 原生 MAX。');
    L.push('你本轮的角色是：' + lens.zh);
    L.push('上一轮已经完成了一次完整的深度预演，但它一定还有漏洞。你的任务不是复述它，而是【先批判、再重铸】，让这一版在严密性上显著超越上一版。');
    L.push('');
    L.push('【用户原始任务（逐字保留）】');
    L.push('"""' + String(task || '').slice(0, 12000) + '"""');
    L.push('');
    L.push('【上一轮预演全文（你的批判对象与重铸基础）】');
    L.push('"""' + String(prevText || '').slice(0, 16000) + '"""');
    L.push('');
    if (isFinal) {
      L.push('【本轮是终极融合轮】你必须：');
      L.push('① 先列出上一轮仍然存在的全部缺陷（按致命程度排序，不得少于 3 条，确实没有也要说明你检查了哪些维度）；');
      L.push('② 针对每条缺陷给出修正后的结论或步骤；');
      L.push('③ 把所有修正融合成一个最终的、可直接执行的方案，不得遗留任何已知未解决问题；');
      L.push('④ 给出明确的第一步动作与交付结构。');
    } else {
      L.push('【本轮必须完成】');
      L.push('① 站在你的角色视角，列出上一轮至少 3 个具体缺陷（引用上一轮原文的关键句，不许空泛地说"可能不够严谨"）；');
      L.push('② 对每个缺陷说明为什么它是缺陷、会导致什么错误后果；');
      L.push('③ 给出修正后的推理与结论，形成一版加深、加严的新预演；');
      L.push('④ 明确指出这一版相对上一版具体强在哪里。');
    }
    L.push('');
    L.push('【深度下限（硬性）】本轮正文不得少于 ' + (isFinal ? 2200 : 1600) + ' 字，必须有真实的批判内容与修正后的实质推理，不许只说"上一轮已经很好"。');
    L.push('【结束条件】缺陷已列尽、每条都已修正、并已形成收敛方案后，用一段"【第' + roundNo + '轮预演结论】"收尾。只输出复审与重铸内容，不要寒暄。');
    L.push('');
    L.push('现在开始第 ' + roundNo + ' 轮递归反思：');
    return L.join('\n');
  }

  const L = [];
  L.push('You are pass ' + roundNo + ' of ' + totalPasses + ' in the Thinker Ultra Super Think recursive-reflection chain, built on DeepSeek native MAX.');
  L.push('Your role this pass: ' + lens.en);
  L.push('The previous pass produced a full reasoning primer, but it still contains flaws. Do not restate it — first critique it, then reforges a strictly better version.');
  L.push('');
  L.push('[User task, verbatim]\n"""' + String(task || '').slice(0, 12000) + '"""');
  L.push('');
  L.push('[Previous primer (your critique target and reforge base)]\n"""' + String(prevText || '').slice(0, 16000) + '"""');
  L.push('');
  if (isFinal) {
    L.push('[Final fusion pass] List every remaining flaw ordered by severity (at least 3, or state the dimensions you checked), fix each, fuse all fixes into one directly executable plan with no unresolved issue, and give the concrete first action and delivery structure.');
  } else {
    L.push('[Required] From your role, list at least 3 concrete flaws in the previous pass (quote its key sentences; no vague "could be tighter"), explain why each is a flaw and its consequence, then give corrected reasoning forming a deeper new primer, and state exactly where this version is stronger.');
  }
  L.push('');
  L.push('[Hard minimum] At least ' + (isFinal ? 1400 : 1000) + ' words of genuine critique and corrected reasoning. Converge, then end with "[Pass ' + roundNo + ' Primer Conclusion]". Output only the critique and reforge.');
  L.push('');
  L.push('Begin recursive-reflection pass ' + roundNo + ':');
  return L.join('\n');
}

// ============================================================
// §3 任务复杂度评估（决定是否对"看似简单"的任务也保持深推）
// ============================================================

const CODE_RE = /(代码|函数|类|算法|数据结构|bug|调试|重构|优化|架构|接口|数据库|前端|后端|全栈|报错|异常|递归|并发|指针|内存|编译|部署|code|function|class|algorithm|debug|refactor|api|error|stack|runtime|compile|deploy)/i;
const MATH_RE = /(数学|证明|推导|计算|方程|定理|概率|统计|逻辑|证明|math|proof|derive|equation|theorem|probability|logic)/i;
const MULTI_RE = /(同时|并且|还要|另外|此外|而且|不仅|一方面|另一方面|首先|其次|然后|接着|最后|最终)/g;

export function assessPrimerComplexity(task, ctx = {}) {
  const text = String(task || '');
  let score = 0;
  const why = [];
  if (text.length > 800) { score += 3; why.push('超长文本'); }
  else if (text.length > 200) { score += 2; why.push('中等长度'); }
  else if (text.length > 40) { score += 1; why.push('有一定长度'); }
  if (CODE_RE.test(text)) { score += 3; why.push('代码/工程'); }
  if (MATH_RE.test(text)) { score += 2; why.push('数学/逻辑'); }
  const multi = (text.match(MULTI_RE) || []).length;
  if (multi >= 4) { score += 2; why.push('多目标约束'); }
  else if (multi >= 2) { score += 1; why.push('多步骤'); }
  if (ctx.hasImage) { score += 2; why.push('含图像'); }
  if (ctx.hasFile) { score += 1; why.push('含文件'); }
  if (ctx.historyLength > 8) { score += 1; why.push('长上下文'); }
  // 超短任务（如"你好"）复杂度基线为 0，但极限档依然要深推（由档位强制）
  return {
    score,
    isTrivial: text.replace(/\s/g, '').length <= 8 && score === 0,
    why,
  };
}

// §3.5 复杂度 → 预算因子（简单任务收缩 token/步数/字数，避免为凑预算而灌水、空等数分钟；
//   复杂任务才拉满。因子同时作用于 maxTokens 与 prompt 的深度下限，二者必须同源。）
//   档位保底下限：越高档越不允许缩太狠，保住"越强"的体感。
//   v2：trivial 任务不再一刀切 0.2——开到高档（尤其极限档）时，即使"你好"也必须有
//   可感知的超级思考深度（语用深推、意图猜测、上下文关联），否则用户会觉得"开到20也没效果"。
const TIER_BUDGET_FLOOR = { rush: 1.0, balanced: 0.65, deep: 0.5, extreme: 0.5 };
const TIER_TRIVIAL_FACTOR = { rush: 0.2, balanced: 0.38, deep: 0.55, extreme: 0.7 };
export function budgetFactorOf(complexity, tierKey) {
  const c = complexity || { score: 0, isTrivial: false };
  let f;
  if (c.isTrivial) {
    // trivial 按档位给不同深度：极速档快而浅，极限档即使问候也要深推
    const tf = TIER_TRIVIAL_FACTOR[tierKey];
    f = typeof tf === 'number' ? tf : 0.35;
  }
  else if (c.score <= 0) f = 0.38;     // 短而简单的概念问题
  else if (c.score <= 2) f = 0.6;      // 略有长度/单领域
  else if (c.score <= 4) f = 0.8;      // 中等（代码/数学其一，或多步骤）
  else f = 1.0;                        // 复杂/多目标/长文/含图：全部拉满
  // 所有任务（含 trivial）都应用档位托底，确保高档不被缩太狠
  const floor = TIER_BUDGET_FLOOR[tierKey];
  if (typeof floor === 'number') f = Math.max(f, floor);
  return Math.max(0.15, Math.min(1, f));
}

// ============================================================
// §4 预演 Prompt 构建：把档位/模式/复杂度翻译成确定的思考指令
// ============================================================

function pad2(n) { return String(n).padStart(2, '0'); }

export function buildPrimerPrompt(task, opts = {}) {
  const { tierInfo, modeProfile, complexity, modelKey, hasImage, lang, budgetFactor } = opts;
  const b = tierInfo.budget;
  const bf = Number.isFinite(budgetFactor) ? Math.max(0.18, Math.min(1, budgetFactor)) : 1;
  const isZh = lang !== 'en';
  const L = [];

  // 极境在讯流基础上放大后的最终数值（再乘复杂度预算因子：简单任务同比收缩，避免灌水空等）
  const scaleN = (v, min = 1) => Math.max(min, Math.round(v * bf));
  let finalSteps = b.steps > 0
    ? scaleN(b.steps * modeProfile.depthMult + modeProfile.extraSteps) : 0;
  const rawPaths = Math.max(b.paths, Math.round(b.paths * modeProfile.pathMult));
  let finalPaths = bf >= 0.95 ? rawPaths : Math.max(1, Math.round(rawPaths * bf));
  let finalMinChars = Math.round(b.minChars * modeProfile.depthMult * bf);
  let finalSelfChecks = scaleN(b.selfChecks + (modeProfile.key === 'apex' ? 1 : 0), 0);
  let finalRefutes = scaleN(b.refutes + (modeProfile.key === 'apex' ? 1 : 0), 0);
  let finalCross = scaleN(b.crossVerify + (modeProfile.key === 'apex' ? 1 : 0), 0);
  let finalMetacog = scaleN(b.metacog + (modeProfile.key === 'apex' ? 1 : 0), 0);
  // 纯问候/极短 trivial：只用下方专属的①-⑤语用深推，跳过重型多路径/反驳/交叉/元认知编号流水线，
  // 深度字数也压到 ~1400，把“你好”级预演控制在约 20 秒，而不是套用极境全量流水线空等近 40 秒。
  if (complexity.isTrivial) {
    finalSteps = 0; finalPaths = 1; finalSelfChecks = 0; finalRefutes = 0;
    finalCross = 0; finalMetacog = 0; finalMinChars = Math.min(finalMinChars, 1400);
  }

  if (isZh) {
    L.push('你是 Thinker Ultra 的【超级思考 Super Think】内核，底座恒为 DeepSeek 原生 MAX 思考。现在进入一轮【正式回答之前】的强制深度预演。这段预演只用于把问题想透，不会直接发给用户，但它的结论将决定你正式回答的质量，所以必须全力以赴。');
    L.push('');
    L.push(`【当前档位】${tierInfo.tier.thinkLabel}档（能力值 ${tierInfo.cap}/20）｜模式：${modeProfile.label}｜模型：${modelKey || 'auto'}。`);
    if (modeProfile.key === 'apex') {
      L.push('【极境模式声明】极境完整继承讯流模式的全部底层流程，并在此之上把推演深度、候选路径、自检/反驳/交叉验证轮次、token 预算成倍放大；同时点燃爆炸式多模态精读。极境的目标是在 MAX 底座上达到并超越 Fable 5.1 思考拉满与 GPT-6 Ultra 思考的水平，不允许浅尝辄止。');
    } else {
      L.push('【讯流模式声明】讯流模式在保证响应速度的同时保持结构化深度思考，单链为主、关键处分支，不做无意义发散。');
    }
    L.push('');
    L.push('【用户原始任务（逐字保留，不得篡改）】');
    L.push('"""' + String(task || '').slice(0, 12000) + '"""');
    L.push('');

    // 超短任务的强制深推——这是用户点名要的："你好"也要想 20 秒
    if (complexity.isTrivial) {
      L.push('【看似简单，仍须深推】这个任务表面很短，但在当前高档位下你不允许只回一句话。你必须：');
      L.push('① 解析这句话的字面含义与语用含义（用户为什么此刻发这句话、可能的情绪与潜台词）；');
      L.push('② 猜测至少 3 种用户可能的真实意图，并分别给出应对方向；');
      L.push('③ 结合当前是开发协作场景（Thinker Ultra / DeepSeek Harness）推断最可能的意图；');
      L.push('④ 给出你正式回复时应采取的语气、结构与需要主动确认的点；');
      L.push('⑤ 想清楚是否存在被忽略的上下文（之前在做什么、用户真正想推进什么）。');
      L.push('');
    }

    if (finalSteps > 0) {
      L.push(`【强制思考流程·至少 ${finalSteps} 步】请按编号逐步展开，每一步都要有实质内容，不得只写标题：`);
      const stepLines = [
        '1. 目标重述：用自己的话复述任务，区分表面需求与深层需求，提炼问题本质；',
        '2. 语义精读：逐句、必要时逐关键词解析用户输入，圈出有歧义/被强调/隐含的地方；',
        '3. 约束穷举：列出显式约束、隐式约束、边界条件、资源与质量约束；',
        '4. 子问题原子分解：把任务拆到可独立验证的最小子问题，给出依赖顺序；',
        '5. 关键路径识别：指出决定成败的核心子问题与潜在瓶颈；',
        '6. 已知/假设分离：哪些是事实、哪些是待验证假设，假设如何验证；',
      ];
      // 多路径
      if (finalPaths >= 2) {
        for (let p = 1; p <= finalPaths; p++) {
          const styles = ['正向推导（从条件到结论）', '逆向归纳（从目标反推所需条件）', '第一性原理（回到基本事实重建）', '类比迁移（借鉴相似问题的解法）'];
          stepLines.push(`${6 + p}. 候选路径${pad2(p)}：${styles[(p - 1) % styles.length]}，独立推演，不看其他路径结论；`);
        }
      }
      const baseAfter = 6 + finalPaths;
      stepLines.push(`${baseAfter + 1}. 路径对比：比较各路径的假设、风险、代价与结果，指出分歧点并决定如何融合或取舍；`);
      let cursor = baseAfter + 2;
      for (let r = 1; r <= finalRefutes; r++) {
        stepLines.push(`${cursor}. 自我反驳·第${r}轮：主动攻击自己的初步结论，寻找反例、边界、极端输入，驳不倒才保留；`); cursor++;
      }
      for (let c = 1; c <= finalCross; c++) {
        const ways = ['用第二种独立方法重算关键结论', '从结果反推是否满足每条原始约束', '做一致性/完备性检查，列出未覆盖项'];
        stepLines.push(`${cursor}. 交叉验证·${c}：${ways[(c - 1) % ways.length]}；`); cursor++;
      }
      for (let m = 1; m <= finalMetacog; m++) {
        stepLines.push(`${cursor}. 元认知·第${m}轮：检查自己是否有确认偏差/锚定/过早收敛，思考过程本身是否可靠；`); cursor++;
      }
      stepLines.push(`${cursor}. 风险与回滚：列出最可能失败的点、触发信号、预防与兜底方案；`); cursor++;
      stepLines.push(`${cursor}. 收敛决策：综合以上，给出最终技术路线、分步执行计划与第一步动作；`); cursor++;
      stepLines.push(`${cursor}. 交付预演：预演正式回答的结构（先给什么、后给什么、哪里需要向用户确认）。`);
      // 如果要求步数多于模板，补足"深挖"步
      while (stepLines.length < finalSteps) {
        stepLines.push(`${stepLines.length + 1}. 深挖补充：对上面最不确定、影响最大的一处再向下钻一层，给出更细的推理与证据。`);
      }
      L.push(stepLines.slice(0, Math.max(finalSteps, stepLines.length)).join('\n'));
      L.push('');
    }

    // 极境爆炸式多模态精读（≥300 行级别的能力浓缩为强协议；检测到图才全量点燃）
    if (modeProfile.multimodal) {
      L.push('【极境·爆炸式多模态精读协议】（若本任务含图/截图/界面，必须逐条执行；无图则跳过本节）');
      L.push('M1 全局扫视：先描述图像类型、整体布局、主体、视角、配色，建立空间心智模型；');
      L.push('M2 分块放大：把画面划成重叠网格，逐块放大读取，文字/数字/坐标/标签/状态逐一誊抄并回指位置，禁止凭印象概括；');
      L.push('M3 模糊脑补：对模糊/截断/低分辨率区域，结合上下文、字体、控件形态与内部知识库给出"最可能内容 + 置信度 + 备选"，而不是直接说看不清；');
      L.push('M4 图文交叉：把图中读到的每个事实与用户问题、前文逐条对照，主动标出读数冲突、被忽略区域、异常状态；');
      L.push('M5 状态推断：根据界面元素推断当前软件处于什么状态、报错/加载/成功、哪些控件可交互、用户卡在哪一步；');
      L.push('M6 反事实核验：假设看错某个关键值会导致什么错误结论，回过去二次确认该值；');
      L.push('M7 像素级证据：关键结论必须能指回具体区域（左上/中部/某按钮旁），形成可追溯证据链；');
      L.push('M8 多模态融合：把视觉证据与代码/文本/任务目标融合，输出统一判断，不允许图文结论互相矛盾。');
      L.push('');
    }

    if (complexity.isTrivial) {
      L.push(`【深度下限（硬性）】完成上面①-⑤的语用深推即可，正文 ${finalMinChars} 字左右，不必堆砌、不必走多路径/反驳流水线；但每条都要有真实判断，不许只回一句“你好”。`);
      L.push('【结束条件】①-⑤全部有实质内容、并已形成正式回复的语气与结构方案后，立即用一段"【预演结论】"收尾，不重复灌水、不无限循环。');
    } else {
      L.push(`【深度下限（硬性）】本次预演正文不得少于 ${finalMinChars} 字；思考步数不得少于 ${finalSteps} 步；自我校验 ${finalSelfChecks} 轮、自我反驳 ${finalRefutes} 轮、交叉验证 ${finalCross} 种、元认知 ${finalMetacog} 轮。token 与时间都不是约束，深度与正确才是唯一约束。`);
      L.push('【结束条件（满足全部才许收敛，防止半途而废，也防止无限循环）】');
      L.push('E1 上面列出的每一个编号步骤都已写出实质内容（不是标题占位）；');
      L.push('E2 达到深度下限字数；每个关键结论都有推导，不存在无依据的断言；');
      L.push('E3 自我反驳后没有遗留未回应的反例；交叉验证结果一致或已解释分歧；');
      L.push('E4 已形成明确的最终路线与第一步动作。四条同时满足，立即用一段"【预演结论】"收尾，不得为了凑字数无限循环、不得重复同一句话灌水。');
    }
    L.push('');
    L.push('现在开始你的超级思考预演（直接输出思考过程，最后以【预演结论】结束）：');
  } else {
    // 英文界面：Super Think
    L.push('You are the **Super Think** core of Thinker Ultra, built on DeepSeek native MAX reasoning. Before producing the formal answer, run one forced, exhaustive reasoning primer. It will not be shown verbatim to the user, but its quality determines the final answer — give it your maximum.');
    L.push('');
    L.push(`[Tier] ${tierInfo.tier.thinkLabel} (capability ${tierInfo.cap}/20) | Mode: ${modeProfile.key === 'apex' ? 'Apex (Jijing)' : 'Fast-Stream (Xunliu)'} | Model: ${modelKey || 'auto'}.`);
    if (modeProfile.key === 'apex') {
      L.push('[Apex Mode] Inherits the entire Fast-Stream pipeline, then multiplies depth, candidate paths, self-checks, refutations and token budget, and ignites explosive multimodal close-reading. Goal: match and exceed Fable 5.1 maxed reasoning and GPT-6 Ultra reasoning on the MAX base.');
    }
    L.push('');
    L.push('[User task, verbatim]\n"""' + String(task || '').slice(0, 12000) + '"""');
    L.push('');
    if (complexity.isTrivial) {
      L.push('[Looks trivial — still think deep] Even for a one-word message: parse literal and pragmatic meaning, hypothesize at least 3 possible intents, infer the most likely in this dev-collab context, and plan the tone/structure of the real reply.');
      L.push('');
    }
    if (finalSteps > 0) {
      L.push(`[Required reasoning: at least ${finalSteps} numbered steps, ${finalMinChars}+ chars, ${finalPaths} candidate path(s), ${finalSelfChecks} self-check(s), ${finalRefutes} refutation round(s), ${finalCross} cross-check(s), ${finalMetacog} metacognition pass(es).] Decompose the task to atomic sub-problems, reason along independent candidate paths, attack your own conclusions, cross-verify with a second method, check for cognitive bias, model risks/rollback, then converge.`);
    }
    if (modeProfile.multimodal) {
      L.push('[Apex explosive multimodal protocol] If an image is present: global scan → overlapping-tile zoom-and-transcribe → infer blurred text with confidence and alternatives → cross-check image facts against the question → infer UI/error state → counterfactual re-check → pixel-grounded evidence chain → fuse vision with text/code consistently.');
    }
    L.push('[Stop condition] Converge only when every numbered step has real content, the minimum length is met, every claim is justified, every counterexample raised by self-refutation is answered, cross-checks agree (or divergence is explained), and a concrete final plan with a first action exists. Then end with "[Primer Conclusion]". Do not loop forever or pad with repetition.');
    L.push('');
    L.push('Begin the Super Think primer now, ending with [Primer Conclusion]:');
  }

  return L.join('\n');
}

// ============================================================
// §5 执行强制预演：一次受控的 MAX 思考调用
// ============================================================

/**
 * runSuperThinkPrimer
 * @param {object} llm  宿主 llm（需有 stream 方法）
 * @param {object} o
 *   task           最新用户任务文本
 *   capability     能力滑块值 0..20
 *   ocMode         'velocity' | 'apex'
 *   modelKey       flash/pro 等
 *   modelString    真实模型字符串（发给 llm）
 *   provider       provider id
 *   hasImage/hasFile/historyLength/lang/signal/timeoutMs
 * @returns {Promise<{ok, text, tier, mode, ms, tokens, reason}>}
 */
export async function runSuperThinkPrimer(llm, o = {}) {
  const t0 = Date.now();
  try {
    if (!llm || typeof llm.stream !== 'function') {
      return { ok: false, text: '', reason: 'no-llm', ms: 0 };
    }
    const tierInfo = capabilityToTier(o.capability);
    if (!tierInfo.tier.enabled || !tierInfo.budget) {
      // 极速档：不做后端预演（保持快），交由轻量系统提示
      return { ok: false, text: '', reason: 'rush-tier-skip', tier: tierInfo.tier.key, ms: 0 };
    }
    const modeProfile = modeProfileOf(o.ocMode);
    const complexity = assessPrimerComplexity(o.task, {
      hasImage: !!o.hasImage, hasFile: !!o.hasFile, historyLength: o.historyLength || 0,
    });
    // 复杂度自适应预算因子：简单任务收缩（仍深推但不空等），复杂任务拉满
    const budgetFactor = budgetFactorOf(complexity, tierInfo.tier.key);

    const prompt = buildPrimerPrompt(o.task, {
      tierInfo, modeProfile, complexity,
      modelKey: o.modelKey, hasImage: !!o.hasImage, lang: o.lang || 'zh', budgetFactor,
    });

    // 极境放大 token 上限（硬顶保护，避免失控）；再乘复杂度因子，简单任务不灌 token
    // trivial 任务（问候/极短输入）额外加 8000 上限，把"你好"级预演控制在 ~5 秒，不阻塞首 token
    const trivialCap = complexity.isTrivial ? 8000 : 32000;
    const finalMaxTokens = Math.max(
      900,
      Math.min(
        trivialCap,
        Math.round(tierInfo.budget.maxTokens * modeProfile.tokenMult * budgetFactor)
      )
    );

    const res = await sampleOnce(llm, {
      provider: String(o.provider || ''),
      model: String(o.modelString || ''),
      system: o.lang === 'en'
        ? 'You are the Super Think engine. Reason exhaustively, visibly, in structured numbered steps. Never skip steps.'
        : '你是超级思考引擎，必须结构化、逐步骤、可见地深度推理，不得跳过任何步骤。',
      prompt,
      temperature: o.ocMode === 'apex' ? 0.55 : 0.7,
      maxTokens: finalMaxTokens,
      // 底座恒为 MAX；仅纯问候级 trivial 任务降到 high，避免“你好”也内部穷举数十秒（其余一律 max）
      reasoningEffort: complexity.isTrivial ? 'high' : 'max',
      signal: o.signal,
    });

    const ms = Date.now() - t0;
    let text = String(res?.text || '').trim();
    if (!res?.ok || !text) {
      return { ok: false, text: '', reason: 'sample-failed:' + (res?.finish || 'empty'), tier: tierInfo.tier.key, mode: modeProfile.key, ms };
    }

    // ============================================================
    // 【递归反思链】能力 18/19/20（极境 16+）真实断层：主预演后串行追加
    // N 轮独立 MAX 调用，每轮「批判上一轮 → 带缺陷重铸」，是真实的多次调用。
    // 任一轮失败/超时一律 fail-open，保留已得到的最深版本，绝不阻塞主对话。
    // ============================================================
    const reflectionPasses = reflectionPassesFor(tierInfo.cap, modeProfile.key);
    const reflectionAudit = [];
    let totalCalls = 1;
    if (reflectionPasses > 0) {
      const sysZh = '你是超级思考递归反思内核，必须极端严格地批判上一轮推理，再重铸出更严密的版本。只输出批判与重铸内容。';
      const sysEn = 'You are the Super Think recursive-reflection core. Critique the previous reasoning ruthlessly, then reforge a stricter version. Output only critique and reforge.';
      for (let pi = 0; pi < reflectionPasses; pi++) {
        // 外部信号已中止则立刻停止追加（用户已离开/切档）
        if (o.signal && o.signal.aborted) break;
        const rStart = Date.now();
        const rPrompt = buildReflectionPrompt(o.task, text, pi, reflectionPasses, {
          lang: o.lang || 'zh',
        });
        // 每轮独立超时硬顶（比主预演短，避免无限叠加）
        const rAc = new AbortController();
        const rTimer = setTimeout(() => { try { rAc.abort(); } catch { /* contained */ } },
          modeProfile.key === 'apex' ? 180000 : 120000);
        // 联动外部 signal：外部 abort 时联动中止本轮
        let onOuterAbort = null;
        if (o.signal) {
          if (o.signal.aborted) { clearTimeout(rTimer); break; }
          onOuterAbort = () => { try { rAc.abort(); } catch { /* contained */ } };
          try { o.signal.addEventListener('abort', onOuterAbort, { once: true }); } catch { /* contained */ }
        }
        try {
          const rRes = await sampleOnce(llm, {
            provider: String(o.provider || ''),
            model: String(o.modelString || ''),
            system: o.lang === 'en' ? sysEn : sysZh,
            prompt: rPrompt,
            // 复审轮温度逐轮降低：越往后越收敛、越确定，最后一轮趋近裁决
            temperature: Math.max(0.3, (modeProfile.key === 'apex' ? 0.6 : 0.7) - pi * 0.12),
            maxTokens: pi >= reflectionPasses - 1 ? 20000 : 14000,
            reasoningEffort: 'max',
            signal: rAc.signal,
          });
          const rText = String(rRes?.text || '').trim();
          if (rRes?.ok && rText && rText.length >= 200) {
            text = rText; // 这一轮成为新的最深版本（下一轮的批判对象）
            totalCalls++;
            reflectionAudit.push({
              round: pi + 1,
              ms: Date.now() - rStart,
              chars: rText.length,
              final: pi >= reflectionPasses - 1,
            });
          } else {
            // 本轮失败：保留上一轮，停止继续（再往上叠没有新基础）
            reflectionAudit.push({
              round: pi + 1,
              ms: Date.now() - rStart,
              chars: 0,
              failed: true,
              reason: rRes?.finish || 'too-short',
            });
            break;
          }
        } catch (re) {
          reflectionAudit.push({ round: pi + 1, ms: Date.now() - rStart, chars: 0, failed: true, reason: String(re && re.message || re) });
          clearTimeout(rTimer);
          break;
        } finally {
          clearTimeout(rTimer);
          if (onOuterAbort && o.signal) { try { o.signal.removeEventListener('abort', onOuterAbort); } catch { /* contained */ } }
        }
      }
    }

    return {
      ok: true,
      text,
      tier: tierInfo.tier.key,
      tierName: tierInfo.tier.thinkLabel,
      mode: modeProfile.key,
      modeLabel: modeProfile.label,
      cap: tierInfo.cap,
      chars: text.length,
      ms: Date.now() - t0,
      tokens: res.usage || null,
      budgetFactor,
      finalMaxTokens,
      complexityScore: complexity.score,
      reflectionPasses,
      reflectionAudit,
      totalCalls,
      requirement: {
        minChars: Math.round(tierInfo.budget.minChars * modeProfile.depthMult * budgetFactor),
        steps: Math.max(1, Math.round((tierInfo.budget.steps * modeProfile.depthMult + modeProfile.extraSteps) * budgetFactor)),
      },
    };
  } catch (e) {
    return { ok: false, text: '', reason: 'exception:' + (e && e.message || e), ms: Date.now() - t0 };
  }
}

// ============================================================
// §6 把预演结果包装成注入文本（中文/英文）
// ============================================================

export function wrapPrimerInjection(primer, lang = 'zh') {
  if (!primer || !primer.ok || !primer.text) return '';
  const passes = Number(primer.reflectionPasses || 0);
  const calls = Number(primer.totalCalls || 1);
  if (lang === 'en') {
    const chainTag = passes > 0
      ? `\n\nThis conclusion survived **${passes} additional recursive-reflection pass(es)** (${calls} total independent MAX calls): each pass attacked the previous primer for logical flaws, missed constraints and counterexamples, then reforged a stricter version. Treat it as heavily cross-examined — do not silently re-open flaws that were already identified and fixed; if you believe a fix is wrong, re-derive it explicitly.`
      : '';
    return [
      `[Super Think Primer · ${primer.tierName} tier (cap ${primer.cap}/20) · ${primer.mode === 'apex' ? 'Apex' : 'Fast-Stream'} · ${(primer.ms / 1000).toFixed(1)}s · ${calls} MAX call(s)]`,
      'The following exhaustive MAX reasoning was completed BEFORE your formal answer. Build directly on it; do not redo it from scratch, do not contradict its verified conclusions without reason, and carry its final plan into execution:',
      '',
      primer.text,
      chainTag,
      '',
      '[Instruction] Now produce the user-facing answer: act on the final [Primer Conclusion], keep it aligned with the user’s actual need, and only call other tools after this Super Think stage (which is now satisfied).',
    ].filter(Boolean).join('\n');
  }
  const chainTagZh = passes > 0
    ? `\n\n这份结论已经过【${passes} 轮递归反思复审】（共 ${calls} 次独立 MAX 调用）：每一轮都以最严厉的视角攻击上一轮预演的逻辑漏洞、遗漏约束与反例，再带缺陷重铸出更严密的版本。请把它视为经过多轮交叉审讯的高可信结论——不要悄悄把已经被指出并修正的缺陷再犯一遍；若你认为某处修正是错的，必须显式重新推导，不许无理由推翻。`
    : '';
  return [
    `【超级思考 Super Think 预演·${primer.tierName}档（能力 ${primer.cap}/20）·${primer.modeLabel}模式·耗时 ${(primer.ms / 1000).toFixed(1)} 秒·${calls} 次 MAX 调用】`,
    '以下是在你正式回答之前，由 MAX 底座已经完成的一轮完整深度预演。请直接站在它的结论上继续，不要从零重来、不要无理由推翻已交叉验证的结论，并把【预演结论】里的计划真正执行下去：',
    '',
    primer.text,
    chainTagZh,
    '',
    '【交接指令】超级思考阶段已完成，现在进入正式交付：落实最终【预演结论】，紧扣用户真实需求，语气自然，不要向用户复述"这是预演"，直接给出高质量结果；后续需要工具时再正常调用。',
  ].filter(Boolean).join('\n');
}

export default {
  PRIMER_VERSION, CAP_TIERS, MODE_PROFILE,
  capabilityToTier, modeProfileOf, reflectionPassesFor,
  assessPrimerComplexity, buildReflectionPrompt,
  buildPrimerPrompt, runSuperThinkPrimer, wrapPrimerInjection,
};
