// reasoning-toolkit.js — Think 正向推理工具箱（L3）。
// 与事后挑错的 verify/tournament 不同：这里用多种推理范式把问题"独立再解一遍"，
// 每个算子是一路真实独立 MAX 调用（sampleOnce 内部 reasoningEffort=max，即建在 Max 底座上）。
// 算子并行发起（总延迟≈单次而非叠加）；只有 >=2 路独立算子都指出主回复同一处缺口时才交叉确认，
// 再起一路综合把补强结论接回，单路幻觉不推翻主回复。双模型算子集不同：Flash 精简、Pro 最全、Vision 加视觉重建。

import { sampleOnce } from './tournament-engine.js';

const clampTier = (v) => {
  const n = Math.round(Number(v) || 0);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(6, n));
};

// 通用核心算子（Flash / Pro / Vision 共用）
const CORE_OPERATORS = [
  {
    key: 'backward',
    name: '逆向归约',
    brief: '从最终要交付的结论倒推：列出使该结论成立必须满足的全部子条件，逐一回到原题数据与前提核验，哪个子条件没被保证，就沿缺口补齐推导链。',
  },
  {
    key: 'decompose',
    name: '分治拆解',
    brief: '把问题切成互相独立、可单独求解的子问题，逐个给出中间结果，再按依赖关系自底向上合并，显式写出每一步中间量。',
  },
  {
    key: 'falsify',
    name: '反例证伪',
    brief: '主动构造能推翻当前结论的反例与边界输入：零值、负号、极值、空集、顺序颠倒、单位混用，逐一代入；只要一个反例成立就修正结论并说明。',
  },
  {
    key: 'constraint',
    name: '约束传播',
    brief: '列出题面全部硬约束，逐条核验当前解是否满足；任一违背就定位违背点重解，最后做量纲、单位、数量级一致性检查。',
  },
];

// Pro 专属高阶算子
const PRO_OPERATORS = [
  {
    key: 'firstprinciples',
    name: '第一性原理',
    brief: '剥离类比与经验套路，回到不可再分的定义、公理、不变量重新推导，再逐层向上重建结论，标注哪一步依赖了未经证明的假设。',
  },
  {
    key: 'formalize',
    name: '形式化重述',
    brief: '把自然语言问题重写成方程 / 状态转移 / 形式结构，在形式层求解后再无损映射回原题，核对重写过程没有偷换语义或丢约束。',
  },
];

// Vision 专属算子（深度看图）
const VISION_OPERATORS = [
  {
    key: 'spatial',
    name: '视觉结构重建',
    brief: '把图中实体、文字、空间/拓扑关系、箭头与流程方向重建成关系图，沿图路径重新推一遍图文结论，专门核对是否漏看遮挡、小字、坐标轴方向与图例。',
  },
];

function pickOperators(modelTier, tier) {
  const t = clampTier(tier);
  if (t <= 0) return [];
  let ops;
  if (t <= 2) ops = CORE_OPERATORS.slice(0, 2);
  else ops = CORE_OPERATORS.slice();
  if (t >= 5) {
    if (modelTier === 'pro') ops = ops.concat(PRO_OPERATORS);
    else if (modelTier === 'flash') ops = ops.concat(VISION_OPERATORS);
  }
  // 模型承载力封顶：Flash 4 / Vision 5 / Pro 6（全部并行，不叠加延迟）
  const cap = modelTier === 'pro' ? 6 : modelTier === 'flash' ? 5 : 4;
  return ops.slice(0, cap);
}

function operatorPrompt(task, seed, op) {
  return [
    '你是一个只使用「' + op.name + '」这一种推理范式的求解器，独立把下面问题重新解一遍，不要参考既有结论的思路。',
    '【推理范式】' + op.brief,
    '【原始任务】\n' + String(task || '').slice(0, 4000),
    '【主回复（供你对照，不允许盲从）】\n' + String(seed || '').slice(0, 6000),
    '只输出一个 JSON：{"findings":["关键中间结论1","关键中间结论2"],"conclusion":"你这一路独立推出的结论","confidence":0到1之间的数,"disagreesWithSeed":主回复是否存在实质错误或关键缺失(布尔),"gap":"若有实质分歧，一句话点明缺/错在哪；没有就留空"}',
  ].join('\n\n');
}

function parseOp(raw) {
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return {
      findings: Array.isArray(j.findings) ? j.findings.map(String).slice(0, 6) : [],
      conclusion: String(j.conclusion || '').slice(0, 1200),
      confidence: Number.isFinite(Number(j.confidence)) ? Math.max(0, Math.min(1, Number(j.confidence))) : 0,
      disagrees: !!j.disagreesWithSeed,
      gap: String(j.gap || '').slice(0, 400),
    };
  } catch { return null; }
}

