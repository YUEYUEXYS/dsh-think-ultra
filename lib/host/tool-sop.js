// tool-sop.js — 根据「当前真实激活的工具集」生成确定性工具调用 SOP（作战手册）。
// 只列模型此刻真能用的工具（由 syncer.activeNames 提供，绝不出现"手册有、工具无"）；
// 按任务复杂度裁剪：trivial 不给（省 token、鼓励直答），standard 给核心链，complex 给全链。

// 认知作战链分组；core=true 的组在 standard 复杂度也给出，其余仅 complex。
const CHAIN = [
  { title: '① 理解定界', core: true, items: [
    ['ultra_problem_route', '不确定用什么方法时先判问题类型并选解法路线'],
    ['ultra_parse_intent', '把模糊请求重构成目标/硬约束/验收/子任务，开工前用'],
    ['ultra_term_define', '术语多义、口径不一时先锁定唯一定义'],
    ['ultra_anchor', '先锚定已知量、目标与不可违背约束'],
  ]},
  { title: '② 展开求解', core: false, items: [
    ['ultra_step_plan', '多步任务先排带依赖与完成判据的步骤'],
    ['ultra_deep_deduce', '关键子问题一步推不可靠时多路独立再解'],
    ['ultra_hypothesis_board', '并排列出多个候选假设再逐一甄别'],
    ['ultra_persona_lens', '涉及多方/盲区时换多个立场并行审视'],
    ['ultra_analogy_bridge', '陌生问题无思路时借结构同构领域迁移'],
  ]},
  { title: '③ 对抗质疑', core: true, items: [
    ['ultra_assumption_extract', '列出未明说的隐含前提并标确定性'],
    ['ultra_redteam_question', '定稿前以最强对手角度提必答的尖锐问题'],
    ['ultra_edge_case', '扫空/零/极值/越界/并发等边界是否覆盖'],
    ['ultra_counterfactual_fork', '关键假设若不成立结论会不会翻转'],
    ['ultra_strawman_check', '反驳前确认批的是对方原意而非稻草人'],
    ['ultra_counter_search', '主动搜证反例而不是只找支持证据'],
    ['ultra_find_logical_flaw', '定位形式/前提/假设层面的逻辑漏洞'],
    ['ultra_debate_attack', '魔鬼代言人：对当前结论发起攻击'],
    ['ultra_defend_against', '针对攻击补防或承认并修正'],
    ['ultra_pitfall_scan', '熟悉场景先扫经典高发陷阱与本例是否中招'],
    ['ultra_falsify_experiment', '设计最小代价、最快推翻当前假设的测试'],
  ]},
  { title: '④ 核验校准', core: true, items: [
    ['ultra_claim_verify', '每条关键断言独立判 成立/推翻/存疑'],
    ['ultra_evidence_bind', '给结论绑证据强度，揪出无据主张'],
    ['ultra_numeric_recheck', '关键数字用第二种方法独立复算'],
    ['ultra_sensitivity', '分析结论对哪些输入最敏感、翻转阈值'],
    ['ultra_causal_chain', '排查根因时重建因果链、区分相关与因果'],
    ['ultra_invariant_audit', '核查不变量在每步是否保持'],
    ['ultra_proof_obligations', '需要严谨时列出并逐条履行证明义务'],
    ['ultra_bayes_calib', '为主观判断校准先验/似然与置信度'],
  ]},
  { title: '⑤ 收敛择优', core: false, items: [
    ['ultra_synthesis_merge', '多路材料去重、消矛盾、综合成一份'],
    ['ultra_bestof_compete', '并行多版解答按准则只留最强'],
    ['ultra_decision_matrix', '多方案按统一维度打分对比'],
    ['ultra_self_review', '交回前对自己的草稿做一遍终审'],
    ['ultra_context_compress', '上下文臃肿时无损压缩关键信息'],
    ['ultra_progressive_summary', '长任务沉淀结构化工作记忆与断点'],
  ]},
  { title: '⑥ 交付总闸', core: true, items: [
    ['ultra_quality_checklist', '交付前生成可逐项勾验的质量检查单'],
    ['ultra_acceptance_gate', '交付前对照验收标准逐项判，全绿才输出，否则先修订'],
  ]},
  { title: '⑦ 视觉精读（有图）', core: false, vision: true, items: [
    ['ultra_vision_grid', '划网格逐区精读，不凭印象概括'],
    ['ultra_vision_ocr', '密集文字/数字/标签逐一誊抄'],
    ['ultra_vision_crosscheck', '图中读到的与问题/前文逐条对照找冲突'],
    ['ultra_vision_zoom', '关键局部放大看清细节'],
    ['ultra_vision_layout', '重建空间布局/结构关系'],
    ['ultra_vision_readdiff', '对比多图/前后帧差异'],
    ['ultra_vision_occlusion', '检查被遮挡/裁切区域，不臆测'],
    ['ultra_vision_rescale', '按比例/尺度换算图中量'],
  ]},
  { title: '⑧ Pro 高阶推演（更深·更危险，仅复杂题启用，按当前已解锁工具选用）', core: false, items: [
    ['ultra_first_principles', '把结论拆到不可再分的公理/事实层再重建'],
    ['ultra_axiom_unwind', '下钻公理栈，换互斥地基看多套结论如何改变'],
    ['ultra_formalize', '把自然语言论证形式化为命题与推理规则，查形式漏洞'],
    ['ultra_decompose_dag', '把复杂任务分解为无环依赖图，按拓扑序攻坚'],
    ['ultra_proof_obligations', '列出结论尚欠的证明义务，逐条闭合才算成立'],
    ['ultra_proof_chain', '为关键结论构造环环相扣的证明链，缺环即不成立'],
    ['ultra_invariant_audit', '枚举系统不变量并审计是否在每步后仍保持'],
    ['ultra_reflection_chain', '对自己的推理再反思，多层递归直到无可质疑'],
    ['ultra_recursion_fixpoint', '递归追问“凭什么”直到不动点，揪出循环论证'],
    ['ultra_meta_tournament', '多个独立推理路径同台竞赛、交叉裁判取最强'],
    ['ultra_global_constraints', '在全局硬约束下同步求解，防止局部最优违反总约束'],
    ['ultra_adversarial_redteam', '以最强对手做五维系统性红队，攻击整条推理链'],
    ['ultra_bayes_calib', '把各假设的先验/似然做贝叶斯校准，看后验是否翻盘'],
    ['ultra_decision_matrix', '多方案加权打分并标帕累托前沿，做不后悔的决策'],
    ['ultra_modal_worlds', '在多个可能世界巡检，区分必然/可能/偶然/不可能'],
    ['ultra_strange_loop', '遇到自指与悖论时做对象层/元层分层消融'],
    ['ultra_ontic_collapse', '用奥卡姆剃刀清点本体论承诺，坍缩到最省解释'],
    ['ultra_observer_relativity', '对不同观察者做相对化矩阵，剥出伪装客观的立场'],
    ['ultra_self_distill', '把复杂推理蒸馏为更简洁等价形式并校验保真'],
  ]},
  // ⑨ DSH 0.1.6 原生执行工具：极境模式下优先用真实工具验证，而非空想
  { title: '⑨ 原生执行工具（DSH 内置·极境优先用真实行动验证）', core: true, native: true, items: [
    ['bash', '需要运行命令/脚本/编译/测试/安装依赖时直接执行，不要只说"你可以运行"'],
    ['bash_persistent', '需要保持 shell 会话/环境变量/工作目录跨多次调用时用持久终端'],
    ['pwsh', 'Windows PowerShell 命令执行（文件/注册表/进程/系统管理）'],
    ['fs_read', '读取文件内容前先读，禁止凭记忆/猜测文件内容'],
    ['fs_write', '创建/覆盖文件时用，写完后回读验证'],
    ['fs_search', '在工作区搜索文件名/内容，定位目标文件'],
    ['web_search', '需要最新信息/文档/API/错误解决方案时联网搜索，不要凭过时记忆'],
    ['web_fetch', '需要读取具体网页/文档全文时抓取，不要只看搜索摘要'],
    ['str_replace_editor', '精确修改文件中的特定字符串，比整文件重写更安全'],
    ['todo', '多步任务先建待办清单，每完成一项标记，防止遗漏'],
    ['ask_user', '关键信息缺失/需要用户确认时主动问，不要猜'],
    ['subagent', '可独立拆分的子任务派子代理并行处理，主代理汇总'],
  ]},
];

