'use strict';
import { defineTool } from '@deepseek-ai/dsh-tools';
/**
 * Think Ultra · 工具合并层（原子工具 → 按模型档分层的合并工具）
 *
 * 设计原则：
 * 1. 代码量不变——所有原子工具的 execute / presentCall / description 完整保留
 * 2. 对外只暴露少量合并工具，每个通过 sub_action 参数路由到原子工具
 * 3. 合并工具的 parameters 使用 additionalProperties:true，允许原子工具的任意参数透传
 * 4. 严格按模型档（tier）分层，数量与能力严格递增：
 *      flash(0) = 7 个文本/认知工具
 *      vision(1) = flash 全集 + ultra_vision（多模态精读）
 *      pro(2)   = vision 全集 + ultra_pro（Pro 旗舰高阶推理）
 *    即 flash < vision < pro，三档工具集是严格包含关系，绝不串档。
 * 5. tool-gating / tool-sop 层只需感知合并工具名。
 */

// 模型档层级（数值越大能力越强、工具越多）
const TIER_RANK = { flash: 0, vision: 1, pro: 2 };

// ============================================================
// 合并工具分类注册表
// 每个合并工具维护一个子工具映射：subAction -> 中文标签
// tier：该工具最低可用档位（0 基础 / 1 视觉 / 2 Pro 旗舰）
// ============================================================
const MERGE_GROUPS = {
  // 1. 超级思考（独立保留，不合并；三档都在目录中，非 legacy 极简外露下由门控决定是否上线）
  super_think: {
    tier: 0,
    label: '超级思考',
    subActions: {}, // super_think 独立，不走 sub_action 路由
  },

  // 2. 深度分析与理解（基础档）
  ultra_analyze: {
    tier: 0,
    label: '深度分析',
    subActions: {
      deep_deduce: '多路独立推演',
      claim_verify: '断言逐条核验',
      hypothesis_board: '假设证据黑板',
      anchor: '锚点定界',
      trace_ledger: '推理轨迹台账',
      parse_intent: '意图解析',
      assumption_extract: '前提假设提取',
      term_define: '术语定义',
      problem_route: '问题路由分类',
      step_plan: '分步执行计划',
      progressive_summary: '渐进式总结',
      context_compress: '上下文压缩',
    },
  },

  // 3. 核验证伪与审计（基础档）
  ultra_verify: {
    tier: 0,
    label: '核验证伪',
    subActions: {
      counter_search: '反例搜索',
      self_review: '自我审查',
      strawman_check: '稻草人检查',
      redteam_question: '红队质疑',
      acceptance_gate: '验收门禁',
      evidence_bind: '证据绑定',
      counterfactual_fork: '反事实分叉',
      bestof_compete: '多候选竞争',
      edge_case: '边界用例扫描',
      numeric_recheck: '数值复核',
      quality_checklist: '质量清单',
      pitfall_scan: '陷阱扫描',
      falsify_experiment: '证伪实验',
      sensitivity: '敏感性分析',
      causal_chain: '因果链追踪',
      find_logical_flaw: '逻辑漏洞发现',
      debate_attack: '辩论攻击',
      defend_against: '防御反驳',
      compare_options: '方案对比',
      risk_register: '风险登记',
    },
  },

  // 4. 代码理解与优化（基础档）
  ultra_code: {
    tier: 0,
    label: '代码大师',
    subActions: {
      structure_analyzer: '代码结构分析',
      review_expert: '代码审查专家',
      swarm_code_review: '蜂群代码审查',
      fast_code_scan: '快速代码扫描',
      code_understand: '代码理解',
      code_refactor: '代码重构',
      code_test: '代码测试生成',
      code_optimize: '代码性能优化',
      code_architecture: '架构分析',
      code_dependency: '依赖分析',
    },
  },

  // 5. 多模态视觉精读（视觉档：vision / pro；名字含 vision，门控仅在看图时外露）
  ultra_vision: {
    tier: 1,
    label: '多模态精读',
    subActions: {
      vision_grid: '视觉网格切分',
      vision_crosscheck: '视觉交叉核验',
      vision_occlusion: '遮挡推理',
      vision_rescale: '多尺度重看',
      vision_readdiff: '视觉差异读取',
      vision_ocr: '视觉 OCR',
      vision_layout: '版面分析',
      vision_zoom: '视觉放大',
      swarm_vision_deep: '蜂群深度视觉',
      multiscale_grid_read: '多尺度网格阅读',
      fast_vision_read: '快速视觉阅读',
      vscan: '视觉扫描',
      vgraph: '视觉图谱',
      vzoom: '视觉变焦',
      vtrack: '视觉追踪',
      vspatial: '空间推理',
      vcounterfactual: '视觉反事实',
    },
  },

  // 6. 执行规划与交付（基础档）
  ultra_execute: {
    tier: 0,
    label: '执行交付',
    subActions: {
      synthesis_merge: '综合合并',
      analogy_bridge: '类比桥接',
      phase_mark: '阶段标记',
      strategy_profile: '策略画像',
      refactor_relaunch: '重构重启',
      project_plan: '项目规划',
      task_manage: '任务管理',
      deliverable_check: '交付物检查',
      progress_track: '进度追踪',
      resource_alloc: '资源分配',
      quality_gate: '质量门禁',
      doc_summarize: '文档摘要',
      doc_extract: '文档提取',
      doc_translate: '文档翻译',
      doc_structure: '文档结构化',
      doc_cite: '文档引用',
      doc_index: '文档索引',
    },
  },

  // 7. 元认知（基础档：角色透镜 + 快速一致性）
  ultra_meta: {
    tier: 0,
    label: '元认知',
    subActions: {
      persona_lens: '角色视角透镜',
      fast_consistency_check: '快速一致性检查',
    },
  },

  // 8. 综合决策与数据处理（基础档）
  ultra_synthesize: {
    tier: 0,
    label: '综合决策',
    subActions: {
      data_analyze: '深度数据分析',
      data_clean: '数据清洗',
      data_visualize: '数据可视化',
      data_correlate: '数据关联',
      data_forecast: '数据预测',
      data_anomaly: '异常检测',
      learning_plan: '学习规划',
      concept_map: '概念图谱',
      creative_brainstorm: '创意头脑风暴',
      creative_combine: '创意组合',
      creative_evaluate: '创意评估',
      creative_refine: '创意打磨',
      converge_select: '收敛择优',
      decision_weigh: '决策权衡',
      tradeoff_analysis: '权衡分析',
      scenario_plan: '情景规划',
      fallback_design: '兜底方案设计',
      final_synthesis: '最终综合',
    },
  },

  // 9. Pro 旗舰高阶推理（仅 pro 档；vision/flash 目录中不存在，构成严格 pro-only 增量）
  ultra_pro: {
    tier: 2,
    label: 'Pro旗舰深推',
    subActions: {
      first_principles: '第一性原理拆解',
      formalize: '形式化建模',
      decompose_dag: 'DAG 任务拆解',
      proof_obligations: '证明义务',
      invariant_audit: '不变量审计',
      reflection_chain: '反思链',
      decision_matrix: '决策矩阵',
      meta_tournament: '元认知锦标赛',
      global_constraints: '全局约束',
      adversarial_redteam: '对抗红队',
      bayes_calib: '贝叶斯校准',
      self_distill: '自我蒸馏',
      proof_chain: '证明链',
      axiom_unwind: '公理回溯',
      modal_worlds: '模态可能世界',
      recursion_fixpoint: '递归不动点',
      strange_loop: '自指怪圈',
      ontic_collapse: '本体坍缩',
      observer_relativity: '观察者相对化',
      extreme_deep_reasoning: '极限深度推理',
      counterfactual_analyzer: '反事实分析',
      elite_swarm_validation: '精锐蜂群验证',
      deep_architecture_analysis: '深度架构分析',
      deep_reasoning_chain: '深度推理链',
      dependency_impact: '依赖影响分析',
    },
  },
};