function synthPrompt(task, seed, lanes) {
  const lanesText = lanes
    .map((l, i) => `推理路${i + 1}（${l.opName}）：\n结论：${l.conclusion}\n指出的缺口：${l.gap || '无'}\n关键依据：${l.findings.join('；') || '无'}`)
    .join('\n\n');
  return [
    '下面是用多种独立推理范式对同一任务重新求解的结果，它们一致指出主回复存在实质缺口。请产出整合后的最终交付：',
    '【原始任务】\n' + String(task || '').slice(0, 4000),
    '【主回复】\n' + String(seed || '').slice(0, 6000),
    '【多路独立推理结果】\n' + lanesText,
    '要求：以多数独立推理路一致的结论为准修正/补强主回复，保留其中正确部分，补齐被多路一致指出的缺口；直接给完整最终结果，不要寒暄、不要复述题目、不要提到"推理路/算子/工具箱"这些元词。',
  ].join('\n\n');
}

/**
 * 正向推理工具箱。
 * cfg: { provider, model, modelTier('flash'|'pro'), tier(deep档), task, seedText, maxTokens?, signal?, log? }
 * 返回 { ran, operators, calls, triggered, converge, synthesis }
 */
export async function runReasoningToolkit(llm, cfg) {
  const log = typeof cfg.log === 'function' ? cfg.log : () => {};
  const tier = clampTier(cfg.tier);
  const calls = { lanes: 0, synth: 0, failed: 0 };
  const none = { ran: false, operators: 0, calls, triggered: false, converge: 0, synthesis: '' };
  if (tier <= 0 || !llm || typeof llm.stream !== 'function') return none;
  const task = String(cfg.task || '');
  const seed = String(cfg.seedText || '');
  if (task.length < 4 || seed.length < 24) return none;

  const ops = pickOperators(cfg.modelTier, tier);
  if (!ops.length) return none;

  const lanes = (await Promise.all(ops.map((op) =>
    sampleOnce(llm, {
      provider: cfg.provider,
      model: cfg.model,
      system: '你是单一推理范式求解器，只输出 JSON。',
      prompt: operatorPrompt(task, seed, op),
      temperature: 0.4,
      maxTokens: cfg.maxTokens,
      signal: cfg.signal,
    }).then((r) => {
      if (!r || r.ok === false) { calls.failed++; return null; }
      calls.lanes++;
      const parsed = parseOp(r.text);
      if (!parsed) { calls.failed++; return null; }
      return { ...parsed, opName: op.name, opKey: op.key, ok: r.ok };
    }).catch(() => { calls.failed++; return null; })
  ))).filter(Boolean);

  if (!lanes.length) {
    log('reasoning-toolkit: 全部推理路失败，跳过（不影响主回复）');
    return { ...none, ran: true, operators: ops.length, calls };
  }

  // 交叉确认：>=2 路独立算子都判分歧且各自给出非空缺口，才认定主回复真有缺口（单路不动主回复）
  const dissent = lanes.filter((l) => l.disagrees && l.gap && l.gap.length >= 6);
  const gapSeen = new Map();
  dissent.forEach((l) => {
    const head = l.gap.slice(0, 18);
    gapSeen.set(head, (gapSeen.get(head) || 0) + 1);
  });
  let converge = 0;
  for (const n of gapSeen.values()) if (n >= 2) converge++;
  const confirmed = dissent.length >= 2 && converge >= 1;
  log('reasoning-toolkit: tier=' + tier + ' lanes=' + lanes.length + ' dissent=' + dissent.length + ' converge=' + converge + ' triggered=' + confirmed);
  if (!confirmed) {
    return { ran: true, operators: ops.length, calls, triggered: false, converge, synthesis: '' };
  }

  const syn = await sampleOnce(llm, {
    provider: cfg.provider,
    model: cfg.model,
    system: '你是最终整合者，直接交付补强后的完整结果。',
    prompt: synthPrompt(task, seed, dissent.slice(0, 6)),
    temperature: 0.45,
    maxTokens: cfg.maxTokens,
    signal: cfg.signal,
  });
  calls.synth++;
  if (!syn.ok || !syn.text || syn.text.length < 24) {
    calls.failed++;
    return { ran: true, operators: ops.length, calls, triggered: false, converge, synthesis: '' };
  }
  return { ran: true, operators: ops.length, calls, triggered: true, converge, synthesis: syn.text };
}

export const reasoningToolkitTiers = { pickOperators, CORE_OPERATORS, PRO_OPERATORS, VISION_OPERATORS };

export default { runReasoningToolkit, reasoningToolkitTiers };
