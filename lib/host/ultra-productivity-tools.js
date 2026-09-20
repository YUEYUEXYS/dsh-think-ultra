// ultra-productivity-tools.js — Think 项目管理与生产力工具箱
// 专门增强 Deepseek 的项目管理、任务规划、时间管理、决策辅助能力

import { defineTool } from './ultra-tool-adapter.js';
import { sampleOnce } from './tournament-engine.js';

function extractJson(raw) {
  if (!raw) return null;
  const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = String(body).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }

async function maxJson(llm, opts) {
  if (!llm || typeof llm.stream !== 'function') return { ok: false, reason: 'no-llm' };
  try {
    const r = await sampleOnce(llm, {
      provider: opts.provider,
      model: opts.model,
      system: opts.system || '你只输出严格 JSON，不要输出多余文字。',
      prompt: opts.prompt,
      temperature: opts.temperature ?? 0.3,
      maxTokens: opts.maxTokens ?? 4000,
      signal: opts.signal,
    });
    if (!r || r.ok === false || !r.text) return { ok: false, reason: 'sample-failed' };
    const j = extractJson(r.text);
    if (j == null) return { ok: false, reason: 'not-json', text: r.text };
    return { ok: true, json: j, text: r.text };
  } catch (e) {
    return { ok: false, reason: 'throw:' + (e && e.message ? e.message : String(e)) };
  }
}

function routeOf(exec, deps) {
  const header = (exec && exec.agent && exec.agent.session && exec.agent.session.header) || {};
  return {
    provider: header.provider || deps.provider || '',
    model: header.model || deps.model || '',
    signal: exec && exec.signal,
  };
}