// 原子工具实际名 -> 合并组 subAction 的别名表（修复历史命名不一致，避免工具在合并层丢失）。
// 只收录无法用统一前缀规则匹配的工具；每条都唯一归属一个 subAction。
const ATOMIC_ALIASES = {
  // 数据分析
  data_deep_analyzer: 'data_analyze',
  data_cleaner: 'data_clean',
  trend_predictor: 'data_forecast',
  statistical_analyzer: 'data_correlate',
  insight_extractor: 'data_correlate',
  ab_test_analyzer: 'data_anomaly',
  // 学习创意
  learning_path_planner: 'learning_plan',
  concept_explainer: 'concept_map',
  exercise_generator: 'creative_evaluate',
  brainstorm_engine: 'creative_brainstorm',
  story_generator: 'creative_combine',
  translation_localizer: 'creative_refine',
  // 文档
  doc_deep_summarizer: 'doc_summarize',
  info_extractor: 'doc_extract',
  comparison_analyzer: 'doc_cite',
  writing_assistant: 'doc_translate',
  knowledge_qa_engine: 'doc_index',
  mindmap_generator: 'doc_structure',
  // 生产力
  project_planner: 'project_plan',
  task_manager: 'task_manage',
  time_tracker: 'progress_track',
  decision_maker: 'converge_select',
  meeting_organizer: 'task_manage',
  okr_manager: 'resource_alloc',
  // 代码
  code_structure_analyzer: 'structure_analyzer',
  code_review_expert: 'review_expert',
  algorithm_analyzer: 'code_understand',
  architecture_advisor: 'code_architecture',
  debug_diagnostic: 'code_refactor',
  performance_optimizer: 'code_optimize',
};

