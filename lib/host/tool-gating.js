// tool-gating.js — v0.1 正式版 · 工具箱能量门控（host 侧纯函数，零副作用、可单测）
//
// 设计哲学（fail-open，极致稳定、兼容一切）：
//   真实工具全集由 buildToolset 动态产出并作为 allNames 传入；门控表 GATES 只显式声明
//   「需要某根滑杆/某个开关供能才上线」或「需要有图才上线」的工具；**凡未在 GATES 登记的工具
//   一律默认常驻**（只要 Ultra 开）。这样：绝不会因为漏登记而误杀任何现有/未来工具（fail-open），
//   关光滑杆时常驻工具与底座 MAX 仍可用、系统照常跑；受门控的工具则随其供能杆/开关实时上下线。
//
// 三层数量口径：catalog 该模型真实全集（allNames）；active 当前真正注册给模型的集合（变量）。

// ───────────────────────── 主控杆合并（前端收敛用，底层引擎杆不动，零回归） ─────────────────────────
// v0.1 收敛：Flash/Pro 各 4 根主控；与 client-modules/constants.cjs 的 MASTER_GROUPS 严格同构。
// 已删除独立 vision 模型键——Vision 下线，看图能力并入原生多模态的 Flash（flash.vision 组）。
export const MASTER_MAP = {
  flash: {
    depth: ['deep', 'tempo', 'branch', 'breadth', 'plan', 'retrieval'],
    rigor: ['verify', 'falsify', 'critique', 'compress', 'entropy'],
    execute: ['memory', 'deps', 'exec', 'format', 'sharpen'],
    vision: ['vision', 'vscan', 'vgraph', 'vzoom', 'vtrack', 'vspatial', 'vocr', 'vcounterfactual'],
  },
  pro: {
    depth: ['deep', 'tempo', 'branch', 'breadth', 'plan', 'retrieval'],
    rigor: ['verify', 'falsify', 'critique', 'compress', 'entropy', 'proof', 'cohere', 'calib', 'code'],
    metacog: ['memory', 'deps', 'exec', 'format', 'sharpen', 'meta', 'abst', 'reflect', 'replay'],
    topology: ['topology', 'fractal', 'recursion', 'fusion', 'modality', 'crossmodel', 'axiom', 'synth'],
  },
};

export function expandMasters(model, masters) {
  const map = MASTER_MAP[model] || MASTER_MAP.flash;
  const out = {};
  const mm = masters && typeof masters === 'object' ? masters : {};
  for (const master of Object.keys(map)) {
    const t = Math.max(0, Math.min(7, Math.round(Number(mm[master]) || 0)));
    if (t <= 0) continue;
    for (const under of map[master]) out[under] = Math.max(out[under] || 0, t);
  }
  return out;
}

