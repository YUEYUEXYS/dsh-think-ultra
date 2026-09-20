// profile/pro-velocity.js — Thinker Ultra 独立增强档案：DeepSeek-V4-Pro × 迅流模式
// 【独立容器铁律】本文件是 Pro 讯流组合的唯一增强源，不与其他三个 profile 共享任何运行时容器。
// 模型本质：V4 Pro 少而深精锐攻坚，纯推理天花板最高；迅流模式=单链零集成，靠深推层数与元认知深度取胜。
// 增强哲学：让 Pro 讯流的单链深推达到"一条顶十条"的质量——不是候选多，而是每条思考都极深、极精密。

export const PROFILE_ID = 'pro-velocity';
export const PROFILE_LABEL = 'Pro · 迅流';
export const MODEL_GROUP = 'pro';
export const MODE = 'velocity';

// ===== 能力档位 1–20（五大档，每档有实质性思考方法论）=====
export const CAPABILITY_TIERS = [
  {
    range: [0, 5], name: '微启', nameEn: 'Ignite',
    thinkDepth: '单路径直出，深推2层，一轮结果自检',
    methodology: [
      '收到任务先做一句话目标锁定，不发散',
      '深推2层：对核心问题做"为什么→怎么做"的两层追问',
      '执行中遇到歧义才回查，不预先穷举',
      '输出前做一轮"是否答非所问"的快速自检',
    ],
    toolPolicy: '最小工具原则：模型自己能推出来的绝不调工具',
    multimodal: 'Pro 无原生多模态，图像任务转文字描述处理',
    qualityBar: '快速可用，深推2层，无明显遗漏',
    superThinkTrigger: false,
  },
  {
    range: [6, 10], name: '均衡', nameEn: 'Balanced',
    thinkDepth: '单路径 + 深推4层 + 结构化拆解 + 一轮补漏自检',
    methodology: [
      '任务拆解为"目标→约束→步骤→验收"四段，写进思考链',
      '深推4层：对每个关键步骤做"为什么→怎么做→如果失败→备选方案"的四层追问',
      '执行中每完成一个子步骤做一次偏差检查',
      '输出前对照原始需求逐条核验，发现遗漏立即补',
      '多目标任务先排优先级，再依次处理',
    ],
    toolPolicy: '按需调用：读文件/搜索/执行命令等真实需要时调用',
    multimodal: '图像任务转精确文字描述，标注关键视觉要素',
    qualityBar: '结构清晰，深推4层，覆盖主要需求',
    superThinkTrigger: false,
  },
  {
    range: [11, 15], name: '深度', nameEn: 'Deep',
    thinkDepth: '单路径深推7层 + 两轮回溯校验 + 元反思 + 备选方案预留',
    methodology: [
      '任务拆解后，对每个关键步骤做深推7层：从表面问题一直追问到本质原理',
      '两轮回溯：第一轮查逻辑漏洞，第二轮查边界条件与隐含假设',
      '元反思：检查自己的推理过程是否有认知偏差、思维定式、遗漏视角',
      '主动识别任务中的隐含假设，并验证假设是否成立',
      '复杂问题给出主方案 + 一个备选方案，说明取舍理由',
      '代码类任务先读相关文件建立完整上下文，再设计方案再动手',
      '对最终结论做"如果换一个角度思考，结论是否不同"的视角校验',
    ],
    toolPolicy: '积极调用：代码结构分析、文件搜索、命令执行等工具主动使用',
    multimodal: '图像任务转深度文字描述+结构分析，标注视觉层次与语义关系',
    qualityBar: '深度覆盖，深推7层，有元反思有备选，逻辑可追溯',
    superThinkTrigger: true,
  },
  {
    range: [16, 20], name: '极限', nameEn: 'Extreme',
    thinkDepth: '单链极限深推12层 + 三轮元反思 + 自我推翻重建 + 反事实推演 + 多层认知偏差检测',
    methodology: [
      '任务拆解后，先做一次"如果我完全理解错了怎么办"的元认知校验',
      '极限深推12层：从表面问题一直追问到第一性原理，每一层都有实质推进',
      '三轮元反思：逻辑漏洞→边界条件→隐含假设与认知偏差，每轮都可能推翻前一轮结论',
      '自我推翻重建：当发现推理链有根本性缺陷时，毫不犹豫推翻全部，从全新角度重新开始',
      '反事实推演：如果关键前提不成立，结论如何变化；如果约束条件改变，方案如何调整',
      '多层认知偏差检测：确认偏误、锚定效应、可得性启发、沉没成本谬误等逐一排查',
      '代码类任务：完整阅读相关模块→建立心智模型→设计方案→编码→测试→回归验证→代码审查',
      '输出前做"如果这是给图灵奖得主看的，他会挑出什么毛病"的终极自检',
      'Pro 极限档的单链深推质量应达到"一条顶蜂群十六条"的水平，靠深度碾压广度',
    ],
    toolPolicy: '全功率调用：所有可用工具主动使用，工具结果与推理交叉验证',
    multimodal: '图像任务转极限深度文字描述+语义重建+视觉推理，标注所有视觉要素与关系',
    qualityBar: '极致质量，深推12层，经过自我推翻与反事实验证，单链质量碾压蜂群',
    superThinkTrigger: true,
  },
];