// ============================================================
// 合并工具工厂
// ============================================================

/**
 * 创建一个合并工具定义
 * @param {string} mergeName - 合并工具名
 * @param {object} groupConfig - 分组配置
 * @param {object} deps - 依赖注入
 * @param {Map} subToolRegistry - 子工具注册表（subAction -> 完整工具定义）
 */
function createMergedTool(mergeName, groupConfig, deps, subToolRegistry) {
  const subActions = Object.keys(groupConfig.subActions);
  const subLabels = groupConfig.subActions;

  // 构建描述：列出所有支持的 sub_action
  const descParts = [
    `【${groupConfig.label}】统一入口。通过 sub_action 参数选择具体能力，支持：`,
    subActions.map((sa) => `${sa}(${subLabels[sa] || sa})`).join('、'),
    '。调用时必须指定 sub_action，其余参数按所选能力透传。',
  ];

  return defineTool({
    name: mergeName,
    description: descParts.join(''),
    timeoutMs: 60000,
    parameters: {
      sub_action: {
        type: 'string',
        required: true,
        description: '选择具体能力，可选：' + subActions.join(' / '),
      },
      input: {
        type: 'string',
        description: '所选能力的输入内容/任务描述，按 sub_action 对应工具的需求传入',
      },
      options: {
        type: 'string',
        description: '额外选项，JSON 字符串格式，按所选能力的 parameters 传入',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sub_action: { type: 'string', description: '执行的子动作名称' },
          ok: { type: 'boolean', description: '是否执行成功' },
          result: { type: 'string', description: '执行结果摘要' },
          detail: { type: 'string', description: '执行结果详情（JSON字符串）' },
          error: { type: 'string', description: '错误信息（失败时）' },
        },
      },
      render: (_a, v) => {
        if (v && v.result) {
          return [{ type: 'text', text: `【${groupConfig.label}·${v.sub_action}】${String(v.result).slice(0, 800)}` }];
        }
        return [{ type: 'text', text: `【${groupConfig.label}·${v.sub_action}】执行完成${v.error ? '，错误：' + v.error : ''}` }];
      },
    },
    async execute(args, exec) {
      const subAction = args && args.sub_action;
      if (!subAction || !subToolRegistry.has(subAction)) {
        return {
          sub_action: subAction || 'unknown',
          ok: false,
          result: '',
          detail: '',
          error: `未知的 sub_action: ${subAction}，可选: ${subActions.join(', ')}`,
        };
      }
      const subTool = subToolRegistry.get(subAction);
      // 构建子工具参数：优先用 options JSON，其次用 input 作为主要文本参数
      let subArgs = {};
      try {
        if (args && args.options) {
          const parsed = JSON.parse(args.options);
          if (parsed && typeof parsed === 'object') subArgs = { ...parsed };
        }
      } catch (e) { /* options 解析失败，忽略 */ }
      // 如果子工具需要文本输入且 subArgs 中没有，用 input 字段填充
      if (args && args.input && !subArgs.input && !subArgs.text && !subArgs.question && !subArgs.topic && !subArgs.goal) {
        subArgs.input = args.input;
      }
      // 兜底：如果子工具参数为空，把整个 args 传过去
      if (Object.keys(subArgs).length === 0) {
        subArgs = { ...args };
        delete subArgs.sub_action;
      }
      try {
        const result = await subTool.execute(subArgs, exec);
        // 将 result 对象序列化为字符串，避免 output schema 中的 object 类型导致验证失败
        let resultStr = '';
        let detailStr = '';
        try {
          if (result && typeof result === 'object') {
            detailStr = JSON.stringify(result);
            // 尝试提取摘要
            resultStr = result.summary || result.synthesis || result.text || result.result || Object.keys(result).slice(0, 5).join(', ');
            if (!resultStr) resultStr = detailStr.slice(0, 500);
          } else {
            resultStr = String(result || '');
            detailStr = resultStr;
          }
        } catch (e) {
          resultStr = String(result || '');
          detailStr = resultStr;
        }
        return { sub_action: subAction, ok: true, result: resultStr, detail: detailStr, error: null };
      } catch (e) {
        return { sub_action: subAction, ok: false, result: '', detail: '', error: String(e && e.message || e) };
      }
    },
    presentCall: (args) => {
      const sa = args && args.sub_action || 'unknown';
      const label = subLabels[sa] || sa;
      const rawInput = args && args.input ? String(args.input).slice(0, 200) : (args && args.options ? String(args.options).slice(0, 200) : '');
      return { card: 'generic', title: `${groupConfig.label} · ${label}`, kind: 'execute', rawInput };
    },
  });
}

