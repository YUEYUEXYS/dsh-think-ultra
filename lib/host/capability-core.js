// capability-core.js — Thinker Ultra 能力滑块核心逻辑（地狱级扩展版）
// 预算幂律曲线、档位状态机、模型 profile 矩阵、复杂度评估、动态下探
// 纯逻辑，零 UI 依赖，可独立测试
// 版本：2.0.0（地狱级扩展版）
// 目标：20000+行代码，实现真正的地狱级别难度

// ============================================================
// §0 常量与配置
// ============================================================

export const CAPABILITY_CORE_VERSION = '2.0.0-hell';
export const CAPABILITY_CORE_BUILD = '20260915-ultra-extreme';

// 预算曲线参数
export const CURVE_K = 2.4; // 幂律指数，命名常量，可被 profile 覆盖
export const B_MIN = 0.02;  // 最低预算比例（极速档贴地）
export const B_MAX = 1.0;   // 最高预算比例（极限档满算力）
export const B_MID = 0.5;   // 中间预算比例

// 档位配置
export const TIER_COUNT = 20; // 20个等级
export const TIER_MIN = 0;
export const TIER_MAX = 20;
export const TIER_DEFAULT = 5; // 默认值

// 复杂度评估参数
export const COMPLEXITY_MIN = 0;
export const COMPLEXITY_MAX = 1;
export const COMPLEXITY_DEFAULT = 0.5;

// 动态下探参数
export const DOWNSHIFT_MIN_RATIO = 0.3; // 最多收缩到设定值的30%
export const DOWNSHIFT_THRESHOLD = 0.8; // 复杂度低于设定值80%时触发下探
export const DOWNSHIFT_RECOVERY_THRESHOLD = 1.2; // 复杂度超过设定值120%时触发回退

// 推理增强参数
export const MAX_SELF_CHECKS = 10; // 最大自检轮次
export const MAX_PATHS = 8; // 最大候选路径数
export const MAX_REFUTATIONS = 5; // 最大反驳轮次
export const MAX_CROSS_VERIFICATIONS = 5; // 最大交叉验证轮次
export const MAX_COUNTERFACTUALS = 5; // 最大反事实推演数

// 性能参数
export const PERF_SAMPLE_SIZE = 100; // 性能采样大小
export const PERF_WINDOW_SIZE = 50; // 性能窗口大小

// ============================================================
// §1 预算曲线 BudgetCurve（12种曲线）
// ============================================================

/**
 * 1.1 幂律曲线：B(x) = B_min + (B_max - B_min) * (x/100)^k
 * 0-20 区间几乎贴地，80-100 区间陡峭拉升
 */
export function powerLawBudget(x, k = CURVE_K) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  const ratio = clamped / 100;
  return B_MIN + (B_MAX - B_MIN) * Math.pow(ratio, k);
}

/**
 * 1.2 指数曲线变体
 */
export function exponentialBudget(x, base = 1.06) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  return B_MIN + (B_MAX - B_MIN) * (Math.pow(base, clamped) - 1) / (Math.pow(base, 100) - 1);
}

/**
 * 1.3 分段样条曲线变体：极速段极平、极限段极陡
 */
export function piecewiseBudget(x) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  if (clamped <= 20) return B_MIN + (0.05 - B_MIN) * (clamped / 20);
  if (clamped <= 50) return 0.05 + (0.25 - 0.05) * ((clamped - 20) / 30);
  if (clamped <= 80) return 0.25 + (0.6 - 0.25) * ((clamped - 50) / 30);
  return 0.6 + (B_MAX - 0.6) * ((clamped - 80) / 20);
}

/**
 * 1.4 对数曲线：前期增长快，后期增长慢
 */
export function logarithmicBudget(x, base = Math.E) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  if (clamped === 0) return B_MIN;
  return B_MIN + (B_MAX - B_MIN) * (Math.log(clamped + 1) / Math.log(101));
}

/**
 * 1.5 S曲线（逻辑斯蒂曲线）：前期慢，中期快，后期慢
 */
export function sigmoidBudget(x, steepness = 0.1, midpoint = 50) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  const sigmoid = 1 / (1 + Math.exp(-steepness * (clamped - midpoint)));
  return B_MIN + (B_MAX - B_MIN) * sigmoid;
}

/**
 * 1.6 贝塞尔曲线：可自定义控制点
 */
export function bezierBudget(x, p1 = 0.3, p2 = 0.7) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  const t = clamped / 100;
  // 三次贝塞尔曲线
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  const result = uuu * 0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * 1;
  return B_MIN + (B_MAX - B_MIN) * result;
}

/**
 * 1.7 双曲正切曲线：S形，更平滑
 */
export function tanhBudget(x, steepness = 0.05, midpoint = 50) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  const tanh = (Math.exp(steepness * (clamped - midpoint)) - Math.exp(-steepness * (clamped - midpoint))) /
               (Math.exp(steepness * (clamped - midpoint)) + Math.exp(-steepness * (clamped - midpoint)));
  return B_MIN + (B_MAX - B_MIN) * (tanh + 1) / 2;
}

/**
 * 1.8 阶梯曲线：离散的档位
 */
export function stepBudget(x, steps = 20) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  const stepSize = 100 / steps;
  const step = Math.floor(clamped / stepSize);
  return B_MIN + (B_MAX - B_MIN) * (step / steps);
}

/**
 * 1.9 线性曲线：最简单的线性映射
 */
export function linearBudget(x) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  return B_MIN + (B_MAX - B_MIN) * (clamped / 100);
}

/**
 * 1.10 平方根曲线：前期增长快，后期增长慢
 */
export function sqrtBudget(x) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  return B_MIN + (B_MAX - B_MIN) * Math.sqrt(clamped / 100);
}

/**
 * 1.11 立方根曲线：前期增长更快，后期增长更慢
 */
export function cbrtBudget(x) {
  const clamped = Math.max(0, Math.min(100, Number(x) || 0));
  return B_MIN + (B_MAX - B_MIN) * Math.cbrt(clamped / 100);
}

/**
 * 1.12 自定义曲线：通过函数工厂创建
 */
export function createCustomBudget(curveFn) {
  return function(x) {
    const clamped = Math.max(0, Math.min(100, Number(x) || 0));
    const result = curveFn(clamped);
    return Math.max(B_MIN, Math.min(B_MAX, Number(result) || B_MIN));
  };
}

// 曲线注册表
export const BUDGET_CURVES = {
  powerLaw: { name: '幂律曲线', fn: powerLawBudget, description: '0-20区间几乎贴地，80-100区间陡峭拉升' },
  exponential: { name: '指数曲线', fn: exponentialBudget, description: '指数增长，后期极陡' },
  piecewise: { name: '分段样条曲线', fn: piecewiseBudget, description: '极速段极平、极限段极陡' },
  logarithmic: { name: '对数曲线', fn: logarithmicBudget, description: '前期增长快，后期增长慢' },
  sigmoid: { name: 'S曲线', fn: sigmoidBudget, description: '前期慢，中期快，后期慢' },
  bezier: { name: '贝塞尔曲线', fn: bezierBudget, description: '可自定义控制点的平滑曲线' },
  tanh: { name: '双曲正切曲线', fn: tanhBudget, description: 'S形，更平滑' },
  step: { name: '阶梯曲线', fn: stepBudget, description: '离散的档位' },
  linear: { name: '线性曲线', fn: linearBudget, description: '最简单的线性映射' },
  sqrt: { name: '平方根曲线', fn: sqrtBudget, description: '前期增长快，后期增长慢' },
  cbrt: { name: '立方根曲线', fn: cbrtBudget, description: '前期增长更快，后期增长更慢' },
};

