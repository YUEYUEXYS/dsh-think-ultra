// oc-core.js — Ultra 超频集成（Overclock Ensemble, OC）数值事实源与调度规划。
// 纯函数、零副作用、可单测。所有数字都会被 oc-engine 真实消费成：
//   独立 LLM 采样条数 / 自洽投票轮 / 带缺陷回炉轮 / 每路深推层 / 证伪轮 / token 预算倍数，
// 不是提示词修饰。双模式严格隔离：velocity 迅流一键复位单链；apex 极境放开集成。
// 两模型分流：Flash=V41 原生多模态（文本蜂群超频 + 多尺度读图网格，以调用量补单链、以量反超），
//   Pro=少而深精锐攻坚，纯推理天花板最高。独立 Vision 模型已彻底下架，视觉调度全部并入 Flash。
//
// 【极境本质·铁律】Apex 极境不是另一套与迅流并列的东西：它的底子 100% 是 Velocity 迅流——
//   原生 MAX 基座单链深推永远保底存在（主链不丢、deepPerLane≥1、底座恒为原生 MAX），
//   然后在这条完整迅流主链之上，以“补丁叠加”方式逐层挂载蜂群采样/投票/回炉/元反思/证伪，
//   档位越高只是叠加的补丁越厚，绝不允许高档位把低档位（含迅流底子）的任何能力替换掉或漏掉。

export const ULTRA_MODES = {
  velocity: { id: 'velocity', label: '迅流', labelEn: 'Velocity', ensemble: false, tone: 'cool' },
  apex: { id: 'apex', label: '极境', labelEn: 'Apex', ensemble: true, tone: 'blood' },
  // 第三模式只做干净占位：灰显锁定、不可点、不占任何调度资源
  locked: { id: 'locked', label: '???', labelEn: 'Locked', locked: true, ensemble: false, tone: 'void' },
};

// OC 超频四点位：off 关闭 / balanced 均衡 / swarm 蜂群 / crush 碾压(MAX)。
// samples=独立候选采样条数；votes=自洽投票轮；reforge=带缺陷回炉轮；cross=候选交叉验证；
// deep=每路深推层数（Pro 偏深）；tempBase=同批采样基线温度（沿阶梯抬升换覆盖率）；
// tile=多模态读图分区网格数（仅 Flash 承载，V41 原生看图）；conf=图像证据置信阈值。
// 单调铁律：off→balanced→swarm→crush 每个调度量只增不减；off 即“纯迅流底子”。
const OC_TABLE = {
  flash: {
    // Flash V41：多模态蜂群，靠候选数量与读图网格广覆盖，以量补强、以多反超单链大模型
    off:      { samples: 1,  votes: 0, reforge: 0, cross: false, deep: 1, tempBase: 0.60, tile: 1,  conf: 0.50 },
    balanced: { samples: 4,  votes: 1, reforge: 1, cross: false, deep: 2, tempBase: 0.76, tile: 4,  conf: 0.62 },
    swarm:    { samples: 8,  votes: 2, reforge: 2, cross: true,  deep: 3, tempBase: 0.88, tile: 9,  conf: 0.72 },
    crush:    { samples: 16, votes: 4, reforge: 4, cross: true,  deep: 4, tempBase: 1.00, tile: 16, conf: 0.85 },
  },
  pro: {
    // Pro：少而深，候选不多但每条分支深回溯、多层元反思，满功率深推层数最高
    off:      { samples: 1, votes: 0, reforge: 0, cross: false, deep: 1,  tempBase: 0.55 },
    balanced: { samples: 2, votes: 1, reforge: 1, cross: true,  deep: 3,  tempBase: 0.66 },
    swarm:    { samples: 3, votes: 2, reforge: 2, cross: true,  deep: 6,  tempBase: 0.76 },
    crush:    { samples: 5, votes: 4, reforge: 5, cross: true,  deep: 10, tempBase: 0.84 },
  },
};
export const OC_LEVELS = ['off', 'balanced', 'swarm', 'crush'];
export const OC_LEVEL_LABEL = {
  off: '关闭', balanced: '均衡', swarm: '蜂群', crush: '满功率',
};