// 候选原子名（按统一前缀规则）
function candidatesFor(subAction) {
  return [
    `ultra_${subAction}`,
    subAction,
    `code_${subAction}`,
    `data_${subAction}`,
    `doc_${subAction}`,
    `flash_${subAction}`,
    `pro_${subAction}`,
    `vision_${subAction}`,
    `ultra_vision_${subAction}`,
    `ultra_code_${subAction}`,
  ];
}

/**
 * 从原子工具列表构建按模型档分层的合并工具
 * @param {Array} atomicTools - 所有原子工具定义数组
 * @param {object} deps - 依赖注入
 * @param {string} modelTier - 'flash' | 'vision' | 'pro'（也兼容全名，缺省 flash）
 * @returns {Array} 合并工具（数量严格随档位递增：flash 7 / vision 8 / pro 9）
 */
function buildMergedTools(atomicTools, deps, modelTier) {
  const tier = Object.prototype.hasOwnProperty.call(TIER_RANK, modelTier) ? TIER_RANK[modelTier] : 0;

  // 建立原子工具名 -> 定义的映射
  const atomicMap = new Map();
  (atomicTools || []).forEach((t) => {
    if (t && t.name) atomicMap.set(t.name, t);
  });

  // 子动作 -> 所属组合并工具的索引
  const subToGroup = {};
  for (const [group, cfg] of Object.entries(MERGE_GROUPS)) {
    if (group === 'super_think') continue;
    for (const sa of Object.keys(cfg.subActions)) subToGroup[sa] = group;
  }

  const mergedTools = [];
  // 按注册顺序（tier 已在对象顺序中天然升序）遍历，过滤掉高于当前档位的组合
  for (const [mergeName, groupConfig] of Object.entries(MERGE_GROUPS)) {
    if ((groupConfig.tier || 0) > tier) continue;

    if (mergeName === 'super_think') {
      // super_think 独立保留
      const st = atomicMap.get('super_think');
      if (st) mergedTools.push(st);
      continue;
    }

    const subToolRegistry = new Map();
    const claim = (atomicName, sa) => {
      if (subToolRegistry.has(sa)) return;
      const t = atomicMap.get(atomicName);
      if (t) subToolRegistry.set(sa, t);
    };

    for (const sa of Object.keys(groupConfig.subActions)) {
      // 1) 统一前缀候选
      for (const cand of candidatesFor(sa)) claim(cand, sa);
      // 2) 历史命名别名
      if (!subToolRegistry.has(sa)) {
        for (const [atomicName, mappedSa] of Object.entries(ATOMIC_ALIASES)) {
          if (mappedSa === sa) claim(atomicName, sa);
        }
      }
    }

    // 至少有一个子工具时才创建合并工具（档位内确定性产出）
    if (subToolRegistry.size > 0) {
      mergedTools.push(createMergedTool(mergeName, groupConfig, deps, subToolRegistry));
    }
  }

  return mergedTools;
}

// ES 模块导出
export { MERGE_GROUPS, ATOMIC_ALIASES, TIER_RANK, buildMergedTools, createMergedTool };