/**
 * 获取指定名称的预算曲线函数
 */
export function getBudgetCurve(name = 'powerLaw') {
  const curve = BUDGET_CURVES[name];
  return curve ? curve.fn : powerLawBudget;
}

/**
 * 列出所有可用的预算曲线
 */
export function listBudgetCurves() {
  return Object.entries(BUDGET_CURVES).map(([key, value]) => ({
    key,
    name: value.name,
    description: value.description,
  }));
}

// ============================================================
// §2 档位模型与区间映射（20个等级）
// ============================================================

// 20个等级的详细配置
export const TIERS_20 = [
  { id: 1, name: '休眠', en: 'Dormant', range: [0, 1], snap: 0.5,
    selfChecks: 0, paths: 1, tokenMult: [0.05, 0.1],
    thinkingDepth: 0.05, creativity: 0.1, rigor: 0.05,
    desc: '几乎不思考，直接给出答案，适合极简单任务' },
  { id: 2, name: '微醒', en: 'Micro-Awake', range: [1, 2], snap: 1.5,
    selfChecks: 0, paths: 1, tokenMult: [0.1, 0.15],
    thinkingDepth: 0.1, creativity: 0.15, rigor: 0.1,
    desc: '极浅思考，几乎不做自检' },
  { id: 3, name: '初醒', en: 'Initial-Awake', range: [2, 3], snap: 2.5,
    selfChecks: 0, paths: 1, tokenMult: [0.15, 0.2],
    thinkingDepth: 0.15, creativity: 0.2, rigor: 0.15,
    desc: '浅层思考，开始有基本推理' },
  { id: 4, name: '浅思', en: 'Shallow-Think', range: [3, 4], snap: 3.5,
    selfChecks: 1, paths: 1, tokenMult: [0.2, 0.25],
    thinkingDepth: 0.2, creativity: 0.25, rigor: 0.2,
    desc: '浅层思考 + 1轮自检' },
  { id: 5, name: '轻思', en: 'Light-Think', range: [4, 5], snap: 4.5,
    selfChecks: 1, paths: 1, tokenMult: [0.25, 0.3],
    thinkingDepth: 0.25, creativity: 0.3, rigor: 0.25,
    desc: '轻度思考，适合日常简单任务' },
  { id: 6, name: '常思', en: 'Normal-Think', range: [5, 6], snap: 5.5,
    selfChecks: 1, paths: 1, tokenMult: [0.3, 0.4],
    thinkingDepth: 0.3, creativity: 0.35, rigor: 0.3,
    desc: '常规思考，标准推理深度' },
  { id: 7, name: '稳思', en: 'Stable-Think', range: [6, 7], snap: 6.5,
    selfChecks: 2, paths: 1, tokenMult: [0.4, 0.5],
    thinkingDepth: 0.35, creativity: 0.4, rigor: 0.35,
    desc: '稳定思考 + 2轮自检' },
  { id: 8, name: '深思', en: 'Deep-Think', range: [7, 8], snap: 7.5,
    selfChecks: 2, paths: 2, tokenMult: [0.5, 0.6],
    thinkingDepth: 0.4, creativity: 0.45, rigor: 0.4,
    desc: '深度思考 + 2轮自检 + 双路径对比' },
  { id: 9, name: '精思', en: 'Precise-Think', range: [8, 9], snap: 8.5,
    selfChecks: 3, paths: 2, tokenMult: [0.6, 0.7],
    thinkingDepth: 0.45, creativity: 0.5, rigor: 0.45,
    desc: '精确思考 + 3轮自检 + 双路径对比' },
  { id: 10, name: '极思', en: 'Extreme-Think', range: [9, 10], snap: 9.5,
    selfChecks: 3, paths: 2, tokenMult: [0.7, 0.8],
    thinkingDepth: 0.5, creativity: 0.55, rigor: 0.5,
    desc: '极致思考，中等难度任务的最佳选择' },
  { id: 11, name: '超思', en: 'Ultra-Think', range: [10, 11], snap: 10.5,
    selfChecks: 4, paths: 3, tokenMult: [0.8, 1.0],
    thinkingDepth: 0.55, creativity: 0.6, rigor: 0.55,
    desc: '超级思考 + 4轮自检 + 三路径对比' },
  { id: 12, name: '玄思', en: 'Mystic-Think', range: [11, 12], snap: 11.5,
    selfChecks: 4, paths: 3, tokenMult: [1.0, 1.2],
    thinkingDepth: 0.6, creativity: 0.65, rigor: 0.6,
    desc: '玄妙思考，开始启用高级推理机制' },
  { id: 13, name: '冥思', en: 'Meditation-Think', range: [12, 13], snap: 12.5,
    selfChecks: 5, paths: 3, tokenMult: [1.2, 1.5],
    thinkingDepth: 0.65, creativity: 0.7, rigor: 0.65,
    desc: '冥想思考 + 5轮自检 + 三路径对比 + 自我反驳' },
  { id: 14, name: '神思', en: 'Divine-Think', range: [13, 14], snap: 13.5,
    selfChecks: 5, paths: 4, tokenMult: [1.5, 1.8],
    thinkingDepth: 0.7, creativity: 0.75, rigor: 0.7,
    desc: '神级思考 + 5轮自检 + 四路径对比 + 交叉验证' },
  { id: 15, name: '圣思', en: 'Sacred-Think', range: [14, 15], snap: 14.5,
    selfChecks: 6, paths: 4, tokenMult: [1.8, 2.2],
    thinkingDepth: 0.75, creativity: 0.8, rigor: 0.75,
    desc: '圣级思考 + 6轮自检 + 四路径对比 + 反事实推演' },
  { id: 16, name: '仙思', en: 'Immortal-Think', range: [15, 16], snap: 15.5,
    selfChecks: 6, paths: 5, tokenMult: [2.2, 2.8],
    thinkingDepth: 0.8, creativity: 0.85, rigor: 0.8,
    desc: '仙级思考 + 6轮自检 + 五路径对比 + 元认知校验' },
  { id: 17, name: '佛思', en: 'Buddha-Think', range: [16, 17], snap: 16.5,
    selfChecks: 7, paths: 5, tokenMult: [2.8, 3.5],
    thinkingDepth: 0.85, creativity: 0.9, rigor: 0.85,
    desc: '佛级思考 + 7轮自检 + 五路径对比 + 对抗性测试' },
  { id: 18, name: '魔思', en: 'Demon-Think', range: [17, 18], snap: 17.5,
    selfChecks: 8, paths: 6, reflectionPasses: 1, tokenMult: [3.2, 3.8],
    thinkingDepth: 0.9, creativity: 0.95, rigor: 0.9,
    desc: '魔级思考 + 8轮自检 + 六路径对比 + 1轮递归反思复审（主预演后追加1次独立MAX批判重铸）' },
  { id: 19, name: '鬼思', en: 'Ghost-Think', range: [18, 19], snap: 18.5,
    selfChecks: 9, paths: 7, reflectionPasses: 2, tokenMult: [3.6, 4.2],
    thinkingDepth: 0.95, creativity: 1.0, rigor: 0.95,
    desc: '鬼级思考 + 9轮自检 + 七路径对比 + 2轮递归反思（逻辑硬伤审查→约束边界审查，共3次独立MAX调用）' },
  { id: 20, name: '神灭', en: 'God-Destroyer', range: [19, 20], snap: 19.5,
    selfChecks: 10, paths: 8, reflectionPasses: 3, tokenMult: [4.0, 4.6],
    thinkingDepth: 1.0, creativity: 1.0, rigor: 1.0,
    desc: '神灭级·能力天花板：10轮自检 + 八路径 + HAG全链路超频 + 3轮递归反思（逻辑/约束/反事实审查后再做终极融合裁判，共4次独立MAX调用）；极境再叠1轮。极端断层来自真实多轮批判重铸与无限投票，而非token倍率' },
];

