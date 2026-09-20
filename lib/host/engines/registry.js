// ============================================================================
// registry.js — 24 台独立滑杆引擎的统一注册表 / 聚合出口
// 由 gen-dual-engines.mjs 生成。agent-hooks 与工具箱只依赖本注册表，不直接碰单引擎。
// 双模型隔离：planForModel 只返回该模型可见的引擎，杜绝越模型生效。
// ============================================================================
import DeepEngine from './deep-engine.js';
import BranchEngine from './branch-engine.js';
import MemoryEngine from './memory-engine.js';
import CodeEngine from './code-engine.js';
import MetaEngine from './meta-engine.js';
import FalsifyEngine from './falsify-engine.js';
import ExecEngine from './exec-engine.js';
import AbstEngine from './abst-engine.js';
import SynthEngine from './synth-engine.js';
import CohereEngine from './cohere-engine.js';
import CalibEngine from './calib-engine.js';
import EntropyEngine from './entropy-engine.js';
import ReplayEngine from './replay-engine.js';
import DepsEngine from './deps-engine.js';
import VisionEngine from './vision-engine.js';
import VscanEngine from './vscan-engine.js';
import VgraphEngine from './vgraph-engine.js';
import VerifyEngine from './verify-engine.js';
import AgentEngine from './agent-engine.js';
import LongcodeEngine from './longcode-engine.js';
import ConsistEngine from './consist-engine.js';
import HealEngine from './heal-engine.js';
import ReclaimEngine from './reclaim-engine.js';
import SafetyEngine from './safety-engine.js';
import TempoEngine from './tempo-engine.js';
import BreadthEngine from './breadth-engine.js';
import SharpenEngine from './sharpen-engine.js';
import CompressEngine from './compress-engine.js';
import PlanEngine from './plan-engine.js';
import CritiqueEngine from './critique-engine.js';
import RetrievalEngine from './retrieval-engine.js';
import FormatEngine from './format-engine.js';
import AxiomEngine from './axiom-engine.js';
import TopologyEngine from './topology-engine.js';
import FractalEngine from './fractal-engine.js';
import RecursionEngine from './recursion-engine.js';
import FusionEngine from './fusion-engine.js';
import ProofEngine from './proof-engine.js';
import ModalityEngine from './modality-engine.js';
import ReflectEngine from './reflect-engine.js';
import CrossmodelEngine from './crossmodel-engine.js';
import VzoomEngine from './vzoom-engine.js';
import VtrackEngine from './vtrack-engine.js';
import VspatialEngine from './vspatial-engine.js';
import VocrEngine from './vocr-engine.js';
import VcounterfactualEngine from './vcounterfactual-engine.js';
import { aggregate } from '../aggregation-core.js';
import { directMetacog } from '../metacog-director.js';

const ENGINE_PAIRS = [
  ['deep', DeepEngine],
  ['branch', BranchEngine],
  ['memory', MemoryEngine],
  ['code', CodeEngine],
  ['meta', MetaEngine],
  ['falsify', FalsifyEngine],
  ['exec', ExecEngine],
  ['abst', AbstEngine],
  ['synth', SynthEngine],
  ['cohere', CohereEngine],
  ['calib', CalibEngine],
  ['entropy', EntropyEngine],
  ['replay', ReplayEngine],
  ['deps', DepsEngine],
  ['vision', VisionEngine],
  ['vscan', VscanEngine],
  ['vgraph', VgraphEngine],
  ['verify', VerifyEngine],
  ['agent', AgentEngine],
  ['longcode', LongcodeEngine],
  ['consist', ConsistEngine],
  ['heal', HealEngine],
  ['reclaim', ReclaimEngine],
  ['safety', SafetyEngine],
  ['tempo', TempoEngine],
  ['breadth', BreadthEngine],
  ['sharpen', SharpenEngine],
  ['compress', CompressEngine],
  ['plan', PlanEngine],
  ['critique', CritiqueEngine],
  ['retrieval', RetrievalEngine],
  ['format', FormatEngine],
  ['axiom', AxiomEngine],
  ['topology', TopologyEngine],
  ['fractal', FractalEngine],
  ['recursion', RecursionEngine],
  ['fusion', FusionEngine],
  ['proof', ProofEngine],
  ['modality', ModalityEngine],
  ['reflect', ReflectEngine],
  ['crossmodel', CrossmodelEngine],
  ['vzoom', VzoomEngine],
  ['vtrack', VtrackEngine],
  ['vspatial', VspatialEngine],
  ['vocr', VocrEngine],
  ['vcounterfactual', VcounterfactualEngine],
];

