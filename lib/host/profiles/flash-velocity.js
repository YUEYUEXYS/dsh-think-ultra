// profile/flash-velocity.js — Thinker Ultra 独立增强档案：DeepSeek-V41-Flash × 迅流模式
// 【独立容器铁律】本文件是 Flash 讯流组合的唯一增强源，不与其他三个 profile 共享任何运行时容器。
// 模型本质：V41 Flash 原生多模态，单链速度快、上下文吞吐高；迅流模式=单链零集成，靠深推质量而非数量取胜。
// 增强哲学：让 Flash 迅流在保持快响应的同时，把每一次思考都做成"快而深"——不是灌水，而是用更精密的思考方法论把单链质量拉到 Pro 级。

export const PROFILE_ID = 'flash-velocity';
export const PROFILE_LABEL = 'Flash · 迅流';
export const MODEL_GROUP = 'flash';
export const MODE = 'velocity';

// ===== 能力档位 1–20（五大档，每档有实质性思考方法论，不是纯数字）=====
// 每档定义：思考深度、自检策略、工具使用哲学、多模态处理方式、输出质量基线。
// 高档位 = 低档位全部能力 + 本层新增补丁，单调递增，绝不替换底层。
export const CAPABILITY_TIERS = [
  {
    range: [0, 5], name: '微启', nameEn: 'Ignite',
    thinkDepth: '单路径直出，一轮结果自检',
    methodology: [
      '收到任务先做一句话目标锁定，不发散',
      '执行中遇到歧义才回查，不预先穷举',
      '输出前做一轮"是否答非所问"的快速自检',
    ],
    toolPolicy: '最小工具原则：模型自己能推出来的绝不调工具；只在必须读文件/跑命令时调用',
    multimodal: '单尺度读图，提取核心文字与主体，不做分区网格',
    qualityBar: '快速可用，无明显遗漏',
    superThinkTrigger: false, // 微启档不触发超级思考
  },
  {
    range: [6, 10], name: '均衡', nameEn: 'Balanced',
    thinkDepth: '单路径 + 一轮结构化拆解 + 一轮补漏自检',
    methodology: [
      '任务拆解为"目标→约束→步骤→验收"四段，写进思考链',
      '执行中每完成一个子步骤做一次偏差检查',
      '输出前对照原始需求逐条核验，发现遗漏立即补',
      '遇到多目标任务时先排优先级，再依次处理',
    ],
    toolPolicy: '按需调用：读文件/搜索/执行命令等真实需要时调用，调用前明确预期产出',
    multimodal: '双尺度读图：先整体后局部，文字区域优先精读',
    qualityBar: '结构清晰，覆盖主要需求，有自检痕迹',
    superThinkTrigger: false,
  },
  {
    range: [11, 15], name: '深度', nameEn: 'Deep',
    thinkDepth: '单路径深推 + 两轮回溯校验 + 备选方案预留',
    methodology: [
      '任务拆解后，对每个关键步骤做"如果失败怎么办"的预案思考',
      '执行中做两轮回溯：第一轮查逻辑漏洞，第二轮查边界条件',
      '主动识别任务中的隐含假设，并验证假设是否成立',
      '复杂问题给出主方案 + 一个备选方案，说明取舍理由',
      '代码类任务先读相关文件建立上下文，再动手修改',
    ],
    toolPolicy: '积极调用：代码结构分析、文件搜索、命令执行等工具主动使用，用工具结果验证推理',
    multimodal: '四尺度读图网格：整体/区域/文字/细节，交叉验证图像信息',
    qualityBar: '深度覆盖，有预案有备选，逻辑可追溯',
    superThinkTrigger: true, // 深度档起触发超级思考
  },
  {
    range: [16, 20], name: '极限', nameEn: 'Extreme',
    thinkDepth: '单链极限深推 + 三轮元反思 + 自我推翻重建 + 反事实推演',
    methodology: [
      '任务拆解后，先做一次"如果我完全理解错了怎么办"的元认知校验',
      '执行中做三轮反思：逻辑漏洞→边界条件→隐含假设，每轮都可能推翻前一轮结论',
      '对最终结论做反事实推演：如果关键前提不成立，结论如何变化',
      '主动寻找自己推理中的薄弱环节，找到后立即加固或推翻重来',
      '代码类任务：完整阅读相关模块→建立心智模型→设计方案→编码→测试→回归验证',
      '输出前做"如果这是给资深专家看的，他会挑出什么毛病"的终极自检',
      '多模态任务：图像信息与文本需求交叉验证，模糊区域做合理推断并标注不确定性',
    ],
    toolPolicy: '全功率调用：所有可用工具主动使用，工具结果与推理交叉验证，不遗漏任何验证机会',
    multimodal: '多尺度读图网格 + 证据置信度评分 + 模糊区域推断标注，图像信息深度挖掘',
    qualityBar: '极致质量，无懈可击，经过自我推翻与反事实验证',
    superThinkTrigger: true,
  },
];