// ───────────────────────── 显式能量门（未登记的工具默认常驻，绝不误杀） ─────────────────────────
// sliders 任一 >0 即供能；modules 任一 on 即供能；image=true 需当前有图；always 显式常驻。
export const GATES = {
  // —— 【工具合并 78→9】按模型档分层的合并工具（flash 7 / vision 8 / pro 9） ——
  // Super Think 超级思考工具：必须第一步调用，始终常驻（legacy 全量时外露）
  super_think: { always: true },
  // 多模态视觉精读合并工具（vision/pro 档）：仅看图时外露（极简模式下也只挂它）
  ultra_vision: { image: true },
  // Pro 旗舰高阶推理合并工具（仅 pro 档目录存在）
  ultra_pro: { model: 'pro' },
  // 其余基础合并工具（legacy 全量时外露，极简模式不外露，能力走 OC/Harness 原生）
  ultra_analyze: { always: true },
  ultra_verify: { always: true },
  ultra_code: { always: true },
  ultra_execute: { always: true },
  ultra_meta: { always: true },
  ultra_synthesize: { always: true },
  // —— 以下为原子工具的历史门控定义（合并后仅作参考，不再直接用于激活判断）——
  // —— v0.1 第一批基础认知工具：受对应主控杆/开关供能，杆归 0 即从模型眼前下线 ——
  ultra_parse_intent: { sliders: ['plan', 'deep', 'tempo'] },
  ultra_assumption_extract: { sliders: ['verify', 'critique', 'falsify'] },
  ultra_strawman_check: { sliders: ['critique', 'falsify'], modules: ['devil'] },
  ultra_persona_lens: { sliders: ['branch', 'breadth'], modules: ['branches'] },
  ultra_redteam_question: { sliders: ['critique', 'falsify', 'branch'] },
  ultra_acceptance_gate: { sliders: ['format', 'verify', 'exec'], modules: ['review', 'recheck'] },
  // —— v0.1 第二批基础认知工具 ——
  ultra_evidence_bind: { sliders: ['verify', 'memory', 'deps'], modules: ['recheck'] },
  ultra_counterfactual_fork: { sliders: ['falsify', 'branch', 'breadth'] },
  ultra_bestof_compete: { sliders: ['branch', 'breadth', 'exec'], modules: ['bestof'] },
  ultra_edge_case: { sliders: ['falsify', 'critique', 'verify'] },
  ultra_term_define: { sliders: ['deep', 'memory', 'tempo'] },
  ultra_synthesis_merge: { sliders: ['branch', 'sharpen', 'format'] },
  // —— v0.1 第三批基础认知工具 ——
  ultra_numeric_recheck: { sliders: ['verify', 'exec'], modules: ['recheck'] },
  ultra_step_plan: { sliders: ['plan', 'exec', 'tempo'] },
  ultra_risk_register: { sliders: ['verify', 'plan', 'critique'] },
  ultra_compare_options: { sliders: ['branch', 'breadth', 'exec'] },
  ultra_analogy_bridge: { sliders: ['branch', 'breadth', 'deep'] },
  ultra_progressive_summary: { sliders: ['compress', 'memory', 'entropy'] },
  // —— v0.1 第四批基础认知工具（闭环补齐）——
  ultra_problem_route: { sliders: ['plan', 'deep', 'tempo'] },
  ultra_quality_checklist: { sliders: ['format', 'verify', 'exec'], modules: ['review'] },
  ultra_pitfall_scan: { sliders: ['falsify', 'critique', 'memory'] },
  ultra_falsify_experiment: { sliders: ['falsify', 'branch', 'exec'], modules: ['recheck'] },
  ultra_sensitivity: { sliders: ['verify', 'exec', 'deps'] },
  ultra_causal_chain: { sliders: ['deep', 'deps', 'memory'] },
  // —— 视觉工具：必须当前有图，且对应视觉杆/开关供能 ——
  ultra_vision_grid: { image: true, sliders: ['vision', 'vzoom'], modules: ['vtile'] },
  ultra_vision_crosscheck: { image: true, sliders: ['vscan'], modules: ['vcross'] },
  ultra_vision_occlusion: { image: true, sliders: ['vscan', 'vision'] },
  ultra_vision_rescale: { image: true, sliders: ['vzoom'] },
  ultra_vision_readdiff: { image: true, sliders: ['vscan', 'vcounterfactual'] },
  ultra_vision_ocr: { image: true, sliders: ['vocr'] },
  ultra_vision_layout: { image: true, sliders: ['vgraph', 'vspatial'] },
  ultra_vision_zoom: { image: true, sliders: ['vzoom'] },
  // —— Pro 专属高阶/危险工具：由 Pro 高阶杆或黑色模块分级解锁（每件至少一根真实杆兜底，绝不死锁；
  //    model:'pro' 仅用于契约审计——这些名字本就只出现在 Pro 全集，激活遍历时天然与 Flash/Vision 隔离）——
  ultra_first_principles: { model: 'pro', sliders: ['abst', 'axiom', 'deep'] },
  ultra_formalize: { model: 'pro', sliders: ['proof', 'axiom', 'code'] },
  ultra_decompose_dag: { model: 'pro', sliders: ['topology', 'plan', 'deps'] },
  ultra_proof_obligations: { model: 'pro', sliders: ['proof', 'cohere', 'verify'] },
  ultra_invariant_audit: { model: 'pro', sliders: ['proof', 'verify', 'code'] },
  ultra_reflection_chain: { model: 'pro', sliders: ['reflect', 'meta', 'replay'] },
  ultra_decision_matrix: { model: 'pro', sliders: ['fusion', 'exec', 'breadth'] },
  ultra_meta_tournament: { model: 'pro', sliders: ['fusion', 'fractal', 'branch'], modules: ['bestof', 'sparring'] },
  ultra_global_constraints: { model: 'pro', sliders: ['cohere', 'topology', 'axiom'] },
  ultra_adversarial_redteam: { model: 'pro', sliders: ['falsify', 'critique'], modules: ['devil'] },
  ultra_bayes_calib: { model: 'pro', sliders: ['fusion', 'calib'] },
  ultra_self_distill: { model: 'pro', sliders: ['reflect', 'sharpen'] },
  ultra_proof_chain: { model: 'pro', sliders: ['proof', 'axiom', 'cohere'] },
  // —— Pro 第五批·更抽象/更危险（公理多世界/模态/递归不动点/自指怪圈/本体坍缩/观察者相对化）——
  ultra_axiom_unwind: { model: 'pro', sliders: ['axiom', 'abst', 'deep'] },
  ultra_modal_worlds: { model: 'pro', sliders: ['modality', 'branch', 'fractal'] },
  ultra_recursion_fixpoint: { model: 'pro', sliders: ['recursion', 'reflect', 'deep'] },
  ultra_strange_loop: { model: 'pro', sliders: ['fractal', 'meta', 'recursion'], modules: ['antiloop'] },
  ultra_ontic_collapse: { model: 'pro', sliders: ['fusion', 'synth', 'abst'] },
  ultra_observer_relativity: { model: 'pro', sliders: ['crossmodel', 'reflect', 'breadth'] },
};
export const GATED_NAMES = Object.keys(GATES);