// Token 开销点位：相对单链的总预算倍数（1× / 2× / 4× / 8×；id 保留 max 以兼容旧存档）
export const TOKEN_TIERS = [
  { id: 't1', label: '1×', mult: 1.0 },
  { id: 't2', label: '2×', mult: 2.0 },
  { id: 't4', label: '4×', mult: 4.0 },
  { id: 'max', label: '8×', mult: 8.0 },
];

// 推理质量档：叠加在 OC 点位上的组合乘子（候选广度 / 回溯 / 元反思）。
// 补丁叠加口径：高档位 = 低档位全部能力 + 本层新增补丁，数值单调递增，绝不替换底层。
//   标准≈迅流底子；强化补一轮回溯/反思；绝顶三层元反思；超限递归回溯；终极多层自我推翻重建。
// 后两档为 think 深层级，Flash V41 与 Pro 天花板均可达 ultimate（见 APEX_CEILING，双端同源）。
const QUALITY = {
  standard:   { breadth: 1.0,  rollback: 0, reflect: 0 },
  enhanced:   { breadth: 1.15, rollback: 1, reflect: 1 },
  zenith:     { breadth: 1.4,  rollback: 3, reflect: 3 },
  transcend:  { breadth: 1.7,  rollback: 5, reflect: 5 },
  ultimate:   { breadth: 2.0,  rollback: 7, reflect: 8 },
};
export const QUALITY_LEVELS = ['standard', 'enhanced', 'zenith', 'transcend', 'ultimate'];
export const QUALITY_LABEL = { standard: '标准', enhanced: '强化', zenith: '绝顶', transcend: '超限', ultimate: '终极' };

// 自我证伪强度：元反思/证伪预算下的真实执行轮数（不是独立假开关）
export const FALSIFY_LEVELS = { off: { rounds: 0 }, mid: { rounds: 1 }, strong: { rounds: 3 } };
export const FALSIFY_LABEL = { off: '关闭', mid: '中', strong: '强' };

// 工具箱激进度 0..4；最小触发原则，默认偏保守（1）——模型自己能推出来的绝不调工具
export const TOOL_AGGRO_MAX = 4;

// 迅流预设：切回迅流时用它把全部极境参数一键复位，杜绝残留
export const VELOCITY_PRESET = Object.freeze({
  mode: 'velocity', oc: 'off', token: 't1', quality: 'standard', falsify: 'off', toolAggro: 1,
});

// 任何历史/外部模型名归一到两个模型组：vision/vl/multimodal/image 全部落 Flash（V41 原生多模态）
export function modelGroupOf(modelKey) {
  const m = String(modelKey || '');
  if (/vision|vl|multimodal|image|flash/i.test(m)) return 'flash';
  return 'pro';
}

const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));