/** @type {Map<string, any>} */
export const ENGINES = new Map(ENGINE_PAIRS);
export const ENGINE_LIST = ENGINE_PAIRS.map(([, e]) => e);

export function getEngine(key) { return ENGINES.get(key) || null; }
export function hasEngine(key) { return ENGINES.has(key); }
export function listEngines() { return ENGINE_LIST.slice(); }

const MODEL_KEYS = {
  flash: ['deep', 'branch', 'memory', 'code', 'falsify', 'exec', 'entropy', 'deps', 'verify', 'agent', 'longcode', 'consist', 'heal', 'reclaim', 'safety', 'tempo', 'breadth', 'sharpen', 'compress', 'plan', 'critique', 'retrieval', 'format'],
  vision: ['deep', 'branch', 'memory', 'code', 'falsify', 'exec', 'entropy', 'deps', 'vision', 'vscan', 'vgraph', 'verify', 'agent', 'longcode', 'consist', 'heal', 'reclaim', 'safety', 'tempo', 'breadth', 'sharpen', 'compress', 'plan', 'critique', 'retrieval', 'format', 'vzoom', 'vtrack', 'vspatial', 'vocr', 'vcounterfactual'],
  pro: ['deep', 'branch', 'memory', 'code', 'meta', 'falsify', 'exec', 'abst', 'synth', 'cohere', 'calib', 'entropy', 'replay', 'deps', 'verify', 'agent', 'longcode', 'consist', 'heal', 'reclaim', 'safety', 'tempo', 'breadth', 'sharpen', 'compress', 'plan', 'critique', 'retrieval', 'format', 'axiom', 'topology', 'fractal', 'recursion', 'fusion', 'proof', 'modality', 'reflect', 'crossmodel'],
};

export function keysOfModel(model) {
  const m = String(model || 'pro').toLowerCase();
  if (m.includes('vision')) return MODEL_KEYS.vision.slice();
  if (m.includes('flash')) return MODEL_KEYS.flash.slice();
  return MODEL_KEYS.pro.slice();
}

/** 单引擎增强段（0 档/无此引擎返回空串，绝不空耗） */
export function enhanceOf(key, tier, ctx) {
  const e = getEngine(key);
  return e ? e.enhance(tier, ctx) : '';
}

/** 聚合某模型当前所有非零杆的结构化计划（供调度器与 Rust 对齐） */
export function planForModel(model, sliders) {
  const s = sliders || {};
  const out = [];
  for (const key of keysOfModel(model)) {
    const e = getEngine(key);
    if (!e) continue;
    const tier = e.clamp(s[key]);
    if (tier > 0) out.push(e.plan(tier));
  }
  return Object.freeze(out);
}

/** 汇总当前激活引擎的总预算权重 / 总迭代 / 总扇出（真实编排预算，非提示词摆设） */
export function budgetOf(model, sliders) {
  const plans = planForModel(model, sliders);
  return plans.reduce((acc, p) => {
    acc.budgetW += p.budgetW; acc.iter += p.iter; acc.fanout += p.fanout; acc.checks += p.checks;
    acc.tools += p.tools.length; acc.active += 1;
    return acc;
  }, { active: 0, budgetW: 0, iter: 0, fanout: 0, checks: 0, tools: 0 });
}

/** 用全部激活引擎对一份草稿做交叉自检，返回聚合分与缺失项 */
export function verifyDraft(model, sliders, draft, ctx) {
  const s = sliders || {};
  const reports = [];
  for (const key of keysOfModel(model)) {
    const e = getEngine(key);
    if (!e) continue;
    const tier = e.clamp(s[key]);
    if (tier > 0) reports.push({ key, name: e.name, ...e.selfVerify(draft, tier, ctx) });
  }
  const missing = reports.flatMap((r) => r.missing.map((m) => '[' + r.name + '] ' + m));
  const avg = reports.length ? Math.round(reports.reduce((a, r) => a + r.score, 0) / reports.length) : 100;
  return { score: avg, passed: missing.length === 0, reports, missing };
}