// 兼容旧版的4档位
export const TIERS_4 = [
  { id: 'extreme', name: '极速', en: 'Extreme', range: [0, 5], snap: 2.5,
    selfChecks: 0, paths: 1, tokenMult: [0.2, 0.3],
    desc: '关闭自省、关闭回溯、关闭多路径；适合批量队列、扫描、夜间挂机' },
  { id: 'balanced', name: '均衡', en: 'Balanced', range: [5, 10], snap: 7.5,
    selfChecks: 1, paths: 1, tokenMult: [1.0, 1.0],
    desc: '单路径推理 + 一轮结果自检与补漏' },
  { id: 'deep', name: '深度', en: 'Deep', range: [10, 15], snap: 12.5,
    selfChecks: 2, paths: 2, tokenMult: [2.5, 3.5],
    desc: '双路径对比 + 两轮回溯校验，自动排查逻辑漏洞并给备选方案' },
  { id: 'limit', name: '极限', en: 'Limit', range: [15, 20], snap: 17.5,
    selfChecks: 3, paths: 3, reflectionPasses: 2, tokenMult: [3.6, 4.6],
    desc: '多路径并行推演、自我反驳、交叉验证、风险反查' },
];

// 默认使用20档位
export const TIERS = TIERS_20;
export const DEFAULT_VALUE = 5; // 出厂默认 = 第5档（轻思）

/**
 * 根据滑块值获取档位（20档位）
 */
export function tierOf(x) {
  const v = Number(x) || 0;
  for (const t of TIERS_20) {
    if (v >= t.range[0] && v <= t.range[1]) return t;
  }
  return TIERS_20[TIERS_20.length - 1];
}

/**
 * 根据滑块值获取4档位（兼容旧版）
 */
export function tierOf4(x) {
  const v = Number(x) || 0;
  for (const t of TIERS_4) {
    if (v >= t.range[0] && v <= t.range[1]) return t;
  }
  return TIERS_4[TIERS_4.length - 1];
}

/**
 * 获取最近的吸附点
 */
export function nearestSnap(x) {
  const v = Number(x) || 0;
  let best = TIERS_20[0].snap;
  let bestDist = Math.abs(v - best);
  for (const t of TIERS_20) {
    const d = Math.abs(v - t.snap);
    if (d < bestDist) { bestDist = d; best = t.snap; }
  }
  return best;
}

/**
 * 阶梯量化：从预算曲线派生自检轮次（整数，单调递增）
 */
export function quantizeSelfChecks(budget) {
  if (budget < 0.05) return 0;
  if (budget < 0.1) return 1;
  if (budget < 0.2) return 2;
  if (budget < 0.3) return 3;
  if (budget < 0.4) return 4;
  if (budget < 0.5) return 5;
  if (budget < 0.6) return 6;
  if (budget < 0.7) return 7;
  if (budget < 0.8) return 8;
  if (budget < 0.9) return 9;
  return 10;
}

/**
 * 阶梯量化：从预算曲线派生候选路径数（整数，单调递增）
 */
export function quantizePaths(budget) {
  if (budget < 0.1) return 1;
  if (budget < 0.2) return 1;
  if (budget < 0.35) return 2;
  if (budget < 0.5) return 2;
  if (budget < 0.65) return 3;
  if (budget < 0.75) return 4;
  if (budget < 0.85) return 5;
  if (budget < 0.92) return 6;
  if (budget < 0.97) return 7;
  return 8;
}

/**
 * 阶梯量化：从预算曲线派生反驳轮次
 */
export function quantizeRefutations(budget) {
  if (budget < 0.5) return 0;
  if (budget < 0.65) return 1;
  if (budget < 0.75) return 2;
  if (budget < 0.85) return 3;
  if (budget < 0.92) return 4;
  return 5;
}

/**
 * 阶梯量化：从预算曲线派生交叉验证轮次
 */
export function quantizeCrossVerifications(budget) {
  if (budget < 0.55) return 0;
  if (budget < 0.7) return 1;
  if (budget < 0.8) return 2;
  if (budget < 0.88) return 3;
  if (budget < 0.95) return 4;
  return 5;
}

/**
 * 阶梯量化：从预算曲线派生反事实推演数
 */
export function quantizeCounterfactuals(budget) {
  if (budget < 0.6) return 0;
  if (budget < 0.72) return 1;
  if (budget < 0.82) return 2;
  if (budget < 0.9) return 3;
  if (budget < 0.96) return 4;
  return 5;
}

/**
 * 列出所有20个档位
 */
export function listTiers() {
  return TIERS_20.map(t => ({
    id: t.id,
    name: t.name,
    en: t.en,
    range: t.range,
    snap: t.snap,
    selfChecks: t.selfChecks,
    paths: t.paths,
    tokenMult: t.tokenMult,
    desc: t.desc,
  }));
}

/**
 * 获取档位详细信息
 */
export function getTierInfo(tierId) {
  return TIERS_20.find(t => t.id === tierId) || null;
}

// ============================================================
// §3 模型感知 Profile 矩阵（扩展版）
// ============================================================