// 极境封顶矩阵（与前端 constants.cjs APEX_CEILING 同构，双端单一事实）：
// Flash V41 拉满到「终极」：OC 可碾压、token 可 8×、质量到终极、证伪到强、工具激进度满（多模态蜂群命门放开）；
// Pro 同为终极天花板。host 侧强制钳制：旧持久化或手改越界也无法突破模型上限。
const ORDER_OC = { off: 0, balanced: 1, swarm: 2, crush: 3 };
const ORDER_Q = { standard: 0, enhanced: 1, zenith: 2, transcend: 3, ultimate: 4 };
const ORDER_F = { off: 0, mid: 1, strong: 2 };
const ORDER_T = { t1: 0, t2: 1, t4: 2, max: 3 };
export const APEX_CEILING = {
  flash: { oc: 'crush', token: 'max', quality: 'ultimate', falsify: 'strong', toolAggro: 4 },
  pro:   { oc: 'crush', token: 'max', quality: 'ultimate', falsify: 'strong', toolAggro: 4 },
};
function pickAtMost(order, v, ceilKey) { return (order[v] ?? -1) > order[ceilKey] ? ceilKey : v; }
export function clampUiToCeiling(group, ui = {}) {
  const g = group === 'flash' || group === 'pro' ? group : 'flash';
  const c = APEX_CEILING[g];
  return {
    mode: ui.mode,
    oc: pickAtMost(ORDER_OC, ui.oc, c.oc),
    token: pickAtMost(ORDER_T, ui.token, c.token),
    quality: pickAtMost(ORDER_Q, ui.quality, c.quality),
    falsify: pickAtMost(ORDER_F, ui.falsify, c.falsify),
    toolAggro: Math.min(Number(ui.toolAggro ?? 1) | 0, c.toolAggro),
  };
}

// 一次 OC 调度的总独立 LLM 调用估算：候选采样 + 投票复评 + 回炉重采样 + 证伪 + 交叉验证
export function estimateCalls(p) {
  const s = p.samples || 1;
  if (!p.ensemble) return 1;
  const vote = (p.voteRounds || 0) * s;
  const reforge = (p.reforgeRounds || 0) * Math.max(2, Math.ceil(s / 2));
  const fals = (p.falsifyRounds || 0) * s;
  const cross = p.crossCheck ? s : 0;
  return s + vote + reforge + fals + cross;
}

/**
 * 由 UI 状态产出本次 OC 真实调度计划（冻结，防止下游被意外改写）。
 * ui: { mode, oc, token, quality, falsify, toolAggro }
 */
export function ocPlan(modelKey, ui = {}) {
  const group = modelGroupOf(modelKey);
  const mode = ULTRA_MODES[ui.mode] ? ui.mode : 'velocity';

  if (mode !== 'apex') {
    // 迅流 / 锁定：单链、零集成、零回溯，任何极境残留都不带下来。
    // 这同时是「极境的底子」：极境主链保底必须与此完全一致（原生 MAX 单链深推）。
    return Object.freeze({
      modelGroup: group, mode, ensemble: false,
      samples: 1, voteRounds: 0, reforgeRounds: 0, crossCheck: false,
      deepPerLane: 1, reflectRounds: 0, falsifyRounds: 0,
      tokenMult: 1.0, toolAggro: mode === 'locked' ? 0 : 1,
      temperature: 0.6, tileGrid: group === 'flash' ? 1 : 0, evidenceConf: group === 'flash' ? 0.5 : 0,
      baseVelocity: true, estCalls: 1,
    });
  }

  // host 侧按模型组强制钳到封顶（Flash V41 与 Pro 均到终极天花板；防旧持久化越界）
  const uiC = clampUiToCeiling(group, ui);
  const ocLevel = OC_LEVELS.includes(uiC.oc) ? uiC.oc : 'off';
  const base = OC_TABLE[group][ocLevel] || OC_TABLE[group].off;
  const qKey = QUALITY_LEVELS.includes(uiC.quality) ? uiC.quality : 'standard';
  const q = QUALITY[qKey];
  const fal = FALSIFY_LEVELS[uiC.falsify in FALSIFY_LEVELS ? uiC.falsify : 'off'];
  const tokenTier = TOKEN_TIERS.find((t) => t.id === uiC.token) || TOKEN_TIERS[0];
  const toolAggro = clampInt(uiC.toolAggro ?? 1, 0, TOOL_AGGRO_MAX);

  const samples = group === 'flash'
    ? base.samples
    : Math.max(1, Math.round(base.samples * q.breadth));
  const ensemble = samples > 1;

  // 【极境 = 迅流底子 + 超频补丁叠加】
  // deepPerLane：每条候选链的深推层 = OC 基座深推 + 质量档元反思补丁，且至少保住迅流主链的 1 层 MAX 深推。
  // 主链（lane 0）恒走原生 MAX 单链深推，其余候选链并行补强，任何档位都不丢失这条底子。
  const plan = {
    modelGroup: group,
    mode: 'apex',
    ocLevel,
    qualityTier: qKey,
    baseVelocity: true,            // 标记：极境已完整继承迅流 MAX 底子
    ensemble,
    samples,
    voteRounds: ensemble ? base.votes : 0,
    // 回炉重采样依赖多候选，单链(off)时强制归零；深度/反思/证伪仍可作用于主链故保留
    reforgeRounds: ensemble ? base.reforge + q.rollback : 0,
    crossCheck: !!base.cross,
    deepPerLane: Math.max(1, (base.deep || 1) + q.reflect),
    primaryLaneMax: true,          // 主链恒为原生 MAX，永不被超频稀释
    reflectRounds: q.reflect,
    falsifyRounds: fal.rounds,
    tokenMult: tokenTier.mult,
    tokenTier: tokenTier.id,
    toolAggro,
    temperature: base.tempBase || 0.8,
    tileGrid: group === 'flash' ? (base.tile || 1) : 0,
    evidenceConf: group === 'flash' ? (base.conf || 0.5) : 0,
  };
  plan.estCalls = estimateCalls(plan);
  return Object.freeze(plan);
}

