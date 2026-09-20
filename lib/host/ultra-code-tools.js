// ultra-code-tools.js — Think 代码理解与分析工具箱
// 专门增强 Deepseek 看代码、理解代码、分析代码、重构代码的能力
// 每个工具都是真实可调用的，不是空壳

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

// ========== 工具1：代码结构理解器 ==========
export function createCodeStructureTool(deps) {
  return defineTool({
    name: 'code_structure_analyzer',
    description: '深度分析代码结构，识别模块、类、函数、依赖关系、调用链、数据流。输入代码片段或文件路径，输出完整的结构分析报告。',
    schema: {
      code: { type: 'string', description: '要分析的代码片段' },
      language: { type: 'string', description: '编程语言（javascript/typescript/python/rust/c++/go/java等）' },
      depth: { type: 'string', description: '分析深度：overview/standard/deep/extreme', default: 'deep' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const depthMap = {
        overview: '只分析整体结构和主要模块',
        standard: '分析模块、类、函数和主要依赖',
        deep: '深度分析所有结构、依赖、调用链、数据流、控制流',
        extreme: '极限分析：逐行分析，识别所有隐含依赖、副作用、性能瓶颈、安全漏洞',
      };
      const prompt = [
        '你是顶级代码结构分析专家。请对以下代码进行' + (depthMap[args.depth] || depthMap.deep) + '。',
        '编程语言：' + (args.language || '自动识别'),
        '',
        '【代码】',
        clip(args.code, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. overview: 代码整体概述（这个代码做什么）',
        '2. modules: 模块列表（每个模块的名称、职责、依赖）',
        '3. classes: 类列表（类名、继承关系、主要方法、属性）',
        '4. functions: 函数列表（函数名、参数、返回值、复杂度、副作用）',
        '5. dependencies: 依赖关系图（内部依赖、外部依赖）',
        '6. callChain: 主要调用链（从入口到出口的完整调用路径）',
        '7. dataFlow: 数据流分析（数据如何在函数/模块间流动）',
        '8. controlFlow: 控制流分析（条件、循环、异常处理）',
        '9. complexity: 复杂度评估（圈复杂度、认知复杂度、性能瓶颈）',
        '10. risks: 潜在风险（安全漏洞、内存泄漏、竞态条件、错误处理缺陷）',
        '11. quality: 代码质量评分（0-100分，附详细理由）',
        '12. suggestions: 改进建议（具体、可执行、按优先级排序）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, analysis: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具2：代码审查器 ==========
export function createCodeReviewTool(deps) {
  return defineTool({
    name: 'code_review_expert',
    description: '专业代码审查工具，检查代码质量、最佳实践、潜在bug、安全漏洞、性能问题。输出详细的审查报告和修复建议。',
    schema: {
      code: { type: 'string', description: '要审查的代码' },
      language: { type: 'string', description: '编程语言' },
      focus: { type: 'string', description: '审查重点：quality/security/performance/all', default: 'all' },
      strictness: { type: 'string', description: '严格程度：lenient/standard/strict/extreme', default: 'strict' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const focusMap = {
        quality: '代码质量、可读性、可维护性、最佳实践',
        security: '安全漏洞、注入风险、权限问题、数据泄露',
        performance: '性能瓶颈、时间复杂度、空间复杂度、优化机会',
        all: '全面审查：质量、安全、性能、架构、测试',
      };
      const prompt = [
        '你是世界级代码审查专家。请对以下代码进行' + (focusMap[args.focus] || focusMap.all) + '审查。',
        '严格程度：' + args.strictness,
        '编程语言：' + (args.language || '自动识别'),
        '',
        '【代码】',
        clip(args.code, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. summary: 审查总结（整体评价、主要问题、总体评分）',
        '2. criticalIssues: 严重问题列表（必须立即修复的bug、安全漏洞、数据丢失风险）',
        '3. majorIssues: 主要问题列表（影响功能、性能、可维护性的问题）',
        '4. minorIssues: 次要问题列表（代码风格、命名、注释等小问题）',
        '5. suggestions: 改进建议（具体、可执行、按优先级排序）',
        '6. bestPractices: 最佳实践违反（列出违反的最佳实践和正确做法）',
        '7. securityFindings: 安全发现（漏洞类型、严重程度、修复方案）',
        '8. performanceFindings: 性能发现（瓶颈、复杂度、优化建议）',
        '9. testCoverage: 测试覆盖评估（哪些逻辑需要测试、测试建议）',
        '10. refactoringPlan: 重构计划（分步骤的重构方案，每步的目标和风险）',
        '11. score: 评分（质量、安全、性能、可维护性各0-100分，总分）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, review: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具3：算法分析器 ==========
export function createAlgorithmAnalyzerTool(deps) {
  return defineTool({
    name: 'algorithm_analyzer',
    description: '深度分析算法的时间复杂度、空间复杂度、正确性、边界条件、优化机会。输入算法代码，输出完整的算法分析报告。',
    schema: {
      code: { type: 'string', description: '要分析的算法代码' },
      language: { type: 'string', description: '编程语言' },
      inputSize: { type: 'string', description: '输入规模描述（如n个元素、n×n矩阵等）' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是顶级算法分析专家。请对以下算法进行深度分析。',
        '编程语言：' + (args.language || '自动识别'),
        '输入规模：' + (args.inputSize || 'n'),
        '',
        '【算法代码】',
        clip(args.code, 10000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. algorithmType: 算法类型（排序/搜索/动态规划/贪心/图论/数学/其他）',
        '2. purpose: 算法目的（这个算法解决什么问题）',
        '3. timeComplexity: 时间复杂度（最好、平均、最坏情况，附详细推导）',
        '4. spaceComplexity: 空间复杂度（辅助空间、递归栈、总空间）',
        '5. correctness: 正确性证明（循环不变式、归纳证明、边界条件验证）',
        '6. edgeCases: 边界条件（空输入、单元素、最大值、最小值、重复值、非法输入）',
        '7. optimizations: 优化机会（时间优化、空间优化、常数因子优化、并行化机会）',
        '8. comparison: 同类算法对比（与其他解决同一问题的算法对比优缺点）',
        '9. applications: 适用场景（什么情况下用这个算法最好）',
        '10. limitations: 局限性（什么情况下不适用、潜在问题）',
        '11. testCases: 测试用例（至少5个，包含边界情况和预期输出）',
        '12. score: 算法评分（效率、正确性、可读性、可维护性各0-100分）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 5000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, analysis: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具4：架构设计顾问 ==========
export function createArchitectureAdvisorTool(deps) {
  return defineTool({
    name: 'architecture_advisor',
    description: '软件架构设计顾问，分析现有架构、设计新架构、评估技术选型、识别架构风险、提供演进路线图。',
    schema: {
      description: { type: 'string', description: '系统描述或现有架构说明' },
      requirements: { type: 'string', description: '功能需求和非功能需求' },
      constraints: { type: 'string', description: '约束条件（技术栈、团队、预算、时间等）' },
      phase: { type: 'string', description: '阶段：design/review/evolution', default: 'design' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const phaseMap = {
        design: '设计新系统架构',
        review: '审查现有架构',
        evolution: '架构演进规划',
      };
      const prompt = [
        '你是世界级软件架构师。请' + (phaseMap[args.phase] || phaseMap.design) + '。',
        '',
        '【系统描述】',
        clip(args.description, 5000),
        '',
        '【需求】',
        clip(args.requirements, 5000),
        '',
        '【约束】',
        clip(args.constraints, 3000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. architectureStyle: 架构风格推荐（微服务/单体/事件驱动/分层/CQRS/六边形等，附理由）',
        '2. componentDiagram: 组件图（主要组件、职责、交互关系）',
        '3. dataFlow: 数据流设计（数据如何在系统中流动、存储、转换）',
        '4. apiDesign: API设计（主要接口、协议、数据格式）',
        '5. techStack: 技术选型（语言、框架、数据库、中间件，附选型理由）',
        '6. scalability: 可扩展性设计（水平扩展、垂直扩展、缓存策略、负载均衡）',
        '7. reliability: 可靠性设计（容错、重试、熔断、降级、备份、灾备）',
        '8. security: 安全设计（认证、授权、加密、审计、漏洞防护）',
        '9. performance: 性能设计（性能目标、优化策略、监控指标）',
        '10. risks: 架构风险（技术风险、组织风险、进度风险，附缓解措施）',
        '11. tradeoffs: 权衡分析（每个关键决策的利弊、为什么这么选）',
        '12. roadmap: 演进路线图（分阶段实施计划，每阶段的目标、交付物、风险）',
        '13. score: 架构评分（可扩展性、可靠性、安全性、性能、可维护性各0-100分）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, architecture: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具5：调试诊断器 ==========
export function createDebugDiagnosticTool(deps) {
  return defineTool({
    name: 'debug_diagnostic',
    description: '智能调试诊断工具，分析bug、错误日志、异常堆栈，定位根因，提供修复方案。输入错误信息和相关代码，输出诊断报告。',
    schema: {
      error: { type: 'string', description: '错误信息、异常堆栈或bug描述' },
      code: { type: 'string', description: '相关代码' },
      context: { type: 'string', description: '运行环境、复现步骤、预期行为' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是顶级调试专家。请诊断以下问题并提供修复方案。',
        '',
        '【错误信息】',
        clip(args.error, 5000),
        '',
        '【相关代码】',
        clip(args.code, 10000),
        '',
        '【上下文】',
        clip(args.context, 3000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. errorClassification: 错误分类（语法错误/逻辑错误/运行时错误/并发错误/资源错误/配置错误/其他）',
        '2. rootCause: 根本原因（深入分析，不是表面现象）',
        '3. errorChain: 错误传播链（错误从哪里开始，如何传播到最终表现）',
        '4. reproductionSteps: 复现步骤（精确的复现步骤）',
        '5. impact: 影响范围（哪些功能、哪些用户、严重程度）',
        '6. immediateFix: 立即修复方案（快速止血的方案）',
        '7. properFix: 正确修复方案（根治问题的方案，附代码示例）',
        '8. prevention: 预防措施（如何避免类似问题再次发生）',
        '9. testCases: 测试用例（验证修复的测试用例）',
        '10. relatedIssues: 相关问题（可能同时存在的其他问题）',
        '11. confidence: 诊断置信度（0-100%，附理由）',
        '12. priority: 修复优先级（P0/P1/P2/P3，附理由）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 5000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, diagnosis: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具6：性能优化器 ==========
export function createPerformanceOptimizerTool(deps) {
  return defineTool({
    name: 'performance_optimizer',
    description: '性能优化专家，分析代码性能瓶颈，提供优化方案，预估优化效果。输入代码和性能问题描述，输出优化报告。',
    schema: {
      code: { type: 'string', description: '要优化的代码' },
      language: { type: 'string', description: '编程语言' },
      performanceIssue: { type: 'string', description: '性能问题描述（慢、内存占用高、CPU占用高等）' },
      target: { type: 'string', description: '优化目标（响应时间、吞吐量、内存占用等）' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级性能优化专家。请分析以下代码的性能问题并提供优化方案。',
        '编程语言：' + (args.language || '自动识别'),
        '性能问题：' + (args.performanceIssue || '未指定'),
        '优化目标：' + (args.target || '全面优化'),
        '',
        '【代码】',
        clip(args.code, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. bottleneckAnalysis: 瓶颈分析（主要性能瓶颈在哪里，为什么慢）',
        '2. profiling: 性能剖析建议（应该测量哪些指标、用什么工具）',
        '3. complexityAnalysis: 复杂度分析（时间复杂度、空间复杂度，附推导）',
        '4. optimizationPlan: 优化方案（分步骤的优化计划，每步的目标和预期收益）',
        '5. codeOptimizations: 代码级优化（具体的代码修改建议，附前后对比）',
        '6. algorithmOptimizations: 算法级优化（更优的算法选择和实现）',
        '7. dataStructureOptimizations: 数据结构优化（更合适的数据结构选择）',
        '8. cachingStrategy: 缓存策略（缓存什么、缓存多久、缓存失效策略）',
        '9. parallelization: 并行化机会（哪些可以并行、用什么方式并行）',
        '10. ioOptimization: IO优化（数据库查询、文件读写、网络请求优化）',
        '11. memoryOptimization: 内存优化（内存泄漏、内存占用高的原因和解决方案）',
        '12. expectedImprovement: 预期改进（每项优化的预期性能提升百分比）',
        '13. tradeoffs: 权衡分析（每个优化方案的利弊、可能的副作用）',
        '14. priority: 优化优先级（按投入产出比排序）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, optimization: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 导出所有工具 ==========
export function createCodeTools(deps) {
  return [
    createCodeStructureTool(deps),
    createCodeReviewTool(deps),
    createAlgorithmAnalyzerTool(deps),
    createArchitectureAdvisorTool(deps),
    createDebugDiagnosticTool(deps),
    createPerformanceOptimizerTool(deps),
  ];
}