// 内部协议工具不进 SOP（模型无需被教导手动调）
const INTERNAL = new Set(['ultra_phase_mark', 'ultra_strategy_profile', 'ultra_refactor_relaunch']);

/**
 * @param activeNames 当前真实注册给模型的工具名数组（syncer.activeNames）
 * @param opts.complexity 0 trivial / 1 standard / 2 complex
 * @param opts.hasImage 是否有图
 */
export function buildToolSop(activeNames, opts = {}) {
  try {
    const cplx = Number(opts.complexity) || 0;
    if (cplx <= 0) return ''; // 简单题直答，不堆手册
    const live = new Set((activeNames || []).filter((n) => !INTERNAL.has(n)));
    if (!live.size) return '';
    const blocks = [];
    let used = 0;
    for (const g of CHAIN) {
      if (g.vision && !opts.hasImage) continue;
      if (!g.core && cplx < 2) continue; // standard 只给核心链
      const lines = [];
      for (const [name, when] of g.items) {
        // 原生工具（native 分组）总是可用，不依赖 activeNames
        if (g.native) { lines.push('  - ' + name + '：' + when); used++; }
        else if (live.has(name)) { lines.push('  - ' + name + '：' + when); used++; }
      }
      if (lines.length) blocks.push(g.title + '\n' + lines.join('\n'));
    }
    if (!used) return '';
    const discipline = cplx >= 2
      ? '纪律：①关键判断必须调用对应工具核验，禁止"假装已核验"；②参数一次填完整；③工具返回 ok:false 就按主流程继续、不对同一工具空转重试；④简单子问题直答，不为用而用；⑤交付前必须过 ultra_acceptance_gate（若已上线），全绿才输出最终答案。'
      : '纪律：关键步骤调用对应工具核验而非凭空断言；工具失败就按主流程继续；交付前过一遍 ultra_acceptance_gate（若已上线）。';
    return '【Think 工具箱作战手册 · 已上线 ' + used + ' 件】下列是你此刻真实可调用的外脑工具，按链条择机主动调用：\n' + blocks.join('\n') + '\n' + discipline;
  } catch { return ''; }
}