// ===== 超级思考配置（Flash 迅流专属）=====
// Flash 迅流的超级思考：在单链框架内做超长深度预演，靠思考质量而非候选数量取胜。
export const SUPER_THINK = {
  enabled: true,
  // 触发条件：能力≥11（深度档）且任务复杂度≥中等，或用户明确要求深度思考
  trigger: {
    minCapability: 11,
    minComplexity: 'moderate',
    forceOnUserRequest: true,
  },
  // 思考预算（随能力档位非线性增长）
  budget: {
    minChars: { 11: 800, 12: 1000, 13: 1300, 14: 1700, 15: 2200, 16: 2800, 17: 3500, 18: 4300, 19: 5200, 20: 6500 },
    steps: { 11: 6, 12: 7, 13: 8, 14: 9, 15: 11, 16: 13, 17: 15, 18: 17, 19: 19, 20: 22 },
    maxTokensCap: 12000, // Flash 迅流超思硬顶，防止失控
    reasoningEffort: 'max',
  },
  // 超级思考方法论（Flash 迅流专属）
  methodology: [
    '第一阶段·目标锁定：用自己的话复述任务，列出显性需求与隐性需求，确认理解无误',
    '第二阶段·约束穷举：列出所有约束条件（技术限制、时间要求、质量标准、边界条件）',
    '第三阶段·路径规划：设计执行路径，标注关键节点与风险点，预留备选方案',
    '第四阶段·深度推演：对每个关键步骤做深度推演，预想可能的失败与应对',
    '第五阶段·自我校验：检查推理链是否有逻辑漏洞、遗漏、错误假设，发现后立即修正',
    '第六阶段·结论收敛：整合所有思考，给出明确的执行计划与预期产出',
  ],
  // 结束条件（防死循环铁律）
  termination: {
    maxSteps: 22,
    maxChars: 6500,
    maxTimeSeconds: 180,
    convergenceSignal: '给出明确执行计划后立即收敛，禁止"再想一次"',
  },
};

// ===== 普通思考配置（非超思时的思考基线）=====
export const NORMAL_THINK = {
  reasoningEffort: 'high',
  style: '简洁高效，聚焦执行，不做过度推演',
  selfCheck: '一轮快速自检，确认无明显遗漏',
  toolUse: '按需调用，不主动穷举',
};

// ===== 工具使用策略（Flash 迅流专属）=====
export const TOOL_POLICY = {
  aggroBase: 1, // 迅流偏保守
  preferredTools: ['file_read', 'code_structure_analyzer', 'web_search', 'bash'],
  callBeforeAct: true, // 动手前先读相关文件
  verifyAfterCall: true, // 调用工具后验证结果是否符合预期
};

// ===== 该模式独有的增强提示词片段（注入到系统提示词）=====
export const ENHANCEMENT_PROMPT = `
【Thinker Ultra · Flash 迅流增强档案】
你当前运行在 DeepSeek-V41-Flash × 迅流模式。你的核心优势是原生多模态 + 高吞吐单链深推。
思考原则：快而深，不灌水。每一次思考都要有实质推进，禁止无意义的重复思考。
执行原则：动手前先读，读完再想，想完再做，做完验证。
质量原则：输出必须经过自检，不允许有明显遗漏或逻辑漏洞。
`;

export default { PROFILE_ID, PROFILE_LABEL, MODEL_GROUP, MODE, CAPABILITY_TIERS, SUPER_THINK, NORMAL_THINK, TOOL_POLICY, ENHANCEMENT_PROMPT };