// 重抽象元认知杆：standard 复杂度先不堆，complex(>=2) 才全开（省 token、避免简单题过度自省）
// v0.10 扩军：6 根 pro 元认知重杆一并纳入；工程杆(topology/proof/crossmodel)属执行链不在此列
const HEAVY_META = new Set(['meta', 'abst', 'synth', 'cohere', 'calib', 'entropy', 'replay', 'axiom', 'fractal', 'recursion', 'fusion', 'modality', 'reflect']);
// v0.10 扩军：全部视觉杆仅在确实含图时注入
const VISUAL_KEYS = new Set(['vision', 'vscan', 'vgraph', 'vzoom', 'vtrack', 'vspatial', 'vocr', 'vcounterfactual']);
const TIER_ZH = ['关', '低', '中', '高', '超高', '极限', '绝顶'];
const BAND_TAG = { 4: '［超高·非线性跃升］', 5: '［极限·罕见再跃·烧预算换确定性］', 6: '［绝顶·封顶封印］' };

/**
 * 聚合一台模型当前所有激活引擎，产出一段紧凑、可执行的“非线性内核协同”指令。
 * @param {string} model  flash|vision|pro
 * @param {(key:string)=>number} effTier  最终档位解析（agent-hooks 传入 resolveEffective，含能力上限/解锁封顶）
 * @param {{complexity?:number, hasImage?:boolean, mode?:string}} ctx
 * @returns {string} 空串表示本段不注入（trivial / 无激活杆），绝不空耗 token
 */
