// metacog-director.js — v0.10 Ultra 元认知核心舱调度器（host 侧，纯函数 ESM）
//
// 职责：把面板上的元认知状态（L1..L5 主滑杆 + 红3/黑6/实验4 开关 + 模型）
// 归约成三类“真实生效”的产物，而不是拼一段漂亮提示词就完事：
//   1) topology / structure：本次推理采用的拓扑（线性/对抗/陪审团/框架解构/自缠绕）
//      与每个被点亮能力对应的 Rust S 级内核调用参数（activeKernels）。
//   2) budget：档位与开关如何放大 token / 分支 / 自省层数预算（非线性，只增不减）。
//   3) directive：一段极简、命令式的结构指令（真正的计数、熔断、依赖图、概率场
//      运算都在 Rust 内核；文本只负责把“当前拓扑约束”传达给底座模型）。
//
// 不变量（与 aggregation-core 的单调性证明一致）：
//   - 主档位每升一级，structure 强度、预算、内核调用集合都单调不减；
//   - 任意叠加一个开关，只可能新增内核调用 / 增加预算，绝不削弱已有能力；
//   - Flash 拿不到黑色极端档，实验档必须 devUnlocked，未解锁一律忽略（纵深防御，
//     前端已锁，这里再兜底）。

export const METACOG_TOPOLOGY = {
  0: { id: 'off', zh: '原生 MAX（不叠加元认知结构）' },
  1: { id: 'linear', zh: '单路正向推理' },
  2: { id: 'adversarial', zh: '主结论 + 独立批判分支正反对抗' },
  3: { id: 'jury', zh: '五立场陪审团并行博弈 + 对数几率融合投票' },
  4: { id: 'frame_deconstruct', zh: '框架预设拆解与问题重建' },
  5: { id: 'recursive_selfref', zh: '递归自指元认知（自缠绕回路）' },
};

// 主档位 -> 结构基线（分支数、自省轮、审判席、自指层数等的“下限”，最终与
// aggregation-core 的 ParamVector 取逐域 max，保证只强不弱）
const LEVEL_BASELINE = {
  0: { branches: 0, reflectionRounds: 0, judgePanels: 0, selfRefLayers: 0, fractalDepth: 0, doubtLayers: 0, thoughtExperiments: 0, blindspotKinds: 0, closureDepth: 0 },
  1: { branches: 1, reflectionRounds: 0, judgePanels: 0, selfRefLayers: 0, fractalDepth: 0, doubtLayers: 0, thoughtExperiments: 0, blindspotKinds: 0, closureDepth: 0 },
  2: { branches: 2, reflectionRounds: 1, judgePanels: 0, selfRefLayers: 0, fractalDepth: 0, doubtLayers: 1, thoughtExperiments: 0, blindspotKinds: 0, closureDepth: 1 },
  3: { branches: 4, reflectionRounds: 2, judgePanels: 5, selfRefLayers: 1, fractalDepth: 0, doubtLayers: 1, thoughtExperiments: 2, blindspotKinds: 2, closureDepth: 2 },
  4: { branches: 6, reflectionRounds: 4, judgePanels: 5, selfRefLayers: 2, fractalDepth: 1, doubtLayers: 3, thoughtExperiments: 4, blindspotKinds: 5, closureDepth: 3 },
  5: { branches: 9, reflectionRounds: 7, judgePanels: 5, selfRefLayers: 3, fractalDepth: 2, doubtLayers: 4, thoughtExperiments: 7, blindspotKinds: 9, closureDepth: 4 },
};

// 主档位非线性预算放大系数（相对基础预算），L5 近乎无上限，交由 Rust 熔断兜底
const LEVEL_BUDGET_MULT = { 0: 1, 1: 1.05, 2: 1.35, 3: 1.9, 4: 2.8, 5: 4.2 };

function isProLike(model) {
  const m = String(model || 'pro').toLowerCase();
  return m.indexOf('pro') >= 0 || m.indexOf('flash') >= 0;
}