// ========== 工具1：项目规划器 ==========
export function createProjectPlannerTool(deps) {
  return defineTool({
    name: 'project_planner',
    description: '项目规划工具，根据项目目标、范围、资源、时间约束，生成完整的项目计划，包括工作分解结构(WBS)、里程碑、甘特图、资源分配、风险管理、沟通计划等。',
    schema: {
      projectGoal: { type: 'string', description: '项目目标/描述' },
      scope: { type: 'string', description: '项目范围（包含什么、不包含什么）', default: '' },
      timeline: { type: 'string', description: '时间约束（如：3个月、6个月、截止日期等）', default: '' },
      budget: { type: 'string', description: '预算约束（可选）', default: '' },
      teamSize: { type: 'number', description: '团队规模', default: 5 },
      methodology: { type: 'string', description: '项目管理方法：agile/waterfall/hybrid/kanban/scrum', default: 'agile' },
      complexity: { type: 'string', description: '项目复杂度：low/medium/high/extreme', default: 'medium' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级项目管理专家(PMP/PRINCE2认证)。请为以下项目生成完整的项目计划。',
        '项目目标：' + args.projectGoal,
        args.scope ? '项目范围：' + args.scope : '',
        args.timeline ? '时间约束：' + args.timeline : '',
        args.budget ? '预算约束：' + args.budget : '',
        '团队规模：' + args.teamSize + '人',
        '项目管理方法：' + args.methodology,
        '项目复杂度：' + args.complexity,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. projectOverview: 项目概述（项目目标、范围、关键成功因素、项目章程要点）',
        '2. objectives: 项目目标（SMART目标：具体、可衡量、可达成、相关、有时限，至少5个目标）',
        '3. scopeStatement: 范围说明书（包含的工作、不包含的工作、交付物清单、验收标准）',
        '4. wbs: 工作分解结构（层级化的工作分解，至少3层，每个工作包包含：编号、名称、描述、负责人、预估工时、依赖关系）',
        '5. milestones: 里程碑（关键里程碑列表，每个里程碑包含：名称、日期、交付物、负责人、验收标准、重要性）',
        '6. ganttChart: 甘特图数据（任务列表、开始日期、结束日期、持续时间、依赖关系、进度百分比、负责人，可用于可视化）',
        '7. schedule: 进度计划（详细的时间安排、关键路径、浮动时间、缓冲时间、进度监控点）',
        '8. resourcePlan: 资源计划（人力资源分配、角色职责矩阵RACI、技能需求、资源负载、资源冲突解决）',
        '9. budgetPlan: 预算计划（如果有预算：成本估算、预算分配、现金流、成本控制阈值、应急储备）',
        '10. riskManagement: 风险管理（风险识别清单、风险评估矩阵、风险应对策略、风险责任人、风险监控计划、应急预案）',
        '11. qualityPlan: 质量管理（质量标准、质量保证活动、质量控制检查点、测试计划、验收流程、持续改进）',
        '12. communicationPlan: 沟通管理（干系人分析、沟通矩阵、会议计划、报告机制、升级流程、文档管理）',
        '13. stakeholderManagement: 干系人管理（干系人清单、权力/利益矩阵、管理策略、参与计划、期望管理）',
        '14. changeManagement: 变更管理（变更控制流程、变更影响评估、版本管理、基线管理、变更审批机制）',
        '15. procurementPlan: 采购计划（如果需要：采购清单、供应商选择标准、合同类型、采购时间表、风险管理）',
        '16. integrationPlan: 整合管理（项目整合策略、接口管理、依赖管理、协调机制、整体变更控制）',
        '17. successMetrics: 成功指标（项目成功的衡量指标、KPI、目标值、测量方法、报告频率）',
        '18. lessonsLearnedTemplate: 经验教训模板（项目过程中需要记录的经验教训、复盘会议计划、知识管理）',
        '19. criticalPath: 关键路径分析（关键路径任务、总工期、关键路径上的风险、压缩工期的选项）',
        '20. assumptionsConstraints: 假设与约束（项目假设条件、约束条件、依赖关系、外部因素）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 8000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, projectPlan: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具2：任务分解与优先级管理器 ==========
export function createTaskManagerTool(deps) {
  return defineTool({
    name: 'task_manager',
    description: '任务分解与优先级管理工具，将大目标分解为可执行的任务，进行优先级排序、依赖分析、时间估算、进度跟踪。支持艾森豪威尔矩阵、MoSCoW方法、Kano模型等多种优先级框架。',
    schema: {
      goal: { type: 'string', description: '目标或项目描述' },
      tasks: { type: 'string', description: '已有任务列表（可选，用换行或逗号分隔）', default: '' },
      priorityMethod: { type: 'string', description: '优先级方法：eisenhower/moscow/kano/wsjf/impact_effort/auto', default: 'auto' },
      timeAvailable: { type: 'string', description: '可用时间（如：今天、本周、本月）', default: '本周' },
      numTasks: { type: 'number', description: '要生成/管理的任务数量（5-50）', default: 20 },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级生产力专家和任务管理顾问。请为以下目标进行任务分解和优先级管理。',
        '目标：' + args.goal,
        args.tasks ? '已有任务：' + args.tasks : '',
        '优先级方法：' + args.priorityMethod,
        '可用时间：' + args.timeAvailable,
        '任务数量：约' + args.numTasks + '个',
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. goalAnalysis: 目标分析（目标拆解、成功标准、关键结果、约束条件）',
        '2. taskBreakdown: 任务分解（层级化的任务分解，大任务→子任务→具体行动项，每个任务包含：编号、任务名称、描述、所属类别、预估时间、难度、依赖任务、负责人）',
        '3. priorityMatrix: 优先级矩阵（使用指定的优先级方法对所有任务进行优先级排序，每个任务的优先级评分、优先级等级、排序理由）',
        '4. eisenhowerMatrix: 艾森豪威尔矩阵（如果适用：重要紧急/重要不紧急/紧急不重要/不重要不紧急，每个象限的任务列表和处理策略）',
        '5. moscowPrioritization: MoSCoW优先级（Must have/Should have/Could have/Won\'t have，每个级别的任务列表和理由）',
        '6. dependencyGraph: 依赖关系图（任务间的依赖关系、关键路径、阻塞任务、并行任务、依赖可视化数据）',
        '7. schedule: 日程安排（根据优先级和依赖关系，将任务安排到具体的时间段，每天的任务清单、时间块、缓冲时间）',
        '8. dailyPlan: 每日计划（今天/明天的具体任务安排、优先级排序、时间估算、番茄钟建议、专注时段）',
        '9. weeklyPlan: 每周计划（本周的任务安排、里程碑、重点任务、回顾时间、调整机制）',
        '10. progressTracking: 进度跟踪（任务状态：未开始/进行中/已完成/已阻塞，完成百分比、预计完成时间、进度偏差分析）',
        '11. timeEstimation: 时间估算（每个任务的乐观/最可能/悲观时间估算、PERT估算、总时间估算、缓冲时间建议）',
        '12. effortAssessment: 工作量评估（每个任务的认知负荷、体力消耗、创意需求、难度评分、精力管理建议）',
        '13. batchingStrategy: 批处理策略（相似任务的批处理建议、上下文切换最小化、深度工作块安排、浅工作集中处理）',
        '14. delegationPlan: 授权计划（可以授权/委托的任务、授权对象、授权理由、授权后的监控方式、授权风险）',
        '15. eliminationList: 消除清单（可以消除/简化/自动化的任务、消除理由、节省的时间、简化建议）',
        '16. riskTasks: 高风险任务（可能延期/失败的高风险任务、风险原因、缓解措施、应急预案、备选方案）',
        '17. motivationTips: 动力保持（如何保持动力、克服拖延、建立习惯、奖励机制、进度可视化、庆祝里程碑）',
        '18. reviewChecklist: 回顾清单（每日/每周回顾的检查清单、需要问自己的问题、改进点、经验教训记录模板）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, taskManagement: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具3：时间追踪与分析器 ==========
export function createTimeTrackerTool(deps) {
  return defineTool({
    name: 'time_tracker',
    description: '时间追踪与分析工具，分析时间使用情况，识别时间浪费，优化时间分配，提高时间利用效率。支持时间日志分析、时间审计、时间块规划、深度工作分析等。',
    schema: {
      timeLog: { type: 'string', description: '时间日志数据（活动、开始时间、结束时间、持续时间等）' },
      analysisPeriod: { type: 'string', description: '分析周期：daily/weekly/monthly/custom', default: 'weekly' },
      goals: { type: 'string', description: '时间管理目标（可选）', default: '' },
      workHours: { type: 'number', description: '每日工作小时数', default: 8 },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级时间管理专家。请分析以下时间使用数据，提供时间优化建议。',
        '分析周期：' + args.analysisPeriod,
        args.goals ? '时间管理目标：' + args.goals : '',
        '每日工作小时数：' + args.workHours,
        '',
        '【时间日志】',
        clip(args.timeLog, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. timeOverview: 时间概览（总时间、工作时间、休息时间、有效工作时间、时间利用率、与目标的对比）',
        '2. categoryBreakdown: 分类统计（按活动类别统计时间分布、每个类别的时间占比、趋势、与理想分配的对比）',
        '3. deepWorkAnalysis: 深度工作分析（深度工作时间、浅工作时间、深度工作占比、深度工作时段、中断次数、中断来源、深度工作质量评估）',
        '4. timeWaste: 时间浪费识别（浪费时间的活动、浪费的总时间、占比、根本原因、可节省的时间、消除建议）',
        '5. productivityPatterns: 生产力模式（高效时段、低效时段、精力曲线、最佳工作类型匹配、生物钟分析、黄金时间识别）',
        '6. taskEfficiency: 任务效率分析（每个任务的预估时间vs实际时间、时间偏差、效率评分、拖延情况、任务切换次数、上下文切换成本）',
        '7. meetingAnalysis: 会议分析（会议总时间、会议数量、平均会议时长、有效会议vs无效会议、会议时间占比、会议优化建议）',
        '8. communicationTime: 沟通时间（邮件、即时通讯、电话等沟通时间、沟通效率、不必要的沟通、沟通优化建议）',
        '9. breakAnalysis: 休息分析（休息时间、休息频率、休息质量、休息方式、休息对生产力的影响、休息优化建议）',
        '10. timeAudit: 时间审计（详细的时间审计报告、每小时的活动记录、时间使用评分、时间管理成熟度评估）',
        '11. optimizationPlan: 优化计划（具体的时间优化建议、每个建议的预期节省时间、实施难度、优先级、行动计划）',
        '12. timeBlocking: 时间块规划（基于分析结果的时间块规划建议、深度工作块、浅工作块、休息块、缓冲块、理想日程模板）',
        '13. habitRecommendations: 习惯建议（需要建立的时间管理习惯、习惯养成计划、习惯追踪建议、常见陷阱及避免方法）',
        '14. toolsRecommendations: 工具推荐（推荐的时间管理工具、应用、方法、书籍、资源，以及如何选择和使用）',
        '15. kpiDashboard: KPI仪表盘（时间管理的关键指标、目标值、当前值、趋势、评分、需要改进的指标）',
        '16. weeklyReview: 每周回顾（基于时间数据的每周回顾模板、需要问的问题、改进点、下周计划调整建议）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, timeAnalysis: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具4：决策辅助器 ==========
export function createDecisionMakerTool(deps) {
  return defineTool({
    name: 'decision_maker',
    description: '决策辅助工具，帮助做出复杂、重要的决策。支持多准则决策分析、决策矩阵、成本效益分析、风险评估、情景分析、决策树等方法。输出结构化的决策建议和分析过程。',
    schema: {
      decision: { type: 'string', description: '需要决策的问题或情境' },
      options: { type: 'string', description: '可选方案（用 ||| 分隔多个方案）', default: '' },
      criteria: { type: 'string', description: '决策标准（用逗号分隔，可选）', default: '' },
      constraints: { type: 'string', description: '约束条件（可选）', default: '' },
      decisionType: { type: 'string', description: '决策类型：strategic/tactical/operational/risky/uncertain/certain', default: 'risky' },
      stakes: { type: 'string', description: '决策重要性：low/medium/high/critical', default: 'high' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const options = args.options ? args.options.split('|||').map(s => s.trim()).filter(Boolean) : [];
      const prompt = [
        '你是世界级决策科学家和战略顾问。请帮助分析以下决策问题。',
        '决策问题：' + args.decision,
        options.length > 0 ? '可选方案：' + options.join('; ') : '（请生成可能的可选方案）',
        args.criteria ? '决策标准：' + args.criteria : '',
        args.constraints ? '约束条件：' + args.constraints : '',
        '决策类型：' + args.decisionType,
        '决策重要性：' + args.stakes,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. problemFraming: 问题界定（决策问题的清晰界定、决策类型、决策范围、决策时间窗口、关键利益相关者）',
        '2. objectives: 决策目标（决策要达成的目标、必须满足的条件、希望达成的条件、目标的优先级和权重）',
        '3. options: 可选方案（所有可能的方案、每个方案的详细描述、方案的变体、方案的创新点、方案的假设）',
        '4. criteria: 决策标准（评估方案的标准、每个标准的定义、衡量方法、权重分配、权重分配的理由）',
        '5. decisionMatrix: 决策矩阵（方案×标准的评分矩阵、每个方案在每个标准上的得分、加权总分、排名、评分理由）',
        '6. costBenefitAnalysis: 成本效益分析（每个方案的成本、效益、净现值、投资回报率、回收期、成本效益比、敏感性分析）',
        '7. riskAnalysis: 风险分析（每个方案的风险识别、风险评估矩阵、风险概率、风险影响、风险敞口、风险应对策略、风险缓释措施）',
        '8. scenarioAnalysis: 情景分析（乐观情景、基准情景、悲观情景、每个情景下各方案的表现、情景概率、鲁棒性分析）',
        '9. decisionTree: 决策树（决策节点、机会节点、结果节点、概率、期望值、最优路径、决策树可视化数据）',
        '10. swotAnalysis: SWOT分析（每个方案的优势、劣势、机会、威胁、SWOT矩阵、战略组合建议）',
        '11. prosCons: 优缺点分析（每个方案的详细优缺点、优点的重要性、缺点的严重性、优缺点的平衡分析）',
        '12. opportunityCost: 机会成本分析（选择每个方案的机会成本、放弃的次优方案的价值、机会成本对决策的影响）',
        '13. sunkCost: 沉没成本分析（已投入的沉没成本、沉没成本对决策的影响、如何避免沉没成本谬误、理性决策建议）',
        '14. cognitiveBiases: 认知偏差检查（可能影响决策的认知偏差、偏差识别、偏差对决策的影响、去偏策略、第二意见建议）',
        '15. recommendation: 决策建议（推荐方案、推荐理由、推荐的置信度、推荐方案的关键成功因素、实施建议、监控指标）',
        '16. implementationPlan: 实施计划（推荐方案的实施步骤、时间表、资源需求、里程碑、关键成功因素、潜在障碍及应对）',
        '17. contingencyPlan: 应急预案（如果推荐方案失败的备选方案、触发条件、应急预案的详细步骤、沟通计划）',
        '18. reviewPoints: 回顾检查点（决策后的回顾时间点、需要监控的指标、调整决策的触发条件、决策复盘模板）',
        '19. ethicalConsiderations: 伦理考量（决策的伦理影响、利益相关者的权益、公平性、透明度、社会责任、长期影响）',
        '20. decisionQuality: 决策质量评估（决策过程的质量评分、信息充分性、分析深度、逻辑严谨性、创造性、整体决策质量评级）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 8000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, decisionAnalysis: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具5：会议组织者与纪要生成器 ==========
export function createMeetingOrganizerTool(deps) {
  return defineTool({
    name: 'meeting_organizer',
    description: '会议组织与纪要生成工具，帮助高效组织会议，生成会议议程、会议纪要、行动项、决策记录。支持会议前准备、会议中记录、会议后跟进的全流程管理。',
    schema: {
      meetingType: { type: 'string', description: '会议类型：standup/weekly/monthly/project/review/brainstorm/decision/oneonone/client/other', default: 'weekly' },
      topic: { type: 'string', description: '会议主题/目的' },
      participants: { type: 'string', description: '参会人员（逗号分隔）', default: '' },
      duration: { type: 'number', description: '会议时长（分钟）', default: 60 },
      rawNotes: { type: 'string', description: '会议原始记录/笔记（用于生成纪要）', default: '' },
      action: { type: 'string', description: '操作类型：agenda/minutes/both/followup', default: 'both' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级会议管理专家。请帮助组织以下会议并生成相关文档。',
        '会议类型：' + args.meetingType,
        '会议主题：' + args.topic,
        args.participants ? '参会人员：' + args.participants : '',
        '会议时长：' + args.duration + '分钟',
        '操作类型：' + args.action,
        args.rawNotes ? '会议原始记录：' + clip(args.rawNotes, 10000) : '',
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. meetingOverview: 会议概述（会议目的、会议目标、成功标准、会议类型特点、最佳实践）',
        '2. agenda: 会议议程（详细的议程安排、每个议程项的时间分配、负责人、目标、讨论要点、预期产出、议程顺序的逻辑）',
        '3. preMeetingPreparation: 会前准备（参会者需要提前准备的内容、需要阅读的材料、需要思考的问题、会前检查清单）',
        '4. meetingRules: 会议规则（会议守则、发言规则、决策规则、时间管理规则、手机/设备使用规则、会议文化建议）',
        '5. facilitationGuide: 引导指南（主持人引导技巧、如何保持会议聚焦、如何处理偏离、如何鼓励参与、如何管理冲突、如何达成共识）',
        '6. minutes: 会议纪要（如果有原始记录：结构化的会议纪要、会议基本信息、讨论要点、关键观点、不同意见、共识、会议氛围评估）',
        '7. decisions: 决策记录（会议中做出的决策、决策内容、决策理由、决策过程、反对意见、决策影响、决策责任人、决策生效时间）',
        '8. actionItems: 行动项（详细的行动项清单、每个行动项包含：编号、任务描述、负责人、截止日期、优先级、依赖关系、验收标准、状态、跟进方式）',
        '9. discussionSummary: 讨论摘要（每个议题的讨论摘要、主要观点、支持论据、反对论据、未解决的问题、需要进一步研究的事项）',
        '10. openQuestions: 待解决问题（会议中未解决的问题、问题描述、为什么未解决、需要谁来解决、解决时限、下次会议跟进）',
        '11. risksIssues: 风险与问题（会议中识别的风险、问题、障碍、风险等级、影响、应对措施、责任人、跟进计划）',
        '12. nextMeeting: 下次会议（下次会议的时间建议、议题建议、需要准备的内容、参会人员建议、会议目标）',
        '13. followUpPlan: 跟进计划（会议后的跟进计划、跟进时间表、跟进方式、跟进责任人、进度汇报机制、未完成行动项的处理）',
        '14. communication: 沟通计划（会议纪要的分发、分发对象、分发方式、分发时间、需要特别沟通的事项、沟通话术建议）',
        '15. effectiveness: 会议效果评估（会议效果评分、目标达成度、时间利用效率、参与度、决策质量、改进建议、下次会议的改进点）',
        '16. templates: 模板（会议议程模板、会议纪要模板、行动项跟踪模板、会议回顾模板，可复用的标准化模板）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, meeting: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具6：目标设定与OKR管理器 ==========
export function createOKRManagerTool(deps) {
  return defineTool({
    name: 'okr_manager',
    description: '目标设定与OKR管理工具，帮助设定高质量的目标和关键结果，进行目标对齐、进度跟踪、复盘评估。支持OKR、SMART、MBO等多种目标管理框架。',
    schema: {
      goalArea: { type: 'string', description: '目标领域（如：个人成长、职业发展、项目、团队、公司等）' },
      timeframe: { type: 'string', description: '时间周期：weekly/monthly/quarterly/yearly/custom', default: 'quarterly' },
      currentSituation: { type: 'string', description: '当前状况/背景（可选）', default: '' },
      aspirations: { type: 'string', description: '期望/愿景（可选）', default: '' },
      numObjectives: { type: 'number', description: '目标数量（3-7）', default: 5 },
      framework: { type: 'string', description: '目标管理框架：okr/smart/mbo/4dx/balanced_scorecard', default: 'okr' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级目标管理专家和OKR教练。请帮助设定以下领域的目标。',
        '目标领域：' + args.goalArea,
        '时间周期：' + args.timeframe,
        args.currentSituation ? '当前状况：' + args.currentSituation : '',
        args.aspirations ? '期望/愿景：' + args.aspirations : '',
        '目标数量：约' + args.numObjectives + '个',
        '目标管理框架：' + args.framework,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. visionMission: 愿景使命（这个领域的长期愿景、使命、核心价值观、北极星指标、存在的意义）',
        '2. situationalAnalysis: 现状分析（当前状况分析、优势、劣势、机会、威胁、关键挑战、资源评估、能力差距）',
        '3. strategicThemes: 战略主题（本周期的战略重点、主题领域、为什么选择这些主题、主题间的关系、主题的优先级）',
        '4. objectives: 目标（高质量的目标列表，每个目标包含：编号、目标描述、目标类型、激励性、挑战性、可行性、对齐关系、负责人、目标的why）',
        '5. keyResults: 关键结果（每个目标对应的关键结果，每个KR包含：编号、描述、衡量指标、基线值、目标值、权重、测量方法、数据来源、评分标准、负责人）',
        '6. initiatives: 行动计划（为达成每个KR需要采取的具体行动、行动项列表、优先级、时间表、资源需求、里程碑、依赖关系）',
        '7. alignment: 目标对齐（目标与上级目标的对齐、与团队目标的对齐、与个人目标的对齐、对齐矩阵、对齐说明、潜在冲突）',
        '8. scoringRubric: 评分标准（OKR评分标准、0.0-1.0分的定义、每个分数对应的完成度、评分频率、评分流程、评分者）',
        '9. progressTracking: 进度跟踪（进度跟踪计划、跟踪频率、跟踪方法、进度指标、预警机制、进度可视化、红黄绿状态定义）',
        '10. checkinPlan: 检查计划（定期检查计划、检查频率、检查议程、检查参与者、检查模板、检查问题清单、调整机制）',
        '11. reviewTemplate: 复盘模板（周期末复盘模板、需要回答的问题、成功经验、失败教训、改进点、下周期调整建议、庆祝时刻）',
        '12. riskAssessment: 风险评估（目标达成的风险识别、风险评估、风险应对策略、风险责任人、风险监控指标、应急预案）',
        '13. resourcePlan: 资源计划（达成目标所需的资源、人力资源、财务资源、时间资源、工具资源、外部支持、资源缺口及获取计划）',
        '14. motivationPlan: 激励计划（如何保持动力、内在激励、外在激励、奖励机制、庆祝方式、里程碑奖励、克服低潮的策略）',
        '15. habitFormation: 习惯养成（支持目标达成的关键习惯、习惯养成计划、习惯追踪、习惯叠加、环境设计、问责机制、21天/66天挑战）',
        '16. accountability: 问责机制（问责伙伴、问责方式、问责频率、公开承诺、进度分享、社会压力、自我问责、问责合同模板）',
        '17. commonPitfalls: 常见陷阱（目标设定的常见错误、OKR实施的常见陷阱、如何避免、反面案例、最佳实践、专家建议）',
        '18. examples: 优秀示例（这个领域的优秀OKR示例、标杆案例、参考模板、可借鉴的目标描述、可借鉴的KR设计）',
        '19. quarterlyPlan: 季度规划（如果是季度OKR：季度主题、季度重点、季度里程碑、月度分解、周度重点、每日习惯）',
        '20. successDefinition: 成功定义（什么算成功、成功的画面感、达成目标后的状态、如何庆祝、成功的衡量标准、成功的感受）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 8000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, okr: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 导出所有工具 ==========
export function createProductivityTools(deps) {
  return [
    createProjectPlannerTool(deps),
    createTaskManagerTool(deps),
    createTimeTrackerTool(deps),
    createDecisionMakerTool(deps),
    createMeetingOrganizerTool(deps),
    createOKRManagerTool(deps),
  ];
}