export function buildKernelSection(model, effTier, ctx = {}) {
  const complexity = Number.isFinite(ctx.complexity) ? ctx.complexity : 2;
  if (complexity <= 0) return ''; // trivial：直答，不叠内核段
  const lines = [];
  let sumIter = 0, sumFanout = 0, sumChecks = 0, sumTools = 0, active = 0, peak = 0;
  for (const key of keysOfModel(model)) {
    const e = getEngine(key);
    if (!e) continue;
    let t = 0;
    try { t = e.clamp(effTier(key)); } catch { t = 0; }
    if (t <= 0) continue;
    // standard：重抽象杆先抑制；视觉杆仅在确实含图时加入
    if (complexity < 2 && HEAVY_META.has(key)) continue;
    if (VISUAL_KEYS.has(key) && !ctx.hasImage) continue;
    const p = e.plan(t);
    active += 1; peak = Math.max(peak, t);
    sumIter += p.iter || 0; sumFanout += p.fanout || 0; sumChecks += p.checks || 0;
    const tools = Array.isArray(p.tools) ? p.tools : [];
    sumTools += tools.length;
    const band = BAND_TAG[t] ? BAND_TAG[t] : '';
    const toolChain = tools.length ? '；工具链 ' + tools.join('→') : '';
    lines.push('·' + e.name + '（' + (TIER_ZH[t] || t) + t + '/6，强度' + Math.round((e.gain(t) || 0) * 100) + '%）：迭代×' + (p.iter || 0) + '、扇出' + (p.fanout || 0) + '、自检' + (p.checks || 0) + toolChain + (band ? ' ' + band : ''));
  }
  if (!active) return '';

  // —— 组合压缩核：把当前全部拉杆排列归约成唯一参数向量（与 Rust aggregate.rs 同公式）——
  const __pv = aggregate(ctx.sliders || {}, model, Number(ctx.budgetTokens) || 48000).paramVector;
  const __caps = [];
  if (__pv.bayes_fusion) __caps.push('贝叶斯证据融合');
  if (__pv.counterfactual) __caps.push('反事实分支森林');
  if (__pv.formal_verify) __caps.push('形式化证明义务闭合');
  if (__pv.multi_agent) __caps.push('多智能体编排');
  const vectorBlock = '【统一调度向量·组合压缩核归约】以上全部拉杆的排列组合已被噪声或聚合归约为唯一一个控制向量，下游引擎只认该向量、不直接消费原始档位，因此任意组合都不会互相冲突，拉高任意一根都只会更强、绝不回退：并行分支×' + __pv.branches + '、递归自省 ' + __pv.reflection_rounds + ' 轮、证明义务闭合深度 ' + __pv.proof_closure_depth + '、候选池 ' + __pv.candidate_pool + '、独立审判视角 ' + __pv.judge_panels + ' 个、元锦标赛 ' + __pv.tournament_rounds + ' 轮、认知黑板 ' + __pv.blackboard_slots + ' 槽、记忆锚点 ' + __pv.memory_slots + '、工具箱调用深度 ' + __pv.tool_depth + '、激活工具 ' + __pv.active_tools + ' 件、交付自检清单 ' + __pv.checks + ' 项、自愈 ' + __pv.heal_layers + ' 层、熵审计 ' + __pv.entropy_passes + ' 遍、置信标定 ' + __pv.confidence_points + ' 点；采样温度压至 ' + Math.round(__pv.temperature_pct) + '%，每 ' + __pv.anchor_period + ' 步重新锚定原始目标，无进展最多 ' + __pv.anti_loop_max + ' 次即强制收敛，过程上下文按 ' + Math.round(__pv.reclaim_ratio * 100) + '% 回收。' + (__caps.length ? '已点亮高阶能力：' + __caps.join('、') + '。' : '');
  // —— v0.10 元认知核心舱：L1-L5 拓扑 + 红/黑/实验开关，映射为真实 Rust 内核调度 ——
  const __mc = directMetacog(ctx.metacog || {}, model);
  let mcBlock = '';
  if (__mc.level >= 1) {
    const st = __mc.structure;
    const kernelList = __mc.activeKernels.map(function (k) { return k.name + '(' + Object.keys(k.params).map(function (p) { return p + '=' + (typeof k.params[p] === 'object' ? JSON.stringify(k.params[p]) : k.params[p]); }).join(',') + ')'; }).join('、');
    mcBlock = '【Ultra 元认知核心舱·L' + __mc.level + '·' + __mc.topology.zh + '】' + __mc.directiveZh + '结构预算下限：并行分支×' + st.branches + '、自省 ' + st.reflectionRounds + ' 轮、五立场审判席 ' + st.judgePanels + ' 个、自指 ' + st.selfRefLayers + ' 层、分形深度 ' + st.fractalDepth + '、递归怀疑 ' + st.doubtLayers + ' 层、思想实验 ' + st.thoughtExperiments + ' 组、盲区扫描 ' + st.blindspotKinds + ' 维、证明义务闭合深度 ' + st.closureDepth + '；核心舱整体预算放大 ×' + __mc.budgetMult + '，由 Rust S 级内核真实调度：' + (kernelList || '无额外深算，走结构基线') + '。这些不是措辞要求，分支计数、自省层数、依赖图、概率场运算与多级熔断都在内核侧执行。';
  }
  const head = '【Think 非线性内核·' + active + ' 台独立引擎协同（底座恒为原生 MAX，前台显示 Ultra）】以下每台引擎都是一条独立增强链，档位即真实执行预算，拖到哪档就按哪档的迭代/扇出/自检/工具链真实发力，逐档非线性变强，不得只在措辞上显得更努力：';
  const tail = '协同总预算：总迭代 ' + sumIter + '、总扇出 ' + sumFanout + '、自检点 ' + sumChecks + '、工具点火 ' + sumTools + ' 次，最高档位 ' + (TIER_ZH[peak] || peak) + '。引擎之间单点失败必须隔离、不得拖垮其余；所有激活引擎的自检点全部闭环后，才允许交付最终结果。';
  return head + '\n' + lines.join('\n') + '\n' + vectorBlock + '\n' + (mcBlock ? mcBlock + '\n' : '') + tail;
}

export default { ENGINES, ENGINE_LIST, getEngine, hasEngine, listEngines, keysOfModel, enhanceOf, planForModel, budgetOf, verifyDraft, buildKernelSection };