function clampLevel(lv) {
  const n = Math.round(Number(lv) || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

// 逐域取 max 的结构合并（保证叠加开关只强不弱）
function floorMax(acc, patch) {
  const out = Object.assign({}, acc);
  for (const k of Object.keys(patch || {})) {
    out[k] = Math.max(Number(out[k]) || 0, Number(patch[k]) || 0);
  }
  return out;
}

/**
 * 核心归约函数。
 * @param {object} rawMetacog 面板 metacog 状态（已由 host normalize，这里仍做防御性兜底）
 * @param {string} model flash | pro
 * @returns {{level:number,topology:object,structure:object,budgetMult:number,
 *            activeKernels:Array,flags:object,directiveZh:string,directiveEn:string}}
 */
export function directMetacog(rawMetacog, model) {
  const level = clampLevel(rawMetacog && rawMetacog.level);
  const red = (rawMetacog && rawMetacog.red) || {};
  const black = (rawMetacog && rawMetacog.black) || {};
  const lab = (rawMetacog && rawMetacog.lab) || {};
  const devUnlocked = !!(rawMetacog && rawMetacog.devUnlocked);
  const abyss = (rawMetacog && rawMetacog.abyss) || {};
  const proLike = isProLike(model);

  const structure = Object.assign({}, LEVEL_BASELINE[level] || LEVEL_BASELINE[0]);
  const activeKernels = [];
  const flags = {
    counterfactual: false, provenance: false, paradoxResolve: false,
    doubtStack: false, thoughtLab: false, blindspot: false, fractal: false,
    selfDestruct: false, multiConclusion: false,
    probField: false, infiniteRecursion: false, cognitiveDeconstruct: false, counterIntuitive: false,
    onticEpoch: false, strangeLoop: false, modalCollapse: false, axiomUnbind: false, metaObserver: false, semanticVacuum: false,
  };
  let budgetMult = LEVEL_BUDGET_MULT[level] || 1;

  function enableKernel(name, params, budgetAdd) {
    activeKernels.push({ name: name, params: params || {} });
    if (Number.isFinite(budgetAdd)) budgetMult += budgetAdd;
  }

  // —— 主档位拓扑内核（L2 起真实调度 Rust）——
  if (level >= 2) enableKernel('reasoning.tournament', { rounds: level >= 5 ? 3 : level - 1, adversarial: true }, 0.05);
  if (level >= 3) enableKernel('blackboard.deliberate', { stances: 5, fuse: 'logodds' }, 0.12);
  if (level >= 3) enableKernel('bayes.fuse', { mode: 'logodds', calibrate: true }, 0.04);
  if (level >= 4) enableKernel('reflection.run', { mode: 'frame', layers: structure.doubtLayers }, 0.18);
  if (level >= 5) {
    enableKernel('topology.build', { kind: 'selfloop', selfRefLayers: structure.selfRefLayers, fractalDepth: structure.fractalDepth }, 0.3);
    enableKernel('reflection.run', { mode: 'recursive', layers: structure.doubtLayers }, 0.25);
    // 语义收敛度熔断：命题指纹滑窗熵 + 重复死循环/分支爆炸/停滞分级裁决，防 L5 无限自缠绕
    enableKernel('sem.evaluate', { window: 8, softEntropy: 0.82, hardEntropy: 0.95, stallRounds: 4 }, 0.2);
  }

  // —— 红色增强档（L2 起可用，保留收敛性）——
  if (level >= 2 && red.cf) {
    flags.counterfactual = true;
    structure.branches = Math.max(structure.branches, level >= 4 ? 12 : 7);
    enableKernel('reasoning.tournament', { counterfactualForest: true, prune: true }, 0.22);
  }
  if (level >= 2 && red.prov) {
    flags.provenance = true;
    enableKernel('provenance.analyze', { trackDeps: true, cascadeInvalidate: true }, 0.1);
  }
  if (level >= 2 && red.para) {
    flags.paradoxResolve = true;
    enableKernel('bayes.fuse', { resolveParadox: true }, 0.06);
  }

  // —— 黑色极端档（仅 L4/L5 且 Pro/Vision；Flash 强制忽略）——
  const blackOpen = level >= 4 && proLike;
  if (blackOpen) {
    if (black.doubt) {
      flags.doubtStack = true;
      const patch = { doubtLayers: Math.max(structure.doubtLayers, level >= 5 ? 5 : 3) };
      Object.assign(structure, floorMax(structure, patch));
      enableKernel('reflection.run', { mode: 'doubtstack', layers: patch.doubtLayers }, 0.2);
    }
    if (black.sandbox) {
      flags.thoughtLab = true;
      Object.assign(structure, floorMax(structure, { thoughtExperiments: level >= 5 ? 7 : 5 }));
      enableKernel('reflection.run', { mode: 'thoughtlab', experiments: structure.thoughtExperiments }, 0.18);
    }
    if (black.blind) {
      flags.blindspot = true;
      Object.assign(structure, floorMax(structure, { blindspotKinds: level >= 5 ? 9 : 6 }));
      enableKernel('reflection.run', { mode: 'blindspot', kinds: structure.blindspotKinds }, 0.14);
    }
    if (black.fractal) {
      flags.fractal = true;
      Object.assign(structure, floorMax(structure, { fractalDepth: level >= 5 ? 4 : 1, branches: 18 }));
      enableKernel('topology.build', { kind: 'fractal', depth: structure.fractalDepth }, 0.35);
    }
    if (black.selfkill) {
      flags.selfDestruct = true;
      Object.assign(structure, floorMax(structure, { closureDepth: 5 }));
      enableKernel('proof.check', { selfDestruct: true, mustSurvive: true }, 0.16);
    }
    if (black.multiconc) {
      flags.multiConclusion = true;
      enableKernel('field.evolve', { keepMultiModal: true, noForceCollapse: true }, 0.12);
    }
  }

  // 黑色极端全开叠加：黑6点亮越多，额外 budget 越高（只增不减）
  {
    const blackOn = [black.doubt, black.sandbox, black.blind, black.fractal, black.selfkill, black.multiconc].filter(Boolean).length;
    if (blackOpen && blackOn >= 4) budgetMult += 0.15 * (blackOn - 3);
  }
  // —— 实验级档（仅开发者模式；infinite 才放宽熔断）——
  if (devUnlocked) {
    if (lab.pfield) {
      flags.probField = true;
      enableKernel('field.evolve', { fullField: true, interfere: true, collapse: true }, 0.4);
      // 认知概率场数值内核：分布/双峰干涉/扩散坍缩/自反馈（纯 f64，确定性可对拍）
      enableKernel('pfield.step', { mode: 'evolve', gamma: 0.6, rounds: 4 }, 0.5);
      budgetMult += 0.3;
    }
    if (lab.infinite && blackOpen) {
      flags.infiniteRecursion = true;
      enableKernel('topology.build', { kind: 'selfloop', selfRefLayers: 4, breakers: false }, 0.6);
      budgetMult += 0.8; // 近乎无上限，熔断仅保留硬资源保护
    }
    if (lab.decon) {
      flags.cognitiveDeconstruct = true;
      enableKernel('reflection.run', { mode: 'deconstruct' }, 0.15);
    }
    if (lab.counterint) {
      flags.counterIntuitive = true;
      enableKernel('primitives.execute', { paradigm: 'counterintuitive' }, 0.1);
    }
  }

  // —— 纯黑深渊层（仅 L5；双模型可用；强度 0..1 非线性放大，只增不减）——
  if (level >= 5) {
    const sOf = function (k) { const c = abyss[k]; return c && c.on ? Math.max(0, Math.min(1, (Number(c.strength) || 0) / 100)) : 0; };
    let s;
    if ((s = sOf('ontic')) > 0) {
      flags.onticEpoch = true;
      structure.reflectionRounds = Math.max(structure.reflectionRounds, 1 + Math.round(s * 4));
      enableKernel('reflection.run', { mode: 'ontic-epoche', layers: 1 + Math.round(s * 4), suspendExistence: true }, 0.12 + s * 0.3);
    }
    if ((s = sOf('strange')) > 0) {
      flags.strangeLoop = true;
      structure.selfRefLayers = Math.max(structure.selfRefLayers, 1 + Math.round(s * 5));
      enableKernel('topology.build', { kind: 'strangeloop', order: 1 + Math.round(s * 5), fixedPoint: true }, 0.15 + s * 0.35);
    }
    if ((s = sOf('modal')) > 0) {
      flags.modalCollapse = true;
      structure.branches = Math.max(structure.branches, 2 + Math.round(s * 7));
      enableKernel('field.evolve', { mode: 'modal-collapse', worlds: 2 + Math.round(s * 7), interfere: true, collapse: true }, 0.15 + s * 0.4);
    }
    if ((s = sOf('axiom')) > 0) {
      flags.axiomUnbind = true;
      enableKernel('meta_rules.override', { unbindAxioms: 1 + Math.round(s * 5), drift: true, reanchor: true }, 0.12 + s * 0.3);
    }
    if ((s = sOf('observer')) > 0) {
      flags.metaObserver = true;
      structure.reflectionRounds = Math.max(structure.reflectionRounds, 1 + Math.round(s * 6));
      enableKernel('reflection.run', { mode: 'meta-observer', recede: 1 + Math.round(s * 6) }, 0.14 + s * 0.34);
    }
    if ((s = sOf('vacuum')) > 0) {
      flags.semanticVacuum = true;
      enableKernel('primitives.execute', { mode: 'semantic-vacuum', radius: 1 + Math.round(s * 9), rebuild: true }, 0.1 + s * 0.26);
    }
  }

  // 去重内核调用（同名取 params 合并），保证调度列表确定
  const mergedKernels = [];
  const kernelIndex = new Map();
  for (const k of activeKernels) {
    if (!kernelIndex.has(k.name)) { kernelIndex.set(k.name, mergedKernels.length); mergedKernels.push({ name: k.name, params: Object.assign({}, k.params) }); }
    else { Object.assign(mergedKernels[kernelIndex.get(k.name)].params, k.params); }
  }

  const topology = METACOG_TOPOLOGY[level] || METACOG_TOPOLOGY[0];
  return {
    level,
    topology,
    structure,
    budgetMult: Number(budgetMult.toFixed(3)),
    activeKernels: mergedKernels,
    flags,
    directiveZh: buildDirective('zh', level, topology, flags, proLike),
    directiveEn: buildDirective('en', level, topology, flags, proLike),
  };
}

function buildDirective(lang, level, topology, flags, proLike) {
  if (level <= 0) return '';
  const lines = lang === 'zh' ? [] : [];
  if (lang === 'zh') {
    lines.push('【Ultra 元认知拓扑·L' + level + '】' + topology.zh + '。');
    if (level === 2) lines.push('先给主结论，再立一条独立批判分支正面攻击它，驳不倒才交付。');
    if (level === 3) lines.push('并行拉起逻辑/经验/怀疑/边界/语义五个立场互相质证，先各自成案再融合投票，禁止一边倒。');
    if (level === 4) lines.push('先拆问题背后的隐形预设、公理与边界，推翻前提重建问题，再在新框架内作答。');
    if (level === 5) lines.push('逐层向内审视本次思考本身：思考→审视思考→审视“审视”，并质疑用于怀疑的规则；靠熔断在发散前收敛出最深结论。');
    if (flags.counterfactual) lines.push('在每个关键分叉构造“如果这步错了”的反事实分支森林，剪枝后只留最薄弱点的加固结论。');
    if (flags.provenance) lines.push('每条结论标注事实/推导/假设并挂依赖链；任一前提被证伪，连锁作废其全部衍生结论。');
    if (flags.paradoxResolve) lines.push('遇到两套自洽结论冲突时不选边，定位语义/前提范围/隐含假设的矛盾根源后再消解。');
    if (flags.doubtStack) lines.push('启动递归怀疑堆栈：答案→评判标准→底层公理→思考体系，逐层可向上推翻。');
    if (flags.thoughtLab) lines.push('在思想实验沙盒中用极端边界与反常识场景反复撞击结论，击穿或彻底验证为止。');
    if (flags.blindspot) lines.push('显式扫描自身盲区，补出“我原本没考虑到什么”，再回修正结论。');
    if (flags.fractal) lines.push('按分形拓扑嵌套：每个子立场内部再跑一遍完整对抗结构。');
    if (flags.selfDestruct) lines.push('结论自毁：成稿后对它发起终极批判，只有无法被自身推翻才输出。');
    if (flags.multiConclusion) lines.push('不强制收敛：若多套结论各自成立，并行完整呈现，标注分歧维度交由使用者裁决。');
    if (flags.probField) lines.push('以概率场视角处理：先铺开多峰可能分布，相互干涉后再坍缩为结论。');
    if (flags.infiniteRecursion && proLike) lines.push('实验态：放开递归深度，直到触及硬资源边界才收敛。');
    if (flags.cognitiveDeconstruct) lines.push('先解构“我为什么会这样回答”，剥离训练惯性与内置偏见后再给结论。');
    if (flags.counterIntuitive) lines.push('屏蔽常识惯性，优先沿违背直觉但前提成立的路径推演。');
    if (flags.onticEpoch) lines.push('本体论悬置：先悬置“问题中的实体客观存在”这一默认信念，把每个对象当作待建构项重估其存在性预设，再作答。');
    if (flags.strangeLoop) lines.push('奇异自指闭环：构造“结论成为自身前提”的层次怪圈，沿缠绕层级求自指不动点解，熔断前给出最稳定不动点。');
    if (flags.modalCollapse) lines.push('模态坍缩：并行展开必然/可能/偶然/不可能多个可能世界相互干涉，再坍缩为现实结论（按强度滑杆决定世界数）。');
    if (flags.axiomUnbind) lines.push('公理解绑漂移：临时解绑推理依赖的底层公理，在无锚公理空间漂移后重新锚定，对比换公理后的结论差异。');
    if (flags.metaObserver) lines.push('观察者无限后退：引入观察者观察观察者，逐层重审下层结论，直到强度指定的后退深度。');
    if (flags.semanticVacuum) lines.push('语义真空重建：抽空关键词的默认语义，在真空中重建词义关系，先识别语言本身制造的伪问题再回答。');
    return lines.join('');
  }
  lines.push('[Ultra metacognitive topology · L' + level + '] ' + topology.id + '.');
  if (level === 2) lines.push(' Give the main conclusion, then mount one independent critic branch against it; ship only if it survives.');
  if (level === 3) lines.push(' Run five stances (logic, empirical, skeptic, boundary, semantic) in parallel, cross-examine, then fuse by log-odds and vote.');
  if (level === 4) lines.push(' First dismantle hidden presets, axioms and boundaries, rebuild the question, then answer inside the new frame.');
  if (level === 5) lines.push(' Recurse inward: think, inspect the thinking, inspect that inspection, doubt the rule of doubt; converge only when the breaker fires.');
  if (flags.counterfactual) lines.push(' Grow a counterfactual branch forest at every fork, prune, then harden the weakest link.');
  if (flags.provenance) lines.push(' Tag fact/deduction/assumption with a dependency graph; cascade-invalidate derivatives when a premise falls.');
  if (flags.paradoxResolve) lines.push(' On clash, do not pick sides; locate semantic/scope/assumption roots and dissolve them.');
  if (flags.doubtStack) lines.push(' Recursive doubt stack: answer, then standard, then axiom, then the whole system.');
  if (flags.thoughtLab) lines.push(' Hammer the conclusion with extreme boundary and counter-intuitive scenarios in a thought sandbox.');
  if (flags.blindspot) lines.push(' Scan your own blind spots and state what you would otherwise have missed.');
  if (flags.fractal) lines.push(' Fractal nesting: replicate the full adversarial structure inside every sub-stance.');
  if (flags.selfDestruct) lines.push(' Self-destruct the draft with a terminal critique; emit only what survives.');
  if (flags.multiConclusion) lines.push(' Keep multiple sound conclusions alive in parallel instead of forcing one.');
  if (flags.probField) lines.push(' Treat cognition as a multi-modal probability field: spread, interfere, then collapse.');
  if (flags.infiniteRecursion && proLike) lines.push(' Experimental: lift recursion depth until the hard resource boundary.');
  if (flags.cognitiveDeconstruct) lines.push(' Deconstruct why you would answer this way, strip bias, then conclude.');
  if (flags.counterIntuitive) lines.push(' Suspend common sense and prefer the counter-intuitive path whenever its premises hold.');
  if (flags.onticEpoch) lines.push(' Ontological epoche: suspend the default belief that entities objectively exist, treat each as a construct, then answer.');
  if (flags.strangeLoop) lines.push(' Strange loop: the conclusion becomes its own premise; seek the stablest self-referential fixed point before the breaker fires.');
  if (flags.modalCollapse) lines.push(' Modal collapse: spread necessary/possible/contingent/impossible worlds, interfere, then collapse (world count follows strength).');
  if (flags.axiomUnbind) lines.push(' Axiom unbind drift: unbind underlying axioms, drift anchor-free, re-anchor, and compare conclusions under changed axioms.');
  if (flags.metaObserver) lines.push(' Infinite observer regress: observer of the observer, re-auditing each layer down to the chosen recede depth.');
  if (flags.semanticVacuum) lines.push(' Semantic vacuum: evacuate default meanings, rebuild sense relations, and first expose pseudo-problems made by language.');
  return lines.join('');
}

// 供注入层使用：把 director 结果转成“需要异步调用的 Rust 内核”快捷调用清单
export function kernelCallPlan(directed) {
  if (!directed || !Array.isArray(directed.activeKernels)) return [];
  return directed.activeKernels.map((k) => ({ method: k.name, params: k.params }));
}
