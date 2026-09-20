// aggregation-core.js — 组合压缩核的纯 JS 镜像（与 rust-core/src/aggregate.rs 同公式）
// ----------------------------------------------------------------------------
// 存在意义：native core（thinking-ultra-core.exe）可用时走 Rust；不可用时由本文件做
// 位级等价的纯 JS 回退，保证“任意滑杆排列 → 唯一参数向量、只强不弱”这条数学保证
// 在任何环境都成立。**两边公式必须逐行对齐，改一边必须同步另一边。**
//
// 三步归约：
//   1) 每杆 tier(0..6) 经非线性曲线映射到 s∈[0,1]（与 engine-spec.data.mjs 同族）；
//   2) 组内噪声或 g = 1 - Π(1 - s_i·w_i)（单调/有界/饱和三性质）；
//   3) 六域强度归约成唯一 ParamVector，再做带稳定性保底的预算仲裁。
// 下游引擎只认 ParamVector，不认原始滑杆，从结构上消灭组合冲突。

// —— 非线性增益族：tier 0..6 → 0..1，与 curves.rs / engine-spec.data.mjs 对齐 ——
export function curveGain(curve, tier) {
  const t = Math.max(0, Math.min(6, Math.round(Number(tier) || 0)));
  const x = t / 6;
  switch (curve) {
    case 'exp':   return Math.pow(x, 1.7);                     // 指数：低档克制、高档爆发
    case 'fact':  return (Math.pow(2, x * 6) - 1) / 63;        // 阶乘式：越近满档越陡
    case 'inv':   return 1 - Math.pow(1 - x, 1.4);             // 反向收敛
    case 'tight': return x;                                    // 安全线性收紧
    case 'lin':
    default:      return x;
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// —— 1. 六域组成员（key / curve / weight），逐行对应 aggregate.rs 的 const 域 ——
export const DOMAINS = [
  {
    name: 'cognition',
    members: [
      { key: 'deep', curve: 'exp', weight: 1.0 },
      { key: 'branch', curve: 'fact', weight: 0.92 },
      { key: 'memory', curve: 'inv', weight: 0.7 },
      { key: 'entropy', curve: 'exp', weight: 0.62 },
      { key: 'tempo', curve: 'exp', weight: 0.8 },
      { key: 'breadth', curve: 'fact', weight: 0.85 },
      { key: 'sharpen', curve: 'exp', weight: 0.7 },
    ],
  },
  {
    name: 'engineering',
    members: [
      { key: 'code', curve: 'exp', weight: 1.0 },
      { key: 'exec', curve: 'lin', weight: 0.8 },
      { key: 'deps', curve: 'lin', weight: 0.66 },
      { key: 'plan', curve: 'exp', weight: 0.82 },
      { key: 'format', curve: 'tight', weight: 0.6 },
      { key: 'topology', curve: 'fact', weight: 0.9 },
      { key: 'proof', curve: 'exp', weight: 0.92 },
      { key: 'crossmodel', curve: 'fact', weight: 0.82 },
    ],
  },
  {
    name: 'metacog',
    members: [
      { key: 'meta', curve: 'exp', weight: 0.95 },
      { key: 'falsify', curve: 'fact', weight: 0.95 },
      { key: 'abst', curve: 'exp', weight: 0.78 },
      { key: 'synth', curve: 'fact', weight: 0.72 },
      { key: 'cohere', curve: 'exp', weight: 0.8 },
      { key: 'calib', curve: 'lin', weight: 0.7 },
      { key: 'replay', curve: 'exp', weight: 0.66 },
      { key: 'verify', curve: 'fact', weight: 0.9 },
      { key: 'critique', curve: 'fact', weight: 0.78 },
      { key: 'retrieval', curve: 'lin', weight: 0.7 },
      { key: 'axiom', curve: 'exp', weight: 0.9 },
      { key: 'fractal', curve: 'fact', weight: 0.85 },
      { key: 'recursion', curve: 'exp', weight: 0.9 },
      { key: 'fusion', curve: 'fact', weight: 0.88 },
      { key: 'modality', curve: 'lin', weight: 0.6 },
      { key: 'reflect', curve: 'exp', weight: 0.88 },
    ],
  },
  {
    name: 'vision',
    members: [
      { key: 'vision', curve: 'exp', weight: 1.0 },
      { key: 'vscan', curve: 'fact', weight: 0.85 },
      { key: 'vgraph', curve: 'exp', weight: 0.8 },
      { key: 'vzoom', curve: 'exp', weight: 0.9 },
      { key: 'vtrack', curve: 'fact', weight: 0.82 },
      { key: 'vspatial', curve: 'exp', weight: 0.85 },
      { key: 'vocr', curve: 'fact', weight: 0.88 },
      { key: 'vcounterfactual', curve: 'exp', weight: 0.8 },
    ],
  },
  {
    name: 'stability',
    members: [
      { key: 'agent', curve: 'fact', weight: 0.85 },
      { key: 'longcode', curve: 'inv', weight: 0.82 },
      { key: 'consist', curve: 'tight', weight: 0.88 },
      { key: 'heal', curve: 'lin', weight: 0.84 },
      { key: 'reclaim', curve: 'lin', weight: 0.6 },
      { key: 'watchdog', curve: 'tight', weight: 0.9 },
      { key: 'persist', curve: 'tight', weight: 0.95 },
      { key: 'checkpoint', curve: 'lin', weight: 0.85 },
      { key: 'converge', curve: 'tight', weight: 0.9 },
      { key: 'vmem', curve: 'tight', weight: 0.88 },
      { key: 'vpersist', curve: 'lin', weight: 0.82 },
      { key: 'compress', curve: 'inv', weight: 0.78 },
    ],
  },
  {
    name: 'guard',
    members: [{ key: 'safety', curve: 'tight', weight: 1.0 }],
  },
];

export const DOMAIN_NAMES = DOMAINS.map((d) => d.name);

function tierOf(sliders, key) {
  if (!sliders || !(key in sliders)) return 0;
  return clamp(Math.round(Number(sliders[key]) || 0), 0, 6);
}

// 单杆非线性强度（含权重）
export function sliderStrength(member, tier) {
  return clamp01(curveGain(member.curve, tier) * member.weight);
}

// —— 2. 噪声或：log 空间连乘，数值稳定 ——
export function noisyOr(domain, sliders) {
  let logSurvival = 0;
  let active = 0;
  for (const m of domain.members) {
    const tier = tierOf(sliders, m.key);
    if (tier === 0) continue;
    active += 1;
    const s = sliderStrength(m, tier);
    logSurvival += Math.log(Math.max(1 - s, 1e-12));
  }
  const g = active === 0 ? 0 : 1 - Math.exp(logSurvival);
  return { g: clamp01(g), active };
}

export function domainStrengths(sliders) {
  const gs = new Array(6).fill(0);
  const acts = new Array(6).fill(0);
  DOMAINS.forEach((d, i) => {
    const r = noisyOr(d, sliders);
    gs[i] = r.g;
    acts[i] = r.active;
  });
  return { gs, acts };
}

// —— 3. 标量映射（与 Rust scale_int / scale_float / scale_int_inv 对齐，用 round）——
function scaleInt(g, lo, hi) {
  if (hi <= lo) return lo;
  const v = lo + g * (hi - lo);
  return Math.round(clamp(v, lo, hi));
}
function scaleFloat(g, lo, hi) {
  return clamp(lo + g * (hi - lo), Math.min(lo, hi), Math.max(lo, hi));
}
function scaleIntInv(g, hi, lo) {
  return scaleInt(1 - g, lo, hi);
}

function normalizeModel(model) {
  const m = String(model || 'pro').toLowerCase();
  if (m.includes('vision')) return 'flash';
  if (m.includes('flash')) return 'flash';
  return 'pro';
}

// —— 4. 唯一参数向量 ——
export function paramVectorFromStrengths(gs, model) {
  const gc = gs[0], ge = gs[1], gm = gs[2], gv = gs[3], gst = gs[4], gg = gs[5];
  const isPro = model === 'pro';
  const isVision = model === 'flash';
  const metaCap = isPro ? 1.0 : 0.55;   // Flash 元认知半档
  const visionCap = isPro || isVision ? 1.0 : 0.0; // Flash 原生多模态全视觉
  const gmEff = gm * metaCap;
  const gvEff = gv * visionCap;

  const branches = scaleInt(gc, 0, 11);
  const reflectionRounds = scaleInt(gc * 0.7 + gmEff * 0.3, 0, 12);
  const proofClosureDepth = scaleInt(gmEff * 0.6 + ge * 0.4, 0, 9);
  const candidatePool = scaleInt(gc * 0.6 + gmEff * 0.4, 0, 16);
  const judgePanels = scaleInt(gmEff, 0, 5);
  const tournamentRounds = scaleInt(gmEff, 0, 4);
  const blackboardSlots = isPro ? scaleInt(gmEff, 0, 12) : scaleInt(gmEff, 0, 6);
  const memorySlots = scaleInt(gc * 0.5 + gst * 0.5, 0, 24);
  const visionGrid = scaleInt(gvEff, 0, 21);
  const toolDepth = scaleInt(ge * 0.4 + gc * 0.3 + gmEff * 0.3, 0, 9);
  const activeTools = scaleInt(
    gc * 0.35 + ge * 0.25 + gmEff * 0.25 + gst * 0.15,
    0,
    isPro ? 78 : isVision ? 61 : 45,
  );
  const checks = scaleInt(ge * 0.4 + gmEff * 0.4 + gst * 0.2, 0, 13);
  const healLayers = scaleInt(gst, 0, 6);
  const abstractionLevels = isPro ? scaleInt(gmEff, 0, 5) : 0;
  const crossDomains = isPro ? scaleInt(gmEff, 0, 6) : 0;
  const entropyPasses = scaleInt(gc * 0.6 + gmEff * 0.4, 0, 8);
  const confidencePoints = isPro ? scaleInt(gmEff, 0, 12) : scaleInt(gmEff, 0, 6);

  const rawBudget = gc * 12 + ge * 9 + gmEff * 11 + gvEff * 8 + gst * 7 + gg * 1;
  const budgetUnits = Math.max(0, rawBudget);

  const temperaturePct = scaleFloat(1 - (gc * 0.6 + gmEff * 0.4), 20, 84);
  const anchorPeriod = scaleIntInv(gc * 0.5 + gst * 0.5, 8, 1);
  const antiLoopMax = scaleIntInv(gst, 3, 1);
  const reclaimRatio = scaleFloat(gst, 0, 0.42);
  const guardDrift = scaleFloat(1 - gg, 0.26, 0.55);

  const stabilityFloor = gst > 0 ? 0.25 + 0.75 * gst : 0;

  return {
    g_cognition: gc, g_engineering: ge, g_metacog: gm, g_vision: gv,
    g_stability: gst, g_guard: gg,
    branches, reflection_rounds: reflectionRounds, proof_closure_depth: proofClosureDepth,
    candidate_pool: candidatePool, judge_panels: judgePanels, tournament_rounds: tournamentRounds,
    blackboard_slots: blackboardSlots, memory_slots: memorySlots, vision_grid: visionGrid,
    tool_depth: toolDepth, active_tools: activeTools, checks, heal_layers: healLayers,
    abstraction_levels: abstractionLevels, cross_domains: crossDomains,
    entropy_passes: entropyPasses, confidence_points: confidencePoints, budget_units: budgetUnits,
    temperature_pct: temperaturePct, anchor_period: anchorPeriod, anti_loop_max: antiLoopMax,
    reclaim_ratio: reclaimRatio, guard_drift: guardDrift, stability_floor: stabilityFloor,
    bayes_fusion: gmEff >= 0.3,
    counterfactual: gmEff >= 0.2,
    formal_verify: isPro && gmEff >= 0.45 && ge >= 0.3,
    multi_agent: gst >= 0.25,
  };
}

// 正向标量字段（单调性证明用），顺序与 Rust positive_fields 对齐
export const POSITIVE_FIELDS = [
  'branches', 'reflection_rounds', 'proof_closure_depth', 'candidate_pool', 'judge_panels',
  'tournament_rounds', 'blackboard_slots', 'memory_slots', 'tool_depth', 'active_tools',
  'checks', 'heal_layers', 'entropy_passes', 'budget_units', 'stability_floor',
];

// —— 5. 预算仲裁：稳定性先扣不可压缩保底（≤30%），其余按强度加权，超限优雅压缩 ——
export function arbitrateBudget(gs, totalTokens, pv) {
  const floor = totalTokens * Math.min(pv.stability_floor * 0.3, 0.3);
  const remain = Math.max(0, totalTokens - floor);
  const weights = [gs[0], gs[1], gs[2], gs[3], 0, gs[5]];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const shares = new Array(6).fill(0);
  if (wsum > 1e-9) {
    for (let i = 0; i < 6; i += 1) shares[i] = (remain * weights[i]) / wsum;
  }
  shares[4] += floor;

  const compressed = [];
  const supplyNonStab = shares[0] + shares[1] + shares[2] + shares[3] + shares[5];
  if (pv.budget_units > 0 && supplyNonStab < pv.budget_units * 120 && pv.budget_units > 20) {
    compressed.push('toolbox-count');
  }
  if (pv.branches >= 8 && shares[0] < pv.branches * 220) compressed.push('branch-fanout');
  if (pv.reflection_rounds >= 9 && shares[0] + shares[2] < pv.reflection_rounds * 260) {
    compressed.push('reflection-rounds');
  }

  return {
    cognition: shares[0], engineering: shares[1], metacog: shares[2], vision: shares[3],
    stability: shares[4], guard: shares[5],
    total: shares.reduce((a, b) => a + b, 0), compressed,
  };
}

// —— 6. 顶层入口：sliders + model → 归约结果（native 缺失时的 JS 回退也走这里）——
export function aggregate(sliders, model = 'pro', budgetTokens = 48000) {
  const m = normalizeModel(model);
  const budget = Math.max(0, Number(budgetTokens) || 0);
  const { gs, acts } = domainStrengths(sliders);
  const pv = paramVectorFromStrengths(gs, m);
  const award = arbitrateBudget(gs, budget, pv);
  return {
    ok: true,
    model: m,
    domainStrengths: {
      cognition: gs[0], engineering: gs[1], metacog: gs[2], vision: gs[3],
      stability: gs[4], guard: gs[5], activeCounts: acts,
    },
    paramVector: pv,
    budget: award,
  };
}

// —— 7. 单调性机器证明（JS 版，供 src_clean 单测；违规返回空数组表示通过）——
export function monotonicProof(model) {
  const m = normalizeModel(model);
  const violations = [];
  for (const domain of DOMAINS) {
    for (const member of domain.members) {
      for (let baseline = 0; baseline <= 1; baseline += 1) {
        for (let t = 0; t < 6; t += 1) {
          const lo = {};
          const hi = {};
          if (baseline === 1) {
            for (const other of domain.members) {
              if (other.key !== member.key) {
                lo[other.key] = 3;
                hi[other.key] = 3;
              }
            }
            lo.deep = 2;
            hi.deep = 2;
          }
          lo[member.key] = t;
          hi[member.key] = t + 1;
          const loPv = paramVectorFromStrengths(domainStrengths(lo).gs, m);
          const hiPv = paramVectorFromStrengths(domainStrengths(hi).gs, m);
          for (const f of POSITIVE_FIELDS) {
            if (hiPv[f] + 1e-9 < loPv[f]) {
              violations.push(`model=${m} key=${member.key} ${t}->${t + 1} field=${f} ${loPv[f]} > ${hiPv[f]}`);
            }
          }
          if (hiPv.temperature_pct > loPv.temperature_pct + 1e-9) {
            violations.push(`model=${m} key=${member.key} ${t}->${t + 1} temperature rose`);
          }
        }
      }
    }
  }
  return violations;
}

export function aggregationSelfCheck() {
  const models = ['flash', 'pro'];
  const modelResults = models.map((m) => ({ model: m, pass: monotonicProof(m).length === 0 }));
  const { gs: gz } = domainStrengths({});
  const boundaryAllZero = gz.every((x) => Math.abs(x) < 1e-9);
  const full = {};
  for (const d of DOMAINS) for (const mem of d.members) full[mem.key] = 6;
  const { gs: gf } = domainStrengths(full);
  const boundaryBounded = gf.every((x) => x <= 1 + 1e-9 && x >= 0);
  const pvFull = paramVectorFromStrengths(gf, 'pro');
  const award = arbitrateBudget(gf, 48000, pvFull);
  const budgetConserved = Math.abs(award.total - 48000) < 1e-6;
  const pass = modelResults.every((r) => r.pass) && boundaryAllZero && boundaryBounded && budgetConserved;
  return {
    ok: pass, models: modelResults, boundaryAllZero, boundaryBounded,
    budgetConserved, modelChecks: models.length,
  };
}