export const PROFILES = {
  // Flash 模型
  'flash-fast': {
    model: 'flash', mode: 'fast',
    budgetMult: 0.6, maxPaths: 4,
    strategy: '用预算换快速两遍校验，补偿快模型浅推理',
    curveK: 2.2,
    curveType: 'powerLaw',
    thinkingBonus: 0.1,
    creativityBonus: 0.15,
    rigorBonus: 0.05,
    selfCheckBonus: 0,
    pathBonus: 0,
    enabledFeatures: ['basic-reasoning', 'self-check'],
    disabledFeatures: ['counterfactual', 'meta-cognition'],
  },
  'flash-standard': {
    model: 'flash', mode: 'standard',
    budgetMult: 0.8, maxPaths: 5,
    strategy: '强化结构化分解，弥补小模型规划短板',
    curveK: 2.4,
    curveType: 'powerLaw',
    thinkingBonus: 0.15,
    creativityBonus: 0.2,
    rigorBonus: 0.1,
    selfCheckBonus: 1,
    pathBonus: 0,
    enabledFeatures: ['basic-reasoning', 'self-check', 'multi-path'],
    disabledFeatures: ['counterfactual'],
  },
  'flash-oc': {
    model: 'flash', mode: 'oc',
    budgetMult: 1.5, maxPaths: 6,
    strategy: 'Flash极境模式：释放全部潜力，用极致思考换取极致结果',
    curveK: 2.6,
    curveType: 'sigmoid',
    thinkingBonus: 0.3,
    creativityBonus: 0.35,
    rigorBonus: 0.25,
    selfCheckBonus: 2,
    pathBonus: 1,
    enabledFeatures: ['basic-reasoning', 'self-check', 'multi-path', 'self-refute', 'cross-verify'],
    disabledFeatures: [],
  },
  // Pro 模型
  'pro-fast': {
    model: 'pro', mode: 'fast',
    budgetMult: 1.0, maxPaths: 5,
    strategy: '迅流下优先保自检轮次，路径数次之',
    curveK: 2.4,
    curveType: 'powerLaw',
    thinkingBonus: 0.2,
    creativityBonus: 0.2,
    rigorBonus: 0.15,
    selfCheckBonus: 1,
    pathBonus: 0,
    enabledFeatures: ['basic-reasoning', 'self-check', 'multi-path'],
    disabledFeatures: [],
  },
  'pro-standard': {
    model: 'pro', mode: 'standard',
    budgetMult: 1.2, maxPaths: 6,
    strategy: '基准完整能力',
    curveK: 2.5,
    curveType: 'powerLaw',
    thinkingBonus: 0.25,
    creativityBonus: 0.25,
    rigorBonus: 0.2,
    selfCheckBonus: 2,
    pathBonus: 1,
    enabledFeatures: ['basic-reasoning', 'self-check', 'multi-path', 'self-refute'],
    disabledFeatures: [],
  },
  'pro-oc': {
    model: 'pro', mode: 'oc',
    budgetMult: 2.0, maxPaths: 8,
    strategy: '极限增强：极限档追加反事实攻击、结论可证伪性检查两轮元认知',
    curveK: 2.8,
    curveType: 'bezier',
    thinkingBonus: 0.5,
    creativityBonus: 0.5,
    rigorBonus: 0.45,
    selfCheckBonus: 4,
    pathBonus: 2,
    selfRefute: true, crossVerify: true, counterfactual: true,
    metaCognition: true, adversarialTesting: true,
    robustnessVerification: true, falsifiabilityCheck: true,
    enabledFeatures: ['all'],
    disabledFeatures: [],
  },
  // Ultra 模式
  'ultra-fast': {
    model: 'ultra', mode: 'fast',
    budgetMult: 1.4, maxPaths: 6,
    strategy: 'Ultra迅流模式：快速但深度的思考',
    curveK: 2.5,
    curveType: 'powerLaw',
    thinkingBonus: 0.35,
    creativityBonus: 0.3,
    rigorBonus: 0.25,
    selfCheckBonus: 2,
    pathBonus: 1,
    enabledFeatures: ['basic-reasoning', 'self-check', 'multi-path', 'self-refute', 'cross-verify'],
    disabledFeatures: [],
  },
  'ultra-standard': {
    model: 'ultra', mode: 'standard',
    budgetMult: 1.6, maxPaths: 7,
    strategy: '释放 Ultra 长思考链，极限档允许超长内部推演',
    curveK: 2.6,
    curveType: 'sigmoid',
    thinkingBonus: 0.4,
    creativityBonus: 0.35,
    rigorBonus: 0.3,
    selfCheckBonus: 3,
    pathBonus: 2,
    selfRefute: true,
    enabledFeatures: ['basic-reasoning', 'self-check', 'multi-path', 'self-refute', 'cross-verify', 'counterfactual'],
    disabledFeatures: [],
  },
  'ultra-oc': {
    model: 'ultra', mode: 'oc',
    budgetMult: 2.5, maxPaths: 8,
    strategy: 'Ultra极境模式：地狱级别难度，全部高级推理机制启用',
    curveK: 3.0,
    curveType: 'bezier',
    thinkingBonus: 0.6,
    creativityBonus: 0.55,
    rigorBonus: 0.5,
    selfCheckBonus: 5,
    pathBonus: 3,
    selfRefute: true, crossVerify: true, counterfactual: true,
    metaCognition: true, adversarialTesting: true,
    robustnessVerification: true, falsifiabilityCheck: true,
    enabledFeatures: ['all'],
    disabledFeatures: [],
  },
};

/**
 * 根据模型 + 模式获取 profile
 */
export function profileOf(model, mode) {
  const key = `${model}-${mode}`;
  return PROFILES[key] || PROFILES['flash-standard'];
}

/**
 * 计算最终预算：基础曲线 × profile倍率
 */
export function finalBudget(x, model, mode) {
  const profile = profileOf(model, mode);
  const curveFn = getBudgetCurve(profile.curveType || 'powerLaw');
  const base = curveFn(x, profile.curveK || CURVE_K);
  return Math.min(1.0, base * profile.budgetMult);
}

/**
 * 列出所有可用的Profile
 */
export function listProfiles() {
  return Object.entries(PROFILES).map(([key, value]) => ({
    key,
    model: value.model,
    mode: value.mode,
    budgetMult: value.budgetMult,
    maxPaths: value.maxPaths,
    strategy: value.strategy,
  }));
}

/**
 * 获取Profile详细信息
 */
export function getProfileInfo(model, mode) {
  return profileOf(model, mode);
}

// ============================================================
// §4 复杂度评估器 ComplexityEstimator（扩展版）
// ============================================================

/**
 * 4.1 评估任务复杂度（0-1）
 * 输入：任务文本长度、代码/文件上下文规模、是否含多目标/冲突约束
 */
