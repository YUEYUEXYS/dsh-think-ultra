// ultra-doc-tools.js — Think 文档处理与知识管理工具箱
// 专门增强 Deepseek 处理文档、总结、分析、写作的能力

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

// ========== 工具1：深度文档总结器 ==========
export function createDocSummarizerTool(deps) {
  return defineTool({
    name: 'doc_deep_summarizer',
    description: '深度文档总结工具，对长文档进行多层级总结，提取核心观点、关键信息、行动项。支持学术论文、技术文档、报告、书籍等多种文档类型。',
    schema: {
      content: { type: 'string', description: '文档内容或文本' },
      docType: { type: 'string', description: '文档类型：academic/technical/report/book/article/meeting/other', default: 'article' },
      depth: { type: 'string', description: '总结深度：brief/standard/deep/comprehensive', default: 'deep' },
      language: { type: 'string', description: '输出语言：zh/en/auto', default: 'auto' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const typeMap = {
        academic: '学术论文',
        technical: '技术文档',
        report: '研究报告',
        book: '书籍',
        article: '文章',
        meeting: '会议记录',
        other: '其他文档',
      };
      const depthMap = {
        brief: '简要总结（300字以内，只给核心结论）',
        standard: '标准总结（500-800字，核心观点+关键信息）',
        deep: '深度总结（1000-1500字，多层级分析+详细要点）',
        comprehensive: '全面总结（2000字以上，完整分析+行动建议+延伸思考）',
      };
      const prompt = [
        '你是世界级文档分析专家。请对以下' + (typeMap[args.docType] || '文档') + '进行' + (depthMap[args.depth] || depthMap.deep) + '。',
        '输出语言：' + (args.language === 'auto' ? '与原文一致' : args.language),
        '',
        '【文档内容】',
        clip(args.content, 15000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. title: 文档标题（如果原文没有，根据内容生成一个准确的标题）',
        '2. coreThesis: 核心论点/主题（一句话概括文档最核心的观点）',
        '3. executiveSummary: 执行摘要（200字以内，给决策者看的高度浓缩总结）',
        '4. keyPoints: 关键要点列表（每个要点包含：观点、依据、重要性评分1-10）',
        '5. detailedSummary: 详细总结（按文档结构分段总结，保留关键细节和数据）',
        '6. actionItems: 行动项（如果有，列出具体的行动建议、责任人、优先级、截止时间）',
        '7. questionsRaised: 提出的问题（文档中提出但未解答的问题，或值得深入思考的问题）',
        '8. strengths: 文档优点（文档的亮点、价值、创新点）',
        '9. weaknesses: 文档不足（文档的缺陷、遗漏、可改进之处）',
        '10. relatedTopics: 相关主题（与本文档相关的延伸阅读主题，至少5个）',
        '11. keyQuotes: 关键引用（文档中最有价值的3-5句话，原文引用）',
        '12. readingTime: 阅读时间估算（分钟）',
        '13. difficulty: 阅读难度（1-10分，附理由）',
        '14. targetAudience: 目标读者（谁应该读这篇文档，为什么）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, summary: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具2：信息提取与结构化器 ==========
export function createInfoExtractorTool(deps) {
  return defineTool({
    name: 'info_extractor',
    description: '信息提取与结构化工具，从非结构化文本中提取实体、关系、数据、时间线等信息，输出结构化数据。支持人名、地名、组织、事件、数字、日期等多种实体类型。',
    schema: {
      content: { type: 'string', description: '要提取信息的文本' },
      extractTypes: { type: 'string', description: '要提取的信息类型，逗号分隔：person,organization,location,date,number,event,relationship,keyword,all', default: 'all' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是顶级信息提取专家。请从以下文本中提取结构化信息。',
        '提取类型：' + args.extractTypes,
        '',
        '【文本内容】',
        clip(args.content, 12000),
        '',
        '请输出严格 JSON，包含以下字段（根据提取类型选择性输出）：',
        '1. persons: 人物列表（姓名、身份/角色、相关描述、出现次数）',
        '2. organizations: 组织列表（名称、类型、相关描述、出现次数）',
        '3. locations: 地点列表（名称、类型、相关描述、出现次数）',
        '4. dates: 日期/时间列表（原始文本、标准化格式、相关事件、重要性）',
        '5. numbers: 数字/数据列表（数值、单位、上下文、来源、可信度）',
        '6. events: 事件列表（事件名称、时间、地点、参与者、描述、影响）',
        '7. relationships: 关系列表（主体、关系类型、客体、证据、置信度）',
        '8. keywords: 关键词列表（关键词、出现次数、重要性评分、上下文）',
        '9. timeline: 时间线（按时间顺序排列的关键事件，每个事件包含时间、事件、影响）',
        '10. summary: 提取总结（共提取了多少实体、多少关系、信息密度评估）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.1, maxTokens: 5000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, extracted: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具3：对比分析器 ==========
export function createComparisonAnalyzerTool(deps) {
  return defineTool({
    name: 'comparison_analyzer',
    description: '对比分析工具，对两个或多个对象（产品、方案、技术、观点、文档等）进行深度对比分析，识别异同、优缺点、适用场景，给出推荐建议。',
    schema: {
      items: { type: 'string', description: '要对比的对象描述，用 ||| 分隔多个对象' },
      dimensions: { type: 'string', description: '对比维度，逗号分隔；如果不指定则自动生成合适的维度', default: '' },
      purpose: { type: 'string', description: '对比目的：selection/evaluation/analysis/other', default: 'selection' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const items = args.items.split('|||').map(s => s.trim()).filter(Boolean);
      const purposeMap = {
        selection: '选择决策（帮助用户在多个选项中做出最佳选择）',
        evaluation: '评估分析（客观评估各对象的优劣）',
        analysis: '深度分析（深入分析各对象的本质差异）',
        other: '其他目的',
      };
      const prompt = [
        '你是世界级对比分析专家。请对以下' + items.length + '个对象进行深度对比分析。',
        '对比目的：' + (purposeMap[args.purpose] || purposeMap.selection),
        args.dimensions ? '指定对比维度：' + args.dimensions : '对比维度：请根据对象类型自动生成最合适的对比维度（至少8个维度）',
        '',
        '【对比对象】',
        items.map((item, i) => `对象${i + 1}:\n${item}`).join('\n\n'),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. overview: 对比概述（一句话概括各对象的核心差异和整体定位）',
        '2. dimensions: 对比维度列表（每个维度包含：维度名称、权重1-10、各对象在该维度的评分1-10、详细说明）',
        '3. similarities: 相同点（各对象的共同特征、优势、局限）',
        '4. differences: 差异点（关键差异、本质区别、各自的独特价值）',
        '5. prosCons: 优缺点分析（每个对象的优点列表、缺点列表、独特优势、致命缺陷）',
        '6. useCases: 适用场景（每个对象最适合的场景、不适合的场景、典型用户）',
        '7. scoring: 综合评分（加权计算每个对象的总分、排名、各维度得分雷达图数据）',
        '8. tradeoffs: 权衡分析（关键决策点、需要权衡的因素、不同偏好下的选择）',
        '9. recommendation: 推荐建议（如果目的是选择，给出明确推荐；分场景推荐；附理由和风险）',
        '10. decisionMatrix: 决策矩阵（如果需要做决策，给出决策矩阵：选项×评估标准×权重×得分）',
        '11. edgeCases: 边界情况（在什么特殊情况下推荐会改变、需要额外考虑的因素）',
        '12. furtherResearch: 进一步研究建议（还需要了解什么信息才能做出更准确的判断）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.2, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, comparison: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具4：写作助手与润色器 ==========
export function createWritingAssistantTool(deps) {
  return defineTool({
    name: 'writing_assistant',
    description: '写作助手与润色工具，帮助用户写作、润色、改写、扩写、缩写、风格转换。支持多种文体和风格，提供专业级的写作建议和修改。',
    schema: {
      content: { type: 'string', description: '原始文本或写作需求' },
      task: { type: 'string', description: '任务类型：polish/rewrite/expand/condense/style/translate/generate/outline/critique', default: 'polish' },
      style: { type: 'string', description: '目标风格：formal/casual/academic/professional/creative/concise/verbose/other', default: 'professional' },
      targetLength: { type: 'string', description: '目标长度：brief/medium/long/keep', default: 'keep' },
      audience: { type: 'string', description: '目标读者：general/technical/executive/student/other', default: 'general' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const taskMap = {
        polish: '润色优化（保持原意，提升表达质量、流畅度、专业性）',
        rewrite: '改写重写（用不同的表达方式重新组织内容，保持核心信息）',
        expand: '扩写丰富（增加细节、例子、解释，让内容更充实）',
        condense: '缩写精简（提炼核心信息，去除冗余，让内容更精炼）',
        style: '风格转换（转换为指定的写作风格）',
        translate: '翻译（翻译成指定语言，保持原意和风格）',
        generate: '生成写作（根据需求从零开始生成内容）',
        outline: '大纲生成（生成结构化的写作大纲）',
        critique: '写作批评（分析原文的优缺点，给出具体的改进建议）',
      };
      const styleMap = {
        formal: '正式严谨（适合公文、合同、正式报告）',
        casual: '轻松随意（适合日常交流、社交媒体）',
        academic: '学术规范（适合论文、学术报告、研究文档）',
        professional: '专业商务（适合商务邮件、商业报告、职业文档）',
        creative: '创意文学（适合小说、散文、创意写作）',
        concise: '简洁明了（用最少的字表达最多的信息）',
        verbose: '详细丰富（充分展开，提供大量细节）',
        other: '其他风格',
      };
      const prompt = [
        '你是世界级写作专家。请对以下文本执行任务：' + (taskMap[args.task] || taskMap.polish),
        '目标风格：' + (styleMap[args.style] || styleMap.professional),
        '目标长度：' + args.targetLength,
        '目标读者：' + args.audience,
        '',
        '【原始文本】',
        clip(args.content, 10000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. analysis: 原文分析（原文的优点、缺点、问题诊断、改进方向）',
        '2. result: 处理结果（处理后的最终文本，直接可用）',
        '3. changes: 修改说明（做了哪些修改、为什么这么改、修改前后对比）',
        '4. improvements: 改进点列表（具体的改进项，每项包含：原问题、改进方案、效果）',
        '5. styleAnalysis: 风格分析（原文风格 vs 目标风格的差异、如何实现风格转换）',
        '6. suggestions: 进一步建议（还可以如何提升、写作技巧建议、避免的常见错误）',
        '7. wordCount: 字数统计（原文字数、结果字数、变化比例）',
        '8. readability: 可读性评分（原文可读性、结果可读性、提升幅度，0-100分）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.4, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, writing: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具5：知识问答与推理器 ==========
export function createKnowledgeQAEngineTool(deps) {
  return defineTool({
    name: 'knowledge_qa_engine',
    description: '知识问答与深度推理引擎，对复杂问题进行多步推理、多角度分析、证据支撑的回答。支持学术问题、技术问题、哲学问题、决策问题等多种类型。',
    schema: {
      question: { type: 'string', description: '问题或主题' },
      questionType: { type: 'string', description: '问题类型：factual/analytical/creative/decision/philosophical/technical/other', default: 'analytical' },
      depth: { type: 'string', description: '回答深度：quick/standard/deep/exhaustive', default: 'deep' },
      context: { type: 'string', description: '背景信息或上下文（可选）', default: '' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const typeMap = {
        factual: '事实性问题（需要准确的事实和数据）',
        analytical: '分析性问题（需要深入分析和推理）',
        creative: '创意性问题（需要创新思维和想象力）',
        decision: '决策性问题（需要权衡利弊，给出建议）',
        philosophical: '哲学性问题（需要深度思考和思辨）',
        technical: '技术性问题（需要专业技术知识）',
        other: '其他类型问题',
      };
      const depthMap = {
        quick: '快速回答（300字以内，直接给答案）',
        standard: '标准回答（500-800字，答案+简要解释）',
        deep: '深度回答（1000-1500字，多角度分析+证据+推理过程）',
        exhaustive: '穷尽回答（2000字以上，全面分析+所有角度+延伸思考）',
      };
      const prompt = [
        '你是世界级知识问答与推理专家。请回答以下' + (typeMap[args.questionType] || '分析性') + '问题。',
        '回答深度：' + (depthMap[args.depth] || depthMap.deep),
        args.context ? '背景信息：' + args.context : '',
        '',
        '【问题】',
        args.question,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. directAnswer: 直接答案（一句话给出最核心的答案或结论）',
        '2. reasoning: 推理过程（展示你的思考过程、推理步骤、逻辑链条）',
        '3. analysis: 多角度分析（从至少3个不同角度分析问题，每个角度的观点和依据）',
        '4. evidence: 证据支撑（支持结论的事实、数据、案例、引用，标注来源可信度）',
        '5. counterarguments: 反方观点（可能的反对意见、不同看法、局限性分析）',
        '6. nuance: 细微差别（问题中的微妙之处、需要注意的细节、边界情况）',
        '7. implications: 影响与意义（这个问题的答案有什么意义、影响、启示）',
        '8. relatedQuestions: 相关问题（与本问题相关的延伸问题，至少5个）',
        '9. confidence: 置信度（你对答案的置信度0-100%，附理由和不确定性来源）',
        '10. furtherReading: 延伸阅读（推荐的书籍、文章、资源，帮助深入了解）',
        '11. keyInsights: 核心洞见（3-5条最有价值的洞察，每条一句话）',
        '12. actionItems: 行动建议（如果适用，给出具体的下一步行动建议）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, answer: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具6：思维导图生成器 ==========
export function createMindMapGeneratorTool(deps) {
  return defineTool({
    name: 'mindmap_generator',
    description: '思维导图生成工具，将主题、文档、想法转化为结构化的思维导图，支持多层级节点、关联关系、优先级标注。输出可用于可视化的结构化数据。',
    schema: {
      topic: { type: 'string', description: '主题或内容（可以是主题词、文档内容、想法列表）' },
      depth: { type: 'number', description: '思维导图深度（2-5层）', default: 3 },
      style: { type: 'string', description: '思维导图风格：logical/creative/comprehensive/quick', default: 'comprehensive' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是顶级思维导图专家。请为以下主题生成一个结构化的思维导图。',
        '思维导图深度：' + args.depth + '层',
        '风格：' + args.style,
        '',
        '【主题/内容】',
        clip(args.topic, 8000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. centralTopic: 中心主题（思维导图的核心主题词）',
        '2. mainBranches: 主要分支列表（每个分支包含：分支名称、描述、子节点列表、重要性评分1-10、颜色建议）',
        '3. subBranches: 子分支详情（每个子分支包含：名称、描述、关键点、与其他节点的关联、示例）',
        '4. relationships: 节点关联（跨分支的关联关系、因果关系、对比关系、依赖关系）',
        '5. keyPoints: 关键要点（整个思维导图中最重要的10个要点）',
        '6. insights: 核心洞见（从这个思维导图中可以得出的核心洞察）',
        '7. actionItems: 行动项（如果适用，从思维导图衍生出的具体行动建议）',
        '8. mermaidCode: Mermaid 代码（可直接渲染的 Mermaid mindmap 语法代码）',
        '9. summary: 思维导图总结（整体结构、覆盖范围、信息密度评估）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 5000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, mindmap: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 导出所有工具 ==========
export function createDocTools(deps) {
  return [
    createDocSummarizerTool(deps),
    createInfoExtractorTool(deps),
    createComparisonAnalyzerTool(deps),
    createWritingAssistantTool(deps),
    createKnowledgeQAEngineTool(deps),
    createMindMapGeneratorTool(deps),
  ];
}
