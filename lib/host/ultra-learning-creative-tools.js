// ultra-learning-creative-tools.js — Think 学习辅助与创意工具箱
// 专门增强 Deepseek 的学习辅助、创意生成、内容创作能力

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
      temperature: opts.temperature ?? 0.4,
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

// ========== 工具1：学习路径规划器 ==========
export function createLearningPathPlannerTool(deps) {
  return defineTool({
    name: 'learning_path_planner',
    description: '学习路径规划工具，根据学习目标、当前水平、可用时间，生成个性化的学习路径和计划。支持技能学习、知识学习、考试备考、职业发展等多种场景。',
    schema: {
      goal: { type: 'string', description: '学习目标（要学什么、达到什么水平）' },
      currentLevel: { type: 'string', description: '当前水平：beginner/intermediate/advanced/expert', default: 'beginner' },
      availableTime: { type: 'string', description: '可用时间（如：每天1小时、每周10小时、3个月）', default: '每天1小时' },
      learningStyle: { type: 'string', description: '学习风格：visual/auditory/reading/practical/mixed', default: 'mixed' },
      priority: { type: 'string', description: '优先级：speed/depth/balance/practical', default: 'balance' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级教育专家和学习规划师。请为以下学习目标生成个性化的学习路径。',
        '学习目标：' + args.goal,
        '当前水平：' + args.currentLevel,
        '可用时间：' + args.availableTime,
        '学习风格：' + args.learningStyle,
        '优先级：' + args.priority,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. goalAnalysis: 目标分析（学习目标拆解、所需知识技能、达到目标的标准）',
        '2. prerequisites: 前置知识（学习这个目标需要哪些基础知识、如果缺乏如何补充）',
        '3. learningPhases: 学习阶段（分阶段的学习计划，每阶段包含：阶段名称、持续时间、学习目标、核心内容、关键里程碑、评估方式）',
        '4. weeklyPlan: 每周计划（具体的每周学习安排，每天的学习内容、时间分配、练习任务）',
        '5. resources: 学习资源（推荐的书籍、课程、网站、工具、社区，标注免费/付费、难度、推荐度）',
        '6. practiceProjects: 实践项目（巩固学习的项目练习，从简单到复杂，每个项目的目标、要求、验收标准）',
        '7. assessment: 评估方法（如何检验学习效果、自测题、项目评估、能力认证）',
        '8. commonPitfalls: 常见陷阱（学习过程中容易犯的错误、如何避免、如何保持动力）',
        '9. milestones: 关键里程碑（学习过程中的关键节点、达成标志、庆祝时刻）',
        '10. adaptation: 调整策略（如果进度落后或超前如何调整、如何根据反馈优化学习计划）',
        '11. estimatedTimeline: 预估时间线（达到不同水平的预估时间、总学习时长、关键时间节点）',
        '12. motivationTips: 动力保持（如何保持学习动力、克服拖延、建立习惯、奖励机制）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, learningPath: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具2：概念深度解释器 ==========
export function createConceptExplainerTool(deps) {
  return defineTool({
    name: 'concept_explainer',
    description: '概念深度解释工具，对复杂概念进行多层级、多角度的解释，从简单到复杂，从类比到原理，帮助不同水平的学习者理解。支持费曼学习法、类比解释、可视化描述等多种解释方式。',
    schema: {
      concept: { type: 'string', description: '要解释的概念或主题' },
      audienceLevel: { type: 'string', description: '受众水平：child/beginner/intermediate/advanced/expert', default: 'beginner' },
      explanationStyle: { type: 'string', description: '解释风格：analogy/feynman/technical/intuitive/historical/multiperspective', default: 'multiperspective' },
      depth: { type: 'string', description: '解释深度：brief/standard/deep/comprehensive', default: 'deep' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const levelMap = {
        child: '儿童（8-12岁，用最简单的语言和比喻）',
        beginner: '初学者（零基础，避免专业术语，多用类比）',
        intermediate: '中级（有一定基础，可以使用专业术语，需要一定深度）',
        advanced: '高级（专业人士，需要深入原理和前沿进展）',
        expert: '专家（研究者级别，需要最前沿的研究和理论深度）',
      };
      const prompt = [
        '你是世界级教育家和科普作家。请用' + (levelMap[args.audienceLevel] || '初学者') + '能理解的方式解释以下概念。',
        '解释风格：' + args.explanationStyle,
        '解释深度：' + args.depth,
        '',
        '【概念】',
        args.concept,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. oneLineSummary: 一句话总结（用最简单的话概括这个概念）',
        '2. elevatorPitch: 电梯演讲（30秒内能讲清楚的版本，100字以内）',
        '3. analogyExplanation: 类比解释（用至少3个不同领域的类比来解释这个概念，每个类比说明相似点和局限性）',
        '4. feynmanExplanation: 费曼解释（用费曼学习法，假装教给一个完全不懂的人，用最简单的语言和例子）',
        '5. technicalDefinition: 技术定义（严格的技术定义、数学公式（如果适用）、专业术语解释）',
        '6. intuition: 直觉理解（这个概念为什么重要、它解决了什么问题、直觉上如何理解）',
        '7. history: 历史背景（这个概念是如何发展出来的、关键人物、关键突破、历史意义）',
        '8. examples: 实例说明（至少3个具体的例子，从简单到复杂，每个例子说明概念如何应用）',
        '9. commonMisconceptions: 常见误解（人们对这个概念的常见误解、错误认知、如何纠正）',
        '10. relatedConcepts: 相关概念（与这个概念相关的其他概念、它们之间的关系、前置知识、延伸学习）',
        '11. realWorldApplications: 现实应用（这个概念在现实世界中的应用场景、行业、具体案例）',
        '12. visualization: 可视化描述（如何用图形/图表/动画来可视化这个概念，详细描述视觉元素）',
        '13. keyInsights: 核心洞见（理解这个概念最关键的3-5个洞见）',
        '14. furtherLearning: 深入学习（如果想深入学习这个概念，推荐的资源、路径、下一步）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.4, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, explanation: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具3：练习题生成器 ==========
export function createExerciseGeneratorTool(deps) {
  return defineTool({
    name: 'exercise_generator',
    description: '练习题生成工具，根据知识点和难度生成练习题，包含题目、答案、解析、难度分级、知识点覆盖。支持选择题、填空题、简答题、编程题、案例分析题等多种题型。',
    schema: {
      topic: { type: 'string', description: '知识点或主题' },
      difficulty: { type: 'string', description: '难度：easy/medium/hard/expert/mixed', default: 'mixed' },
      questionTypes: { type: 'string', description: '题型，逗号分隔：multiple_choice,fill_in_blank,short_answer,essay,coding,case_analysis,true_false,matching', default: 'multiple_choice,short_answer' },
      numQuestions: { type: 'number', description: '题目数量（1-20）', default: 10 },
      includeAnswers: { type: 'boolean', description: '是否包含答案和解析', default: true },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级教育专家和题库设计师。请为以下知识点生成练习题。',
        '知识点：' + args.topic,
        '难度：' + args.difficulty,
        '题型：' + args.questionTypes,
        '题目数量：' + args.numQuestions,
        '包含答案和解析：' + args.includeAnswers,
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. topicOverview: 知识点概述（这个知识点的核心内容、重要性、学习目标）',
        '2. questions: 题目列表（每道题包含：题号、题型、难度1-5、题目内容、选项（如果是选择题）、正确答案、详细解析、考察的知识点、常见错误、解题技巧）',
        '3. difficultyDistribution: 难度分布（各难度题目的数量、占比、设计思路）',
        '4. knowledgeCoverage: 知识点覆盖（这套题覆盖了哪些子知识点、每个子知识点的题目数量、覆盖度评估）',
        '5. answerKey: 答案速查表（所有题目的正确答案快速查表）',
        '6. scoringGuide: 评分标准（各题型的评分方法、给分点、扣分点、总分计算）',
        '7. studyRecommendations: 学习建议（根据这套题的知识点，推荐的学习方法、重点复习内容、延伸学习）',
        '8. timeEstimate: 时间估算（完成这套题的预估时间、各题型的建议用时）',
        '9. passingScore: 及格分数（建议的及格分数、优秀分数、各分数段对应的能力水平）',
        '10. improvementPlan: 提升计划（如果做错了某类题，应该如何针对性提升、补充练习建议）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, exercises: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具4：创意头脑风暴器 ==========
export function createBrainstormEngineTool(deps) {
  return defineTool({
    name: 'brainstorm_engine',
    description: '创意头脑风暴工具，对一个主题或问题进行多角度、多维度的创意发散，生成大量创意想法，并进行筛选、组合、优化。支持随机联想、逆向思维、跨界迁移、强制关联等多种创意方法。',
    schema: {
      topic: { type: 'string', description: '头脑风暴的主题或问题' },
      goal: { type: 'string', description: '头脑风暴的目标：ideas/solutions/names/features/content/other', default: 'ideas' },
      quantity: { type: 'number', description: '生成想法的数量（10-100）', default: 30 },
      creativityLevel: { type: 'string', description: '创意程度：practical/creative/wild/absurd/mixed', default: 'creative' },
      constraints: { type: 'string', description: '约束条件（可选，如预算、时间、技术限制等）', default: '' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级创意大师和头脑风暴引导者。请对以下主题进行创意头脑风暴。',
        '主题：' + args.topic,
        '目标：' + args.goal,
        '想法数量：至少' + args.quantity + '个',
        '创意程度：' + args.creativityLevel,
        args.constraints ? '约束条件：' + args.constraints : '',
        '',
        '请使用多种创意方法：随机联想、逆向思维、跨界迁移、强制关联、SCAMPER、六顶思考帽、类比启发、问题重构等。',
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. problemReframing: 问题重构（从不同角度重新定义这个问题/主题，至少5种不同的问题定义）',
        '2. ideas: 创意想法列表（每个想法包含：编号、想法名称、详细描述、创意类型、可行性评分1-10、创新性评分1-10、价值评分1-10、所需资源、潜在风险、实施难度）',
        '3. ideaCategories: 想法分类（将所有想法按类别分组，每个类别的名称、想法数量、特点、代表想法）',
        '4. topIdeas: 最佳想法（综合评分最高的前10个想法，每个附详细的实施建议、预期效果、关键成功因素）',
        '5. wildIdeas: 疯狂想法（最具创新性、最大胆、最不可能但最有启发性的想法，分析它们为什么疯狂、有什么启发、如何变得可行）',
        '6. combinations: 想法组合（将不同想法进行组合，产生新的创意，至少10个组合，每个组合说明组合了哪些想法、产生了什么新创意）',
        '7. inspirationSources: 灵感来源（这些想法的灵感来源、跨界参考、类比对象、可以从哪些领域获得更多灵感）',
        '8. evaluationMatrix: 评估矩阵（对所有想法进行多维度评估：创新性、可行性、价值、成本、风险、时间，给出综合排名）',
        '9. nextSteps: 下一步行动（如何筛选、验证、实施这些想法、具体的行动计划、优先级排序）',
        '10. creativeTechniques: 创意技巧（本次使用了哪些创意技巧、每个技巧的效果、如何在未来更好地使用这些技巧）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.8, maxTokens: 7000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, brainstorm: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具5：故事生成器 ==========
export function createStoryGeneratorTool(deps) {
  return defineTool({
    name: 'story_generator',
    description: '故事生成工具，根据主题、风格、角色等参数生成完整的故事，包含情节、人物、对话、场景描写等。支持多种文体和风格，可以生成长篇大纲或短篇完整故事。',
    schema: {
      theme: { type: 'string', description: '故事主题或核心概念' },
      genre: { type: 'string', description: '故事类型：fantasy/scifi/romance/mystery/horror/adventure/realistic/fable/other', default: 'realistic' },
      style: { type: 'string', description: '写作风格：literary/popular/minimalist/descriptive/humorous/dramatic/other', default: 'popular' },
      length: { type: 'string', description: '故事长度：flash/short/medium/long/outline', default: 'short' },
      characters: { type: 'string', description: '主要角色描述（可选）', default: '' },
      setting: { type: 'string', description: '故事背景/场景（可选）', default: '' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const lengthMap = {
        flash: '微小说（500字以内，一个场景，一个转折）',
        short: '短篇小说（1000-3000字，完整的起承转合）',
        medium: '中篇小说（5000-10000字，丰富的情节和人物）',
        long: '长篇大纲（详细的章节大纲，每章的情节和人物发展）',
        outline: '故事大纲（整体框架、主要情节线、人物弧光、关键场景）',
      };
      const prompt = [
        '你是世界级作家和故事大师。请根据以下参数创作一个故事。',
        '主题：' + args.theme,
        '类型：' + args.genre,
        '风格：' + args.style,
        '长度：' + (lengthMap[args.length] || lengthMap.short),
        args.characters ? '主要角色：' + args.characters : '',
        args.setting ? '故事背景：' + args.setting : '',
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. title: 故事标题（至少3个备选标题，每个附简短说明）',
        '2. logline: 一句话故事（用一句话概括整个故事的核心冲突和主题）',
        '3. premise: 故事前提（故事的核心设定、世界观、基本规则）',
        '4. characters: 角色设定（主要角色的详细设定：姓名、年龄、外貌、性格、背景、动机、目标、冲突、人物弧光）',
        '5. setting: 场景设定（故事发生的时间、地点、环境、氛围、文化背景）',
        '6. plotStructure: 情节结构（按三幕式/英雄之旅/其他结构，列出每个部分的关键情节、转折点、高潮、结局）',
        '7. story: 完整故事（完整的故事文本，包含场景描写、人物对话、心理描写、动作描写，按长度要求）',
        '8. keyScenes: 关键场景（故事中最重要的3-5个场景，每个场景的详细描写、为什么重要、对情节和人物的影响）',
        '9. themes: 主题分析（故事探讨的主题、象征意义、深层含义、对读者的启示）',
        '10. writingTechniques: 写作技巧（故事中使用的写作技巧、修辞手法、叙事手法、为什么这样写、效果如何）',
        '11. alternatives: 备选结局（至少2个不同的结局，每个结局的特点、对主题的影响、读者感受）',
        '12. sequelIdeas: 续集想法（如果写续集，可以有哪些方向、新的冲突、人物发展）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.7, maxTokens: 8000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, story: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 工具6：翻译与本地化工具 ==========
export function createTranslationLocalizerTool(deps) {
  return defineTool({
    name: 'translation_localizer',
    description: '翻译与本地化工具，不仅是语言翻译，更是文化本地化。考虑目标语言的文化背景、习惯表达、俚语、正式程度，提供自然、地道、符合当地文化的翻译。支持多种文体和场景。',
    schema: {
      text: { type: 'string', description: '要翻译的文本' },
      sourceLanguage: { type: 'string', description: '源语言：zh/en/ja/ko/fr/de/es/ru/auto', default: 'auto' },
      targetLanguage: { type: 'string', description: '目标语言：zh/en/ja/ko/fr/de/es/ru/other', default: 'en' },
      context: { type: 'string', description: '翻译上下文/场景（如：商务邮件、文学作品、技术文档、广告文案、日常对话等）', default: 'general' },
      formality: { type: 'string', description: '正式程度：formal/neutral/informal/slang', default: 'neutral' },
      localizationLevel: { type: 'string', description: '本地化程度：literal/natural/cultural/fulllocal', default: 'cultural' },
    },
    async execute(exec, args) {
      const route = routeOf(exec, deps);
      const prompt = [
        '你是世界级翻译专家和本地化顾问。请将以下文本从' + args.sourceLanguage + '翻译为' + args.targetLanguage + '。',
        '翻译场景：' + args.context,
        '正式程度：' + args.formality,
        '本地化程度：' + args.localizationLevel,
        '',
        '【原文】',
        clip(args.text, 8000),
        '',
        '请输出严格 JSON，包含以下字段：',
        '1. sourceAnalysis: 原文分析（原文的语言特点、文体风格、文化元素、难点、需要特别注意的地方）',
        '2. literalTranslation: 直译版本（严格按照字面意思翻译，保留原文结构，用于对比）',
        '3. naturalTranslation: 自然翻译（符合目标语言表达习惯的自然翻译，流畅地道）',
        '4. localizedTranslation: 本地化翻译（考虑目标文化背景，对文化元素、俚语、典故进行本地化处理，让目标读者感觉是母语者写的）',
        '5. recommendedTranslation: 推荐翻译（综合考虑所有因素，推荐的最佳翻译版本，附推荐理由）',
        '6. translationNotes: 翻译说明（关键翻译决策的说明、难点的处理、文化元素的转换、为什么这样翻译）',
        '7. culturalNotes: 文化注释（原文中的文化元素、在目标文化中的对应物、需要读者了解的文化背景知识）',
        '8. alternatives: 备选翻译（至少3个不同风格的备选翻译，每个的特点、适用场景）',
        '9. terminology: 术语表（关键术语的翻译、在不同场景下的不同译法、行业标准译法）',
        '10. styleGuide: 风格指南（这类文本在目标语言中的写作风格指南、常用表达、避免的用法）',
        '11. qualityAssessment: 质量评估（从准确性、流畅性、地道性、文化适配性等维度评估翻译质量，给出评分和改进建议）',
        '12. glossary: 词汇对照表（原文关键词与译文的对照表，便于后续翻译保持一致性）',
      ].join('\n');
      const r = await maxJson(deps.llm, { ...route, prompt, temperature: 0.3, maxTokens: 6000 });
      if (!r.ok) return { ok: false, error: r.reason };
      return { ok: true, translation: r.json, raw: clip(r.text, 8000) };
    },
  });
}

// ========== 导出所有工具 ==========
export function createLearningCreativeTools(deps) {
  return [
    createLearningPathPlannerTool(deps),
    createConceptExplainerTool(deps),
    createExerciseGeneratorTool(deps),
    createBrainstormEngineTool(deps),
    createStoryGeneratorTool(deps),
    createTranslationLocalizerTool(deps),
  ];
}