const MONO_KEYS = ['samples', 'voteRounds', 'reforgeRounds', 'deepPerLane', 'falsifyRounds', 'estCalls'];

// 自证：同模型、其余拉满下，OC 档位 off→crush 关键调度量必须单调不减（任意组合只强不弱）
export function policyIsMonotone(modelKey) {
  let prev = null;
  for (const level of OC_LEVELS) {
    const p = ocPlan(modelKey, { mode: 'apex', oc: level, token: 'max', quality: 'ultimate', falsify: 'strong', toolAggro: 4 });
    if (prev) {
      for (const k of MONO_KEYS) {
        if (p[k] < prev[k]) return { ok: false, model: modelGroupOf(modelKey), at: level, key: k, prev: prev[k], now: p[k] };
      }
    }
    prev = p;
  }
  return { ok: true, model: modelGroupOf(modelKey) };
}

// 自证：迅流对任意极境输入都必须复位为单链零集成
export function velocityResets(modelKey) {
  const p = ocPlan(modelKey, { mode: 'velocity', oc: 'crush', token: 'max', quality: 'ultimate', falsify: 'strong', toolAggro: 4 });
  const ok = !p.ensemble && p.samples === 1 && p.voteRounds === 0 && p.reforgeRounds === 0 &&
    p.falsifyRounds === 0 && p.tokenMult === 1.0 && p.estCalls === 1;
  return { ok, plan: p };
}

// 自证：极境任意档位都必须完整继承迅流底子（主链 MAX 保底标记 + deepPerLane≥1）
export function apexCarriesVelocity(modelKey) {
  for (const level of OC_LEVELS) {
    const p = ocPlan(modelKey, { mode: 'apex', oc: level, token: 'max', quality: 'ultimate', falsify: 'strong', toolAggro: 4 });
    if (!p.baseVelocity || !p.primaryLaneMax || p.deepPerLane < 1) {
      return { ok: false, model: modelGroupOf(modelKey), at: level };
    }
  }
  return { ok: true, model: modelGroupOf(modelKey) };
}

export default {
  ULTRA_MODES, OC_LEVELS, OC_LEVEL_LABEL, TOKEN_TIERS, QUALITY_LEVELS, QUALITY_LABEL,
  FALSIFY_LEVELS, FALSIFY_LABEL, TOOL_AGGRO_MAX, VELOCITY_PRESET, APEX_CEILING,
  modelGroupOf, ocPlan, estimateCalls, policyIsMonotone, velocityResets, apexCarriesVelocity,
};
