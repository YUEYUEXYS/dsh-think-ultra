// ultra-data-tools.js — Think 数据分析与可视化工具箱
// 专门增强 Deepseek 的数据分析、统计、可视化、洞察提取能力

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
      temperature: opts.temperature ?? 0.2,
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

// ========== 工具1：深度数据分析器 ==========
export function createDataAnalyzerTool(deps) {
  return defineTool({
    name: 'data_deep_analyzer',
    description: '深度数据分析工具，对数据集进行多维度、多层次的深度分析，识别模式、趋势、异常、相关性、因果关系。支持描述性分析、诊断性分析、预测性分析、处方性分析。',
    schema: {
      data: { type: 'string', description: '数据内容（CSV/JSON/表格文本/描述性数据）' },
      dataType: { type: 'string', description: '数据类型：timeseries/crosssection/panel/survey/transaction/other', default: 'timeseries' },
      analysisDepth: { type: 'string', description: '分析深度：descriptive/diagnostic/predictive/prescriptive/all', default: 'all' },
      businessContext: { type: 'string', description: '业务背景/分析目的（可选）', default: '' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级数据科学家和分析专家。请对以下数据进行深度分析。',
        '数据类型：' + args.dataType,
        '分析深度：' + args.analysisDepth,
        args.businessContext ? '业务背景：' + args.businessContext : '',
        '',
        '【数据】',
        clip(args.data, 15000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. dataOverview: 数据概览（数据规模、字段说明、数据质量评估、时间范围、关键统计量）',
        '2. descriptiveAnalysis: 描述性分析（集中趋势、离散程度、分布形态、关键指标、基准对比）',
        '3. diagnosticAnalysis: 诊断性分析（为什么会这样、根因分析、影响因素、异常检测、相关性分析）',
        '4. predictiveAnalysis: 预测性分析（趋势预测、未来走势、风险预警、情景分析、置信区间）',
        '5. prescriptiveAnalysis: 处方性分析（应该怎么做、最优决策、行动建议、资源分配、预期效果）',
        '6. patterns: 模式识别（数据中的模式、规律、周期性、季节性、结构性变化）',
        '7. anomalies: 异常检测（异常值、离群点、突变点、异常模式、可能原因）',
        '8. correlations: 相关性分析（变量间的相关性、因果关系、影响因子、相关系数）',
        '9. segments: 细分分析（按不同维度细分、各细分群体的特征、差异、机会）',
        '10. keyInsights: 核心洞察（最重要的5-10个洞察，每个洞察包含：洞察内容、证据、重要性、业务影响）',
        '11. recommendations: 行动建议（具体的、可执行的建议，每个建议包含：建议内容、预期效果、实施难度、优先级、所需资源）',
        '12. visualizationPlan: 可视化方案（推荐的图表类型、每个图表的目的、数据映射、设计建议）',
        '13. limitations: 分析局限（数据局限、方法局限、结论的适用范围、需要谨慎的地方）',
        '14. furtherAnalysis: 进一步分析建议（还需要哪些数据、哪些分析、可以深入的方向）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, analysis: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具2：统计分析器 ==========
export function createStatisticalAnalyzerTool(deps) {
  return defineTool({
    name: 'statistical_analyzer',
    description: '统计分析工具，执行专业的统计分析，包括假设检验、回归分析、方差分析、相关性分析、分布检验等。输出统计量、p值、置信区间、效应量等专业统计结果。',
    schema: {
      data: { type: 'string', description: '数据内容' },
      analysisType: { type: 'string', description: '分析类型：hypothesis_test/regression/anova/correlation/distribution/ttest/chi_square/auto', default: 'auto' },
      variables: { type: 'string', description: '要分析的变量（逗号分隔）', default: '' },
      significanceLevel: { type: 'number', description: '显著性水平（alpha）', default: 0.05 },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级统计学家。请对以下数据执行统计分析。',
        '分析类型：' + args.analysisType,
        args.variables ? '分析变量：' + args.variables : '',
        '显著性水平：' + args.significanceLevel,
        '',
        '【数据】',
        clip(args.data, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. analysisPlan: 分析计划（选择的统计方法、为什么选择这个方法、前提假设、检验流程）',
        '2. assumptionsCheck: 前提假设检验（正态性、方差齐性、独立性、线性性等假设的检验结果）',
        '3. descriptiveStats: 描述性统计（均值、中位数、标准差、标准误、置信区间、四分位数、偏度、峰度）',
        '4. testResults: 检验结果（统计量、自由度、p值、效应量、置信区间、检验功效、是否显著）',
        '5. regressionResults: 回归结果（如果是回归分析：系数、标准误、t值、p值、R²、调整R²、F统计量、残差分析、多重共线性检验）',
        '6. postHocTests: 事后检验（如果是ANOVA：Tukey HSD、Bonferroni等事后比较结果）',
        '7. effectSize: 效应量分析（Cohen d、eta squared、r等效应量及其解释、实际意义）',
        '8. confidenceIntervals: 置信区间（各参数的置信区间、区间宽度、解释）',
        '9. interpretation: 结果解释（用通俗语言解释统计结果、统计显著性 vs 实际显著性、结论的适用范围）',
        '10. visualizations: 可视化建议（推荐的统计图表、每个图表的目的、数据映射、标注建议）',
        '11. limitations: 分析局限（样本量、统计功效、方法局限、结论的谨慎表述）',
        '12. recommendations: 建议（基于统计结果的建议、进一步研究的方向、需要收集的数据）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.1, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, statistics: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具3：趋势预测器 ==========
export function createTrendPredictorTool(deps) {
  return defineTool({
    name: 'trend_predictor',
    description: '趋势预测工具，对时间序列数据进行趋势分析和未来预测。支持多种预测方法，包括趋势外推、移动平均、指数平滑、季节性分解、情景分析等。输出预测值、置信区间、预测准确性评估。',
    schema: {
      data: { type: 'string', description: '时间序列数据' },
      forecastHorizon: { type: 'number', description: '预测期数（预测未来多少个周期）', default: 12 },
      frequency: { type: 'string', description: '数据频率：daily/weekly/monthly/quarterly/yearly/other', default: 'monthly' },
      method: { type: 'string', description: '预测方法：trend_extrapolation/moving_average/exponential_smoothing/seasonal_decomposition/ensemble/auto', default: 'auto' },
      confidenceLevel: { type: 'number', description: '置信水平（0.8-0.99）', default: 0.95 },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级预测分析专家。请对以下时间序列数据进行趋势分析和未来预测。',
        '预测期数：' + args.forecastHorizon,
        '数据频率：' + args.frequency,
        '预测方法：' + args.method,
        '置信水平：' + args.confidenceLevel,
        '',
        '【时间序列数据】',
        clip(args.data, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. dataOverview: 数据概览（时间范围、数据点数、缺失值、基本统计量、数据质量评估）',
        '2. trendAnalysis: 趋势分析（整体趋势方向、趋势强度、趋势变化点、长期 vs 短期趋势）',
        '3. seasonalityAnalysis: 季节性分析（季节性模式、周期长度、季节性强度、旺季/淡季识别）',
        '4. cyclicalAnalysis: 周期性分析（商业周期、波动模式、周期长度、当前周期位置）',
        '5. decomposition: 数据分解（趋势成分、季节成分、循环成分、随机成分，各成分的贡献度）',
        '6. methodSelection: 方法选择（选择的预测方法、为什么选择、方法假设、适用性评估）',
        '7. modelParameters: 模型参数（各预测方法的参数、参数估计、参数解释）',
        '8. forecast: 预测结果（未来各期的预测值、点预测、置信区间上下限、预测区间宽度）',
        '9. forecastTable: 预测表格（期数、日期、预测值、下界、上界、预测变化率、累计预测）',
        '10. accuracyAssessment: 准确性评估（回测结果、MAE、RMSE、MAPE、预测偏差、模型拟合优度）',
        '11. scenarioAnalysis: 情景分析（乐观情景、基准情景、悲观情景，各情景的预测结果和概率）',
        '12. riskFactors: 风险因素（可能影响预测的风险因素、不确定性来源、敏感性分析）',
        '13. keyInsights: 核心洞察（最重要的预测洞察、趋势变化、转折点、预警信号）',
        '14. recommendations: 行动建议（基于预测的决策建议、资源规划、风险应对、机会把握）',
        '15. visualizationPlan: 可视化方案（推荐的预测图表、历史数据+预测+置信区间的可视化设计、标注建议）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, prediction: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具4：洞察提取器 ==========
export function createInsightExtractorTool(deps) {
  return defineTool({
    name: 'insight_extractor',
    description: '洞察提取工具，从数据、报告、文本中提取有价值的商业洞察和可执行建议。不仅仅是数据描述，而是深入挖掘数据背后的意义、机会、风险、行动方向。',
    schema: {
      content: { type: 'string', description: '数据/报告/文本内容' },
      contentType: { type: 'string', description: '内容类型：data/report/meeting/customer/competitor/market/other', default: 'data' },
      industry: { type: 'string', description: '行业背景（可选）', default: '' },
      insightDepth: { type: 'string', description: '洞察深度：surface/deep/strategic/transformative', default: 'strategic' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级商业分析师和战略顾问。请从以下内容中提取有价值的洞察。',
        '内容类型：' + args.contentType,
        args.industry ? '行业背景：' + args.industry : '',
        '洞察深度：' + args.insightDepth,
        '',
        '【内容】',
        clip(args.content, 15000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. executiveSummary: 执行摘要（最重要的3-5个洞察的高度浓缩总结，给决策者看）',
        '2. keyInsights: 核心洞察列表（每个洞察包含：洞察编号、洞察标题、洞察内容、支撑证据、数据来源、重要性评分1-10、紧急度评分1-10、影响范围、时间维度）',
        '3. opportunities: 机会识别（从洞察中发现的机会，每个机会包含：机会描述、市场规模、竞争格局、进入壁垒、预期收益、实施难度、时间窗口、优先级）',
        '4. risks: 风险识别（从洞察中发现的风险，每个风险包含：风险描述、发生概率、影响程度、风险等级、早期预警信号、应对措施、责任方）',
        '5. rootCauses: 根因分析（关键问题的根本原因，5Why分析、鱼骨图分析、系统性原因 vs 表面原因）',
        '6. patterns: 模式识别（重复出现的模式、规律、行为模式、消费模式、市场模式）',
        '7. anomalies: 异常发现（不符合常规的现象、意外发现、黑天鹅信号、反直觉的发现）',
        '8. correlations: 关联发现（看似不相关事物之间的关联、因果关系、影响链条、传导机制）',
        '9. competitiveImplications: 竞争影响（对竞争格局的影响、竞争对手的可能反应、竞争优势/劣势变化、市场份额变化）',
        '10. strategicRecommendations: 战略建议（基于洞察的战略层面建议，每个建议包含：建议内容、战略逻辑、预期效果、实施路径、资源需求、关键成功因素、风险）',
        '11. actionableItems: 可执行行动项（具体的、可立即执行的行动，每个行动包含：行动内容、负责人、截止时间、预期成果、衡量指标、优先级）',
        '12. kpiRecommendations: KPI建议（应该关注的关键指标、指标定义、目标值、监测频率、预警阈值）',
        '13. decisionPoints: 决策点（需要管理层决策的关键点、决策选项、各选项的利弊、建议决策、决策时间窗口）',
        '14. furtherInvestigation: 进一步调查建议（还需要深入调查的问题、需要补充的数据、验证假设的方法）',
        '15. insightQuality: 洞察质量评估（洞察的新颖性、可验证性、可执行性、影响力、时效性评分，整体质量评级）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, insights: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具5：数据清洗与预处理工具 ==========
export function createDataCleanerTool(deps) {
  return defineTool({
    name: 'data_cleaner',
    description: '数据清洗与预处理工具，对原始数据进行清洗、转换、标准化、特征工程。处理缺失值、异常值、重复值、格式不一致、数据类型错误等问题，输出干净、可用的数据集。',
    schema: {
      data: { type: 'string', description: '原始数据' },
      dataFormat: { type: 'string', description: '数据格式：csv/json/tsv/excel_text/other', default: 'csv' },
      cleaningLevel: { type: 'string', description: '清洗级别：basic/standard/advanced/feature_engineering', default: 'standard' },
      targetUse: { type: 'string', description: '数据用途：analysis/ml/visualization/reporting/other', default: 'analysis' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级数据工程师。请对以下原始数据进行清洗和预处理。',
        '数据格式：' + args.dataFormat,
        '清洗级别：' + args.cleaningLevel,
        '数据用途：' + args.targetUse,
        '',
        '【原始数据】',
        clip(args.data, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. dataProfile: 数据画像（数据规模、字段列表、数据类型、缺失率、唯一值数、基本统计量、数据质量评分）',
        '2. issuesFound: 发现的问题（缺失值、异常值、重复值、格式不一致、数据类型错误、逻辑错误、编码问题、单位不一致，每个问题的位置、数量、严重程度）',
        '3. cleaningPlan: 清洗计划（针对每个问题的清洗策略、为什么选择这个策略、对数据的影响）',
        '4. missingValueHandling: 缺失值处理（各字段的缺失率、处理方法：删除/均值/中位数/众数/插值/模型预测/标记缺失，处理后的效果）',
        '5. outlierHandling: 异常值处理（异常值检测方法、异常值列表、处理方法：保留/修正/删除/截断/分箱，处理前后的统计对比）',
        '6. duplicateHandling: 重复值处理（重复记录检测、重复数量、处理方法、处理后的数据量）',
        '7. dataTransformation: 数据转换（类型转换、格式标准化、单位统一、编码转换、日期解析、文本规范化）',
        '8. featureEngineering: 特征工程（如果是高级清洗：新特征创建、特征编码、特征缩放、特征选择、特征交叉、降维）',
        '9. cleanedData: 清洗后数据（清洗后的完整数据集，保持原格式）',
        '10. dataDictionary: 数据字典（清洗后各字段的名称、类型、含义、取值范围、示例值、是否关键字段）',
        '11. qualityImprovement: 质量提升（清洗前后的数据质量对比、完整性、准确性、一致性、时效性评分提升）',
        '12. validationChecks: 验证检查（清洗后的数据验证：范围检查、逻辑检查、一致性检查、完整性检查，全部通过的确认）',
        '13. documentation: 清洗文档（清洗步骤记录、决策依据、数据血缘、可复现的清洗流程）',
        '14. recommendations: 建议（数据收集建议、数据治理建议、未来数据质量提升建议）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.1, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, cleaned: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具6：A/B测试与实验分析器 ==========
export function createABTestAnalyzerTool(deps) {
  return defineTool({
    name: 'ab_test_analyzer',
    description: 'A/B测试与实验分析工具，对A/B测试数据进行专业的统计分析，包括样本量计算、显著性检验、效应量、置信区间、多重比较校正、实验设计评估等。帮助做出数据驱动的决策。',
    schema: {
      data: { type: 'string', description: 'A/B测试数据（对照组和实验组的指标数据）' },
      testType: { type: 'string', description: '测试类型：means/proportions/rates/counts/auto', default: 'auto' },
      metrics: { type: 'string', description: '核心指标（逗号分隔）', default: '' },
      alpha: { type: 'number', description: '显著性水平', default: 0.05 },
      power: { type: 'number', description: '统计功效（1-beta）', default: 0.8 },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级实验设计和统计专家。请对以下A/B测试数据进行专业分析。',
        '测试类型：' + args.testType,
        args.metrics ? '核心指标：' + args.metrics : '',
        '显著性水平：' + args.alpha,
        '统计功效：' + args.power,
        '',
        '【A/B测试数据】',
        clip(args.data, 12000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. experimentOverview: 实验概览（实验目的、实验组别、样本量、实验时长、核心指标、辅助指标）',
        '2. designEvaluation: 实验设计评估（随机化、分组均衡、样本量是否足够、实验时长是否合适、是否有污染、是否有新奇效应）',
        '3. sampleSizeCheck: 样本量检验（实际样本量 vs 所需样本量、统计功效计算、最小可检测效应、是否提前停止）',
        '4. baselineComparison: 基线对比（实验前各组的基线指标对比、是否均衡、协变量平衡检验）',
        '5. descriptiveResults: 描述性结果（各组的描述性统计：均值、比例、标准差、标准误、置信区间、样本量）',
        '6. statisticalTests: 统计检验（选择的检验方法、检验统计量、自由度、p值、是否显著、多重比较校正）',
        '7. effectSize: 效应量（绝对差异、相对差异、百分比提升、Cohen d、置信区间、效应量解释、实际意义）',
        '8. confidenceIntervals: 置信区间（各指标的差异置信区间、区间宽度、是否包含零、解释）',
        '9. subgroupAnalysis: 细分分析（按用户分群、设备、地区、时间等细分的效果差异、异质性检验、辛普森悖论检查）',
        '10. timeSeriesAnalysis: 时间序列分析（实验期间的效果随时间变化、新奇效应、学习效应、疲劳效应、趋势稳定性）',
        '11. guardrailMetrics: 护栏指标（负面指标检查、是否有意外的负面影响、指标权衡分析）',
        '12. robustnessChecks: 稳健性检验（不同统计方法的结果一致性、异常值敏感性、剔除异常值后的结果、bootstrap验证）',
        '13. decision: 决策建议（是否推出实验组、推出的条件、分阶段推出建议、需要继续实验的情况、不推荐的情况）',
        '14. businessImpact: 业务影响（预计的业务影响、收入/用户/留存等指标的变化、规模化后的预期效果、投资回报率）',
        '15. learnings: 经验总结（从实验中学到的、用户行为洞察、产品改进方向、未来实验建议）',
        '16. limitations: 局限（实验的局限性、结论的适用范围、外部有效性、需要谨慎的地方）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.1, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, abTest: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 导出所有工具 ==========
export function createDataTools(deps) {
  return [
    createDataAnalyzerTool(deps),
    createStatisticalAnalyzerTool(deps),
    createTrendPredictorTool(deps),
    createInsightExtractorTool(deps),
    createDataCleanerTool(deps),
    createABTestAnalyzerTool(deps),
  ];
}