function sliderOn(sliders, keys) {
  if (!sliders || !keys || !keys.length) return false;
  for (const k of keys) { const v = Number(sliders[k]); if (Number.isFinite(v) && v > 0) return true; }
  return false;
}
function moduleOn(modules, keys) {
  if (!modules || !keys || !keys.length) return false;
  for (const k of keys) { if (modules[k]) return true; }
  return false;
}
function gatePasses(g, cfg) {
  // image:true 的工具必须当前有图（视觉切块/放大/OCR需要宿主处理图像）
  if (g.image && !cfg.hasImage) return false;
  // always:true 的工具恒可用（如 super_think）
  if (g.always) return true;
  // 其余工具默认注册（让模型知道可以用），滑杆/开关决定工具内部强度而非是否注册
  // 模型在特定情况下自主选择调用哪些工具，践行"注册≠强制调用"
  return true;
}

/**
 * 当前配置下应注册给模型的工具名（已排序）。allNames = buildToolset 真实全集。
 * fail-open：GATES 未登记的名字一律常驻；任何残缺输入安全降级、绝不抛错。
 */
// v2·全量注册+条件激活：所有工具都注册给模型（让模型知道可以用），
// 但由 gatePasses 决定哪些在当前滑杆/开关配置下真正可用。
// 践行"注册≠强制调用"：模型在特定情况下自主选择调用哪些工具。
// - always:true 的工具（如 super_think）恒可用
// - image:true 的工具需要当前有图
// - sliders:[] 的工具需要对应滑杆>0
// - modules:[] 的工具需要对应模块开关开启
// - GATES 未登记的工具默认恒可用（fail-open，新增工具不会被误杀）
const ALWAYS_ACTIVE = new Set(Object.keys(GATES).filter((n) => GATES[n].always === true));

export function activeToolNames(model, cfg, allNames) {
  try {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    // 1) Ultra 关闭：零外露
    if (c.ultraOn === false) return [];
    const names = Array.isArray(allNames) ? allNames.slice() : [];

    // 2) 传统全量模式（用户显式开启 legacyTools）：外露该档全集，忽略图片/滑杆/模块门
    if (c.legacyTools === true) return names.sort();

    // 3) 极简模式（v0.1 定版，默认）：仅看图时外露名字含 vision 的视觉工具，
    //    无图时文本路径零外露；能力型工具一律走 OC / Harness 原生，不占工具槽。
    if (c.hasImage === true) {
      return names.filter((n) => typeof n === 'string' && n.includes('vision')).sort();
    }
    return [];
  } catch {
    // 任何意外：安全收回（fail-closed，避免在极简模式下误外露整组工具）
    return [];
  }
}

export function fingerprint(model, cfg, allNames) {
  const active = activeToolNames(model, cfg, allNames);
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return [
    model,
    c.ultraOn ? 1 : 0,
    c.hasImage ? 1 : 0,
    c.legacyTools ? 1 : 0,
    c.lang || 'zh',
    active.join('|'),
  ].join('#');
}

export function diffSets(prevArr, nextArr) {
  const prev = new Set(prevArr || []), next = new Set(nextArr || []);
  const add = [], remove = [];
  for (const x of next) if (!prev.has(x)) add.push(x);
  for (const x of prev) if (!next.has(x)) remove.push(x);
  return { add, remove };
}