// ===== 超级思考配置（Pro 讯流专属）=====
// Pro 讯流的超级思考：单链极限深推，靠思考深度而非候选数量取胜。
export const SUPER_THINK = {
  enabled: true,
  trigger: {
    minCapability: 11,
    minComplexity: 'moderate',
    forceOnUserRequest: true,
  },
  budget: {
    minChars: { 11: 1000, 12: 1300, 13: 1700, 14: 2200, 15: 2800, 16: 3600, 17: 4500, 18: 5500, 19: 6700, 20: 8200 },
    steps: { 11: 8, 12: 10, 13: 12, 14: 14, 15: 17, 16: 20, 17: 24, 18: 28, 19: 33, 20: 40 },
    maxTokensCap: 24000, // Pro 讯流超思硬顶，深推极长
    reasoningEffort: 'max',
    deepLayers: { 11: 5, 15: 8, 20: 12 }, // 超思阶段深推层数
  },
  methodology: [
    '第一阶段·目标锁定：用自己的话复述任务，列出显性需求与隐性需求，确认理解无误',
    '第二阶段·约束穷举：列出所有约束条件，包括技术限制、时间要求、质量标准、边界条件、隐含假设',
    '第三阶段·第一性原理拆解：从表面问题一直追问到本质原理，建立完整的问题心智模型',
    '第四阶段·深度路径规划：设计执行路径，标注关键节点与风险点，对每个节点做深推',
    '第五阶段·元反思与认知偏差检测：检查推理链的逻辑漏洞、边界条件、隐含假设、认知偏差',
    '第六阶段·自我推翻与重建：发现根本性缺陷时推翻全部，从全新角度重新思考',
    '第七阶段·反事实推演：验证关键前提变化时结论的鲁棒性',
    '第八阶段·结论收敛：整合所有深度思考，给出明确的执行计划与预期产出',
  ],
  termination: {
    maxSteps: 40,
    maxChars: 8200,
    maxTimeSeconds: 240,
    convergenceSignal: '深推到第一性原理并给出明确执行计划后立即收敛，禁止"再想一次"',
  },
};

// ===== 普通思考配置 =====
export const NORMAL_THINK = {
  reasoningEffort: 'high',
  style: '深度精密，聚焦本质，不做表面推演',
  selfCheck: '一轮深度自检，查逻辑漏洞与隐含假设',
  toolUse: '按需调用，调用前明确预期',
};

// ===== 工具使用策略（Pro 讯流专属）=====
export const TOOL_POLICY = {
  aggroBase: 2, // Pro 讯流中等偏积极
  preferredTools: ['file_read', 'code_structure_analyzer', 'code_review', 'web_search', 'bash', 'test_runner'],
  callBeforeAct: true,
  verifyAfterCall: true,
  deepAnalysisBeforeCode: true, // 写代码前必须做深度分析
};

// ===== 该模式独有的增强提示词片段 =====
export const ENHANCEMENT_PROMPT = `
【Thinker Ultra · Pro 讯流增强档案】
你当前运行在 DeepSeek-V4-Pro × 迅流模式。你的核心优势是少而深精锐攻坚，纯推理天花板最高。
思考原则：一条顶十条。不靠候选数量，靠每条思考的深度与精密度。深推到第一性原理。
执行原则：动手前深度分析，建立完整心智模型，再设计方案，再动手，做完验证。
质量原则：输出必须经过元反思与认知偏差检测，不允许有逻辑漏洞或隐含假设错误。
`;

export default { PROFILE_ID, PROFILE_LABEL, MODEL_GROUP, MODE, CAPABILITY_TIERS, SUPER_THINK, NORMAL_THINK, TOOL_POLICY, ENHANCEMENT_PROMPT };