export function estimateComplexity(opts = {}) {
  // 真实启发式复杂度评估（0-1）：直接分析任务文本，叠加可观测的结构化信号。
  // 这是 computeBudget 动态下探的唯一依据，必须可解释、可复现，禁止注水标记/随机打分。
  const text = String(opts.taskText || opts.text || '');
  const taskLength = Number(opts.taskLength) || text.length;
  const contextSize = Number(opts.contextSize) || 0;

  let score = 0;

  // 1) 任务长度：对数饱和，超长任务天然需要更多分解（0 ~ 0.18）
  if (taskLength > 0) {
    score += Math.min(0.18, (Math.log10(1 + taskLength) / Math.log10(1 + 8000)) * 0.18);
  }
  // 2) 上下文规模：大量代码/文件/历史（0 ~ 0.14）
  if (contextSize > 0) {
    score += Math.min(0.14, (Math.log10(1 + contextSize) / Math.log10(1 + 50000)) * 0.14);
  }

  // 3) 文本真实信号（无需调用方逐项喂标记，直接判定）
  const add = (re, w) => { if (re.test(text)) score += w; };
  add(/(代码|函数|算法|数据结构|重构|架构|接口|并发|递归|编译|部署|code|function|class|algorithm|refactor|\bapi\b|stack|compile|deploy)/i, 0.12);
  add(/(bug|报错|异常|崩溃|调试|排查|排错|error|exception|crash|debug|traceback|fail(ed|ure)?)/i, 0.12);
  add(/(数学|证明|推导|方程|定理|概率|统计|数值计算|math|proof|derive|equation|theorem|probability)/i, 0.10);
  add(/(系统设计|架构设计|方案设计|技术选型|数据库设计|高并发|分布式|system design|distributed|architecture)/i, 0.13);
  add(/(多目标|既要|又要|同时满足|多个需求|约束很多|and also|additionally|furthermore)/i, 0.06);
  add(/(权衡|取舍|矛盾|冲突|不能同时|trade.?off|conflict|however|but also)/i, 0.07);
  add(/(多个文件|跨模块|整个项目|全局|所有地方|codebase|across|whole project|each file)/i, 0.08);
  add(/(对比|分析|评估|选型|利弊|优劣|compare|analy[sz]e|evaluate|pros and cons)/i, 0.07);
  add(/(图片|截图|图像|看图|识别图|image|screenshot|diagram)/i, 0.06);

  // 多步骤连接词计数（出现越多越需要规划，封顶 0.06）
  const multi = (text.match(/(首先|其次|然后|接着|最后|第一|第二|第三|步骤|step\s*\d|[①②③④⑤])/gi) || []).length;
  if (multi >= 3) score += 0.06;
  else if (multi >= 1) score += 0.03;

  // 4) 否定/硬约束密度（"不要/禁止/必须不"越多，约束空间越复杂，封顶 0.06）
  const neg = (text.match(/(不要|不能|禁止|绝不|不允许|必须不|do not|must not|don't|never)/gi) || []).length;
  score += Math.min(0.06, neg * 0.02);

  // 5) 调用方显式结构化信号（已判定时采信，单项都很小，防止注水）
  if (opts.hasMultiGoal) score += 0.05;
  if (opts.hasConflict) score += 0.05;
  if (opts.hasMath) score += 0.04;
  if (opts.hasSystemDesign || opts.hasAlgorithm) score += 0.05;
  if (opts.hasDebugging || opts.hasRefactoring) score += 0.05;
  if (opts.hasCode) score += 0.04;
  if (opts.hasFiles) score += 0.03;
  if (opts.hasImage) score += 0.04;

  return Math.max(0, Math.min(1, score));
}

// 由于文件过大，剩余部分将在后续写入
export const _CAPABILITY_CORE_PART1_COMPLETE = true;

// ============================================================
// §5 动态下探 DynamicDownshift（扩展版）
// ============================================================

/**
 * 5.1 基础动态下探：当复杂度显著低于当前档位时，实际预算自动收缩
 * 返回 { actualBudget, downshifted, savedPct, reason }
 */
export function dynamicDownshift(setBudget, complexity, allowDownshift = true) {
  if (!allowDownshift) {
    return { actualBudget: setBudget, downshifted: false, savedPct: 0, reason: 'disabled' };
  }
  // 复杂度映射到建议预算
  const suggested = B_MIN + (B_MAX - B_MIN) * Math.pow(complexity, 1.5);
  if (suggested >= setBudget * DOWNSHIFT_THRESHOLD) {
    return { actualBudget: setBudget, downshifted: false, savedPct: 0, reason: 'complex' };
  }
  const actual = Math.max(suggested, setBudget * DOWNSHIFT_MIN_RATIO);
  const savedPct = Math.round((1 - actual / setBudget) * 100);
  return { actualBudget: actual, downshifted: true, savedPct, reason: 'simple-task' };
}

/**
 * 5.2 基于任务类型的下探策略
 */
export const TASK_TYPE_DOWNSHIFT_STRATEGIES = {
  'simple-qa': {
    name: '简单问答',
    maxBudget: 0.3,
    allowDownshift: true,
    description: '简单问答任务，不需要深度思考',
  },
  'code-generation': {
    name: '代码生成',
    maxBudget: 0.8,
    allowDownshift: true,
    description: '代码生成任务，需要中等深度思考',
  },
  'code-debugging': {
    name: '代码调试',
    maxBudget: 0.9,
    allowDownshift: false,
    description: '代码调试任务，需要深度思考，不允许下探',
  },
  'system-design': {
    name: '系统设计',
    maxBudget: 1.0,
    allowDownshift: false,
    description: '系统设计任务，需要极致深度思考，不允许下探',
  },
  'creative-writing': {
    name: '创意写作',
    maxBudget: 0.7,
    allowDownshift: true,
    description: '创意写作任务，需要中等深度思考',
  },
  'analysis': {
    name: '分析任务',
    maxBudget: 0.85,
    allowDownshift: true,
    description: '分析任务，需要中高深度思考',
  },
  'research': {
    name: '研究任务',
    maxBudget: 1.0,
    allowDownshift: false,
    description: '研究任务，需要极致深度思考，不允许下探',
  },
  'translation': {
    name: '翻译任务',
    maxBudget: 0.4,
    allowDownshift: true,
    description: '翻译任务，不需要太深的思考',
  },
  'summarization': {
    name: '摘要任务',
    maxBudget: 0.5,
    allowDownshift: true,
    description: '摘要任务，需要中等深度思考',
  },
  'math': {
    name: '数学任务',
    maxBudget: 0.95,
    allowDownshift: false,
    description: '数学任务，需要深度思考，不允许下探',
  },
  'default': {
    name: '默认任务',
    maxBudget: 1.0,
    allowDownshift: true,
    description: '默认任务类型',
  },
};

/**
 * 5.3 获取任务类型的下探策略
 */
export function getTaskTypeDownshiftStrategy(taskType = 'default') {
  return TASK_TYPE_DOWNSHIFT_STRATEGIES[taskType] || TASK_TYPE_DOWNSHIFT_STRATEGIES['default'];
}

/**
 * 5.4 基于任务类型的动态下探
 */
export function dynamicDownshiftByTaskType(setBudget, complexity, taskType = 'default', allowDownshift = true) {
  const strategy = getTaskTypeDownshiftStrategy(taskType);
  const effectiveAllowDownshift = allowDownshift && strategy.allowDownshift;
  const effectiveMaxBudget = Math.min(setBudget, strategy.maxBudget);
  
  const result = dynamicDownshift(effectiveMaxBudget, complexity, effectiveAllowDownshift);
  result.taskType = taskType;
  result.strategy = strategy.name;
  return result;
}

/**
 * 5.5 渐进式下探：先高预算，发现简单后逐步降低
 */
export function progressiveDownshift(initialBudget, complexity, taskType = 'default') {
  const strategy = getTaskTypeDownshiftStrategy(taskType);
  
  // 第一阶段：使用初始预算
  const phase1 = {
    budget: initialBudget,
    duration: 'first-20%',
    description: '初始阶段，使用高预算快速评估任务复杂度',
  };
  
  // 第二阶段：根据复杂度调整
  const suggested = B_MIN + (B_MAX - B_MIN) * Math.pow(complexity, 1.5);
  const phase2Budget = Math.max(suggested, initialBudget * 0.5);
  const phase2 = {
    budget: phase2Budget,
    duration: '20%-60%',
    description: '中期阶段，根据评估的复杂度调整预算',
  };
  
  // 第三阶段：最终预算
  const finalBudget = dynamicDownshift(initialBudget, complexity, strategy.allowDownshift);
  const phase3 = {
    budget: finalBudget.actualBudget,
    duration: '60%-100%',
    description: '后期阶段，使用最终确定的预算完成任务',
  };
  
  return {
    phases: [phase1, phase2, phase3],
    finalBudget: finalBudget.actualBudget,
    downshifted: finalBudget.downshifted,
    savedPct: finalBudget.savedPct,
    taskType,
  };
}

/**
 * 5.6 预算回退机制：发现任务比预期复杂时自动提高预算
 */
export function budgetRecovery(currentBudget, actualComplexity, expectedComplexity, maxBudget = B_MAX) {
  const complexityRatio = actualComplexity / Math.max(expectedComplexity, 0.01);
  
  if (complexityRatio > DOWNSHIFT_RECOVERY_THRESHOLD) {
    // 任务比预期复杂，需要提高预算
    const increaseAmount = Math.min(maxBudget - currentBudget, currentBudget * (complexityRatio - 1) * 0.5);
    const newBudget = Math.min(maxBudget, currentBudget + increaseAmount);
    return {
      newBudget,
      increased: true,
      increaseAmount,
      increasePct: Math.round((increaseAmount / currentBudget) * 100),
      reason: 'task-more-complex-than-expected',
      complexityRatio,
    };
  }
  
  return {
    newBudget: currentBudget,
    increased: false,
    increaseAmount: 0,
    increasePct: 0,
    reason: 'task-complexity-as-expected',
    complexityRatio,
  };
}

/**
 * 5.7 列出所有任务类型下探策略
 */
export function listTaskTypeDownshiftStrategies() {
  return Object.entries(TASK_TYPE_DOWNSHIFT_STRATEGIES).map(([key, value]) => ({
    key,
    name: value.name,
    maxBudget: value.maxBudget,
    allowDownshift: value.allowDownshift,
    description: value.description,
  }));
}

// ============================================================
// §6 完整预算计算入口 BudgetDispatcher（扩展版）
// ============================================================

/**
 * 6.1 完整预算计算：滑块值 + 模型 + 模式 + 复杂度 → 最终预算参数
 */
export function computeBudget(opts = {}) {
  const {
    value = DEFAULT_VALUE,
    model = 'flash',
    mode = 'standard',
    complexity = 0.5,
    allowDownshift = true,
    taskType = 'default',
    curveType = null,
    customCurveK = null,
  } = opts;

  const tier = tierOf(value);
  const profile = profileOf(model, mode);
  const effectiveCurveType = curveType || profile.curveType || 'powerLaw';
  const effectiveCurveK = customCurveK || profile.curveK || CURVE_K;
  
  const curveFn = getBudgetCurve(effectiveCurveType);
  const baseBudget = curveFn(value * 5, effectiveCurveK); // 前端0-20转换为0-100
  const setBudget = Math.min(1.0, baseBudget * profile.budgetMult);
  
  // 使用基于任务类型的动态下探
  const ds = dynamicDownshiftByTaskType(setBudget, complexity, taskType, allowDownshift);
  const actual = ds.actualBudget;
  // 递归反思复审轮次（真实多次 MAX 调用，与 super-think-primer.reflectionPassesFor 对齐；oc=极境）
  const __baseRef = tier.reflectionPasses || 0;
  const __isOc = mode === 'oc';
  const reflectionPasses = __baseRef > 0 ? __baseRef + (__isOc ? 1 : 0) : (__isOc && value >= 16 ? 1 : 0);
  const totalPrimerCalls = 1 + reflectionPasses;

  return {
    // 输入
    value, tier, profile,
    complexity, taskType,
    curveType: effectiveCurveType,
    curveK: effectiveCurveK,
    // 预算
    setBudget, actualBudget: actual,
    downshifted: ds.downshifted, savedPct: ds.savedPct,
    downshiftReason: ds.reason,
    // 派生参数
    selfChecks: Math.min(MAX_SELF_CHECKS, quantizeSelfChecks(actual) + (profile.selfCheckBonus || 0)),
    paths: Math.min(profile.maxPaths || MAX_PATHS, quantizePaths(actual) + (profile.pathBonus || 0)),
    refutations: quantizeRefutations(actual),
    crossVerifications: quantizeCrossVerifications(actual),
    counterfactuals: quantizeCounterfactuals(actual),
    tokenMult: tier.tokenMult[0] + (tier.tokenMult[1] - tier.tokenMult[0]) * actual,
    // 真实增强：主预演 1 次 + 递归反思复审 N 次（独立 MAX 调用），高档断层来自此处而非 token 倍率
    reflectionPasses,
    totalPrimerCalls,
    thinkingDepth: tier.thinkingDepth + (profile.thinkingBonus || 0) * actual,
    creativity: tier.creativity + (profile.creativityBonus || 0) * actual,
    rigor: tier.rigor + (profile.rigorBonus || 0) * actual,
    // profile 增强
    selfRefute: !!(profile.selfRefute || (profile.enabledFeatures || []).includes('self-refute')) && actual > 0.5,
    crossVerify: !!(profile.crossVerify || (profile.enabledFeatures || []).includes('cross-verify')) && actual > 0.6,
    counterfactual: !!(profile.counterfactual || (profile.enabledFeatures || []).includes('counterfactual')) && actual > 0.75,
    metaCognition: !!profile.metaCognition && actual > 0.7,
    adversarialTesting: !!profile.adversarialTesting && actual > 0.8,
    robustnessVerification: !!profile.robustnessVerification && actual > 0.85,
    falsifiabilityCheck: !!profile.falsifiabilityCheck && actual > 0.9,
    // 启用的功能列表
    enabledFeatures: computeEnabledFeatures(profile, actual),
    disabledFeatures: profile.disabledFeatures || [],
  };
}

/**
 * 6.2 计算启用的功能列表
 */
export function computeEnabledFeatures(profile, actualBudget) {
  const baseFeatures = ['basic-reasoning', 'self-check'];
  const enabled = [...baseFeatures];
  
  if (actualBudget > 0.3) enabled.push('multi-path');
  if (actualBudget > 0.5) enabled.push('self-refute');
  if (actualBudget > 0.6) enabled.push('cross-verify');
  if (actualBudget > 0.7) enabled.push('meta-cognition');
  if (actualBudget > 0.75) enabled.push('counterfactual');
  if (actualBudget > 0.8) enabled.push('adversarial-testing');
  if (actualBudget > 0.85) enabled.push('robustness-verification');
  if (actualBudget > 0.9) enabled.push('falsifiability-check');
  
  // 添加profile特定的功能
  if (profile.enabledFeatures) {
    for (const feature of profile.enabledFeatures) {
      if (feature === 'all') {
        return ['all'];
      }
      if (!enabled.includes(feature)) {
        enabled.push(feature);
      }
    }
  }
  
  // 移除profile禁用的功能
  if (profile.disabledFeatures) {
    return enabled.filter(f => !profile.disabledFeatures.includes(f));
  }
  
  return enabled;
}

/**
 * 6.3 预算参数注入文本生成
 */
export function generateBudgetInjectionText(budgetResult) {
  if (!budgetResult || budgetResult.actualBudget <= 0.03) return '';
  
  const parts = [];
  const tierName = budgetResult.tier.name;
  const capVal = Math.round(budgetResult.value * 5);
  
  parts.push(`【Thinker Ultra 能力滑块·${tierName}档（${capVal}%）】当前思考预算档位：${tierName}。能力滑块本质 = 思考时间预算分配器：向右拖 = 允许模型花更多时间、更多思考 token、更多自检轮次、更多候选路径去想问题，所以越往右回答越慢但能力越强。`);
  
  parts.push(`【预算参数】实际思考预算释放度：${Math.round(budgetResult.actualBudget * 100)}%（设定 ${Math.round(budgetResult.setBudget * 100)}%${budgetResult.downshifted ? `，已按任务复杂度动态下探节省 ${budgetResult.savedPct}%` : ''}）；自我校验轮次：${budgetResult.selfChecks} 轮；并行候选路径：${budgetResult.paths} 条；递归反思复审：${budgetResult.reflectionPasses||0} 轮（独立 MAX 调用共 ${budgetResult.totalPrimerCalls||1} 次）；思考深度投入参考：${budgetResult.tokenMult.toFixed(1)}x；思考深度：${Math.round(budgetResult.thinkingDepth * 100)}%；创造力：${Math.round(budgetResult.creativity * 100)}%；严谨度：${Math.round(budgetResult.rigor * 100)}%。`);
  
  if (budgetResult.selfRefute) parts.push('【自我反驳】启用自我反驳机制：每个关键结论必须主动寻找反例、质疑前提、测试边界条件，驳不倒才保留。');
  if (budgetResult.crossVerify) parts.push('【交叉验证】启用交叉验证：关键结论必须用至少两种独立方法/路径验证一致，不一致必须回炉重推。');
  if (budgetResult.counterfactual) parts.push('【反事实推演】启用反事实攻击：对最终结论做"如果前提不成立会怎样"的反事实推演，检验结论的鲁棒性与可证伪性。');
  if (budgetResult.metaCognition) parts.push('【元认知校验】启用元认知校验：检查思考过程本身的偏差、盲点、逻辑跳跃，确保思考质量。');
  if (budgetResult.adversarialTesting) parts.push('【对抗性测试】启用对抗性测试：对关键结论进行红队攻击，尝试从各个角度推翻结论。');
  if (budgetResult.robustnessVerification) parts.push('【鲁棒性验证】启用鲁棒性验证：测试结论在边界条件、异常输入、极端情况下的稳定性。');
  if (budgetResult.falsifiabilityCheck) parts.push('【可证伪性检查】启用可证伪性检查：确保结论是可证伪的，不是空洞的套话。');
  
  if (budgetResult.selfChecks >= 2) parts.push(`【执行约束】推理过程中必须显式执行 ${budgetResult.selfChecks} 轮自我校验：每轮校验必须检查逻辑漏洞、遗漏约束、计算错误、前提假设，发现问题立即回溯修正。`);
  if (budgetResult.paths >= 2) parts.push(`【多路径推演】对核心问题必须同时推演 ${budgetResult.paths} 条独立候选路径，对比各路径结果，选择最优解或融合多路径优势。`);
  
  parts.push('【能力哲学】能力不是调出来的，是等出来的——你给它多少时间，它还你多少深度。当前档位已锁定，按此预算执行，不得偷工减料、不得跳过校验轮次。');
  
  parts.push('【Ultra 底层本质】Ultra 不是速度模式，不是参数调优，而是深度拆解任务的思考范式。每一个任务都必须被拆解为原子级子问题，每个子问题独立推理、交叉验证、再重新组装。原生 MAX 基座是底线，Ultra 在其上注入：HAG 集成增强（多路径锦标赛投票）、自我审查循环（每轮输出后自检）、24 个推理工具（分解/验证/反驳/模拟/优化等）、反事实推演（如果前提不成立）、元认知校验（检查思考过程本身的偏差）。Ultra 的目标不是更快，而是更深、更准、更可靠——用极致思考换取极致结果。');
  
  parts.push('【执行铁律】①思考链必须完整可见，不得隐藏推理过程；②每个关键结论必须有推导过程，不得只给结论；③自我校验轮次必须显式执行，不得跳过；④多路径推演必须对比各路径，不得只走一条路；⑤发现问题必须回溯修正，不得将错就错；⑥最终输出前必须做一轮完整性检查，确认所有子问题已解决、所有约束已满足、所有风险已应对。');
  
  return parts.join('\n');
}

// ============================================================
// §7 生效证明 Telemetry（扩展版）
// ============================================================

/**
 * 7.1 生成生效证明回显数据
 */
export function telemetryReport(budgetResult, actual = {}) {
  return {
    // 基本信息
    tier: budgetResult.tier.name,
    tierId: budgetResult.tier.id,
    profile: `${budgetResult.profile.model}/${budgetResult.profile.mode}`,
    taskType: budgetResult.taskType,
    curveType: budgetResult.curveType,
    curveK: budgetResult.curveK,
    // 预算信息
    setBudget: Math.round(budgetResult.setBudget * 100) + '%',
    actualBudget: Math.round(budgetResult.actualBudget * 100) + '%',
    downshifted: budgetResult.downshifted,
    savedPct: budgetResult.savedPct,
    downshiftReason: budgetResult.downshiftReason,
    // 派生参数
    selfChecks: budgetResult.selfChecks,
    paths: budgetResult.paths,
    refutations: budgetResult.refutations,
    crossVerifications: budgetResult.crossVerifications,
    counterfactuals: budgetResult.counterfactuals,
    tokenMult: budgetResult.tokenMult.toFixed(1) + 'x',
    thinkingDepth: Math.round(budgetResult.thinkingDepth * 100) + '%',
    creativity: Math.round(budgetResult.creativity * 100) + '%',
    rigor: Math.round(budgetResult.rigor * 100) + '%',
    // 高级功能
    selfRefute: budgetResult.selfRefute,
    crossVerify: budgetResult.crossVerify,
    counterfactual: budgetResult.counterfactual,
    metaCognition: budgetResult.metaCognition,
    adversarialTesting: budgetResult.adversarialTesting,
    robustnessVerification: budgetResult.robustnessVerification,
    falsifiabilityCheck: budgetResult.falsifiabilityCheck,
    enabledFeatures: budgetResult.enabledFeatures,
    // 实际性能
    thinkingTokens: actual.thinkingTokens || 0,
    totalTime: actual.totalTime || 0,
    firstTokenTime: actual.firstTokenTime || 0,
    toolCalls: actual.toolCalls || 0,
    selfCheckRounds: actual.selfCheckRounds || 0,
    pathsExplored: actual.pathsExplored || 0,
    // 时间戳
    timestamp: new Date().toISOString(),
    version: CAPABILITY_CORE_VERSION,
    build: CAPABILITY_CORE_BUILD,
  };
}

/**
 * 7.2 性能指标统计
 */
export class PerformanceStats {
  constructor() {
    this.samples = [];
    this.maxSamples = PERF_SAMPLE_SIZE;
  }
  
  addSample(sample) {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }
  
  getAverage(key) {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((acc, s) => acc + (s[key] || 0), 0);
    return sum / this.samples.length;
  }
  
  getMedian(key) {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].map(s => s[key] || 0).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  getPercentile(key, percentile) {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].map(s => s[key] || 0).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  getMin(key) {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map(s => s[key] || 0));
  }
  
  getMax(key) {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map(s => s[key] || 0));
  }
  
  getStats(key) {
    return {
      average: this.getAverage(key),
      median: this.getMedian(key),
      min: this.getMin(key),
      max: this.getMax(key),
      p50: this.getPercentile(key, 50),
      p90: this.getPercentile(key, 90),
      p95: this.getPercentile(key, 95),
      p99: this.getPercentile(key, 99),
      sampleCount: this.samples.length,
    };
  }
  
  clear() {
    this.samples = [];
  }
  
  toJSON() {
    return {
      sampleCount: this.samples.length,
      maxSamples: this.maxSamples,
      thinkingTokens: this.getStats('thinkingTokens'),
      totalTime: this.getStats('totalTime'),
      firstTokenTime: this.getStats('firstTokenTime'),
      toolCalls: this.getStats('toolCalls'),
    };
  }
}

/**
 * 7.3 推理过程分析器
 */
export class ReasoningAnalyzer {
  constructor() {
    this.thinkingChain = [];
    this.selfChecks = [];
    this.paths = [];
    this.toolCalls = [];
    this.errors = [];
  }
  
  addThinkingStep(step) {
    this.thinkingChain.push({
      ...step,
      timestamp: new Date().toISOString(),
    });
  }
  
  addSelfCheck(check) {
    this.selfChecks.push({
      ...check,
      timestamp: new Date().toISOString(),
    });
  }
  
  addPath(path) {
    this.paths.push({
      ...path,
      timestamp: new Date().toISOString(),
    });
  }
  
  addToolCall(call) {
    this.toolCalls.push({
      ...call,
      timestamp: new Date().toISOString(),
    });
  }
  
  addError(error) {
    this.errors.push({
      ...error,
      timestamp: new Date().toISOString(),
    });
  }
  
  analyze() {
    return {
      totalThinkingSteps: this.thinkingChain.length,
      totalSelfChecks: this.selfChecks.length,
      totalPaths: this.paths.length,
      totalToolCalls: this.toolCalls.length,
      totalErrors: this.errors.length,
      averageThinkingDepth: this.calculateAverageDepth(),
      pathDiversity: this.calculatePathDiversity(),
      selfCheckEffectiveness: this.calculateSelfCheckEffectiveness(),
      errorRate: this.errors.length / Math.max(1, this.thinkingChain.length),
      thinkingChain: this.thinkingChain,
      selfChecks: this.selfChecks,
      paths: this.paths,
      toolCalls: this.toolCalls,
      errors: this.errors,
    };
  }
  
  calculateAverageDepth() {
    if (this.thinkingChain.length === 0) return 0;
    const depths = this.thinkingChain.map(s => s.depth || 1);
    return depths.reduce((a, b) => a + b, 0) / depths.length;
  }
  
  calculatePathDiversity() {
    if (this.paths.length === 0) return 0;
    const uniqueApproaches = new Set(this.paths.map(p => p.approach || 'default'));
    return uniqueApproaches.size / this.paths.length;
  }
  
  calculateSelfCheckEffectiveness() {
    if (this.selfChecks.length === 0) return 0;
    const effectiveChecks = this.selfChecks.filter(c => c.foundIssue || c.correctedError);
    return effectiveChecks.length / this.selfChecks.length;
  }
  
  clear() {
    this.thinkingChain = [];
    this.selfChecks = [];
    this.paths = [];
    this.toolCalls = [];
    this.errors = [];
  }
}

/**
 * 7.4 质量评估器
 */
export class QualityEvaluator {
  constructor() {
    this.criteria = {
      completeness: { weight: 0.2, description: '完整性：是否解决了所有子问题' },
      correctness: { weight: 0.25, description: '正确性：逻辑是否正确，计算是否准确' },
      depth: { weight: 0.2, description: '深度：思考是否深入，是否触及本质' },
      creativity: { weight: 0.1, description: '创造力：是否有创新的解决方案' },
      clarity: { weight: 0.1, description: '清晰度：表达是否清晰易懂' },
      rigor: { weight: 0.15, description: '严谨性：是否有充分的验证和自检' },
    };
  }
  
  evaluate(result, context = {}) {
    const scores = {};
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [key, criterion] of Object.entries(this.criteria)) {
      const score = this.evaluateCriterion(key, result, context);
      scores[key] = {
        score,
        weight: criterion.weight,
        description: criterion.description,
      };
      weightedSum += score * criterion.weight;
      totalWeight += criterion.weight;
    }
    
    const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    return {
      overallScore,
      overallGrade: this.gradeFromScore(overallScore),
      scores,
      strengths: this.identifyStrengths(scores),
      weaknesses: this.identifyWeaknesses(scores),
      suggestions: this.generateSuggestions(scores, context),
      timestamp: new Date().toISOString(),
    };
  }
  
  evaluateCriterion(key, result, context) {
    // 确定性评分：只依据可观测的真实执行痕迹（自检/路径/验证/约束覆盖/结构），
    // 无证据时给中性偏低分，绝不允许 Math.random() 凭空给高分。
    const r = result || {};
    const ctx = context || {};
    const text = String(r.answer || r.text || r.content || '');
    const len = text.length;
    const checks = Number(r.selfChecks || r.selfCheckRounds || r.checks || 0);
    const paths = Number(r.paths || r.pathsExplored || 0);
    const refutes = Number(r.refutations || r.refutes || 0);
    const verified = !!(r.verificationPassed || r.crossVerified || r.verified);
    const hasError = !!(r.hasError || r.errors || r.knownError);
    const hasStructure = /(首先|其次|步骤|综上|结论|\d+\.\s|[-*]\s|step\s*\d|therefore|conclusion)/i.test(text);
    const hasCaveats = /(但是|然而|风险|局限|可能|不确定|权衡|however|risk|limitation|may|might|tradeoff)/i.test(text);
    const constraints = Number(ctx.constraints || (Array.isArray(ctx.requirementList) ? ctx.requirementList.length : 0));
    const addressed = Number(r.constraintsAddressed || 0);
    const clamp = (x) => Math.max(0, Math.min(1, x));

    let s = 0.5;
    switch (key) {
      case 'completeness':
        s = 0.42 + Math.min(0.33, len / 3500);
        if (constraints > 0) s = Math.max(s, 0.4 + 0.55 * Math.min(1, addressed / constraints));
        if (r.unresolved != null) s -= Math.min(0.25, Number(r.unresolved) * 0.05);
        break;
      case 'correctness':
        s = verified ? 0.9 : 0.55 + Math.min(0.2, checks * 0.05);
        if (hasError) s = Math.min(s, 0.38);
        if (refutes > 0) s = Math.min(0.97, s + 0.05);
        break;
      case 'depth':
        s = 0.42 + Math.min(0.32, paths * 0.08) + Math.min(0.16, checks * 0.03) + (len > 1500 ? 0.05 : 0);
        break;
      case 'creativity':
        s = 0.48 + Math.min(0.28, paths > 1 ? paths * 0.05 : 0) + (hasCaveats ? 0.05 : 0) + (r.novelApproach ? 0.1 : 0);
        break;
      case 'clarity':
        s = 0.52 + (hasStructure ? 0.2 : 0) + Math.min(0.14, len / 4500) + (r.hasSummary ? 0.06 : 0);
        break;
      case 'rigor':
        s = 0.48 + Math.min(0.3, checks * 0.06) + (hasCaveats ? 0.08 : 0) + (verified ? 0.1 : 0) + Math.min(0.1, refutes * 0.04);
        break;
      default:
        s = 0.55 + Math.min(0.2, checks * 0.04);
    }
    return clamp(s);
  }
  
  gradeFromScore(score) {
    if (score >= 0.95) return 'S+';
    if (score >= 0.9) return 'S';
    if (score >= 0.85) return 'A+';
    if (score >= 0.8) return 'A';
    if (score >= 0.75) return 'B+';
    if (score >= 0.7) return 'B';
    if (score >= 0.65) return 'C+';
    if (score >= 0.6) return 'C';
    if (score >= 0.5) return 'D';
    return 'F';
  }
  
  identifyStrengths(scores) {
    return Object.entries(scores)
      .filter(([, s]) => s.score >= 0.8)
      .map(([key, s]) => ({ key, ...s }));
  }
  
  identifyWeaknesses(scores) {
    return Object.entries(scores)
      .filter(([, s]) => s.score < 0.7)
      .map(([key, s]) => ({ key, ...s }));
  }
  
  generateSuggestions(scores, context) {
    const suggestions = [];
    for (const [key, s] of Object.entries(scores)) {
      if (s.score < 0.7) {
        suggestions.push(`提升${s.description}：当前得分${Math.round(s.score * 100)}%，建议加强这方面的表现。`);
      }
    }
    return suggestions;
  }
}

// ============================================================
// §8 导出（所有常量和函数已在定义时导出，此处无需重复导出）
// ============================================================

export const _CAPABILITY_CORE_PART2_COMPLETE = true;

