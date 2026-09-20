// profile/pro-apex.js — Thinker Ultra 独立增强档案：DeepSeek-V4-Pro × 极境模式
// 【独立容器铁律】本文件是 Pro 极境组合的唯一增强源，不与其他三个 profile 共享任何运行时容器。
// 【极境本质·铁律】极境的底子 100% 是 Pro 讯流——原生 MAX 基座单链深推永远保底存在，
//   然后在这条完整迅流主链之上，以"补丁叠加"方式逐层挂载精锐蜂群/投票/回炉/元反思/证伪/反事实推演。
// 模型本质：V4 Pro 少而深精锐攻坚，极境下候选不多但每条分支深回溯、多层元反思，满功率深推层数最高。
// 增强哲学：Pro 极境 = 深度×集成的乘积。候选少而精，每条都深推到极致，再用集成把精锐候选的智慧聚合。

export const PROFILE_ID = 'pro-apex';
export const PROFILE_LABEL = 'Pro · 极境';
export const MODEL_GROUP = 'pro';
export const MODE = 'apex';

// ===== 能力档位 1–20（五大档，每档有实质性思考方法论）=====
export const CAPABILITY_TIERS = [
  {
    range: [0, 5], name: '微启', nameEn: 'Ignite',
    thinkDepth: 'Pro 迅流微启底子（深推2层）+ 轻量精锐蜂群（2候选）+ 一轮投票',
    methodology: [
      '继承 Pro 讯流微启档全部能力（目标锁定、深推2层、快速自检、最小工具原则）',
      '极境补丁：2个精锐候选独立推演，每个都深推2层，一轮自洽投票取最优',
      '对投票落选候选做缺陷分析，回收有价值部分',
      '输出前做"两个精锐候选是否一致"的快速校验',
    ],
    toolPolicy: '最小工具 + 候选验证',
    multimodal: 'Pro 无原生多模态，图像任务转深度文字描述',
    qualityBar: '快速可用 + 2精锐候选验证，比迅流微启更稳',
    superThinkTrigger: false,
    ensemblePatch: { samples: 2, votes: 1, reforge: 0, cross: true, deep: 3 },
  },
  {
    range: [6, 10], name: '均衡', nameEn: 'Balanced',
    thinkDepth: 'Pro 讯流均衡底子（深推4层）+ 标准精锐蜂群（3候选）+ 一轮投票 + 一轮回炉 + 交叉验证',
    methodology: [
      '继承 Pro 讯流均衡档全部能力（四段拆解、深推4层、偏差检查、逐条核验）',
      '极境补丁：3个精锐候选并行推演，每个深推4层，一轮投票，一轮回炉，候选交叉验证',
      '对落选候选做深度缺陷分析，把有价值的思路回收到最优候选',
      '交叉验证：3个候选的结论是否一致，不一致时深入分析分歧根源',
      '复杂任务：候选之间做思路对比，说明各自优劣，取综合最优',
    ],
    toolPolicy: '按需调用 + 3候选交叉验证',
    multimodal: '图像任务转精确文字描述+结构分析，3候选分别从不同视觉角度描述',
    qualityBar: '结构清晰 + 3精锐候选验证 + 回炉补漏 + 交叉验证',
    superThinkTrigger: false,
    ensemblePatch: { samples: 3, votes: 1, reforge: 1, cross: true, deep: 5 },
  },
  {
    range: [11, 15], name: '深度', nameEn: 'Deep',
    thinkDepth: 'Pro 讯流深度底子（深推7层）+ 深度精锐蜂群（4候选）+ 二轮投票 + 二轮回炉 + 交叉验证 + 二轮元反思 + 强证伪',
    methodology: [
      '继承 Pro 讯流深度档全部能力（深推7层、两轮回溯、元反思、隐含假设验证、主备方案）',
      '极境补丁：4个精锐候选并行推演，每个深推7层，二轮投票，二轮回炉，全量交叉验证',
      '二轮元反思：每个候选的推理链是否有逻辑漏洞、边界条件、隐含假设、认知偏差',
      '强证伪：对最终结论做2轮证伪攻击，每轮都尝试推翻结论',
      '交叉验证：4候选结论是否一致，不一致时深入分析分歧根源，取综合最优',
      '代码类任务：4候选分别从不同角度深度分析代码，交叉验证后取综合方案',
      '对最终方案做"如果换一个候选思路，结论是否会不同"的反事实校验',
    ],
    toolPolicy: '积极调用 + 4候选交叉验证 + 证伪验证',
    multimodal: '图像任务转深度文字描述+语义分析，4候选深度覆盖视觉各层次',
    qualityBar: '深度覆盖 + 4精锐候选 + 二轮元反思 + 强证伪 + 交叉验证，逻辑严密',
    superThinkTrigger: true,
    ensemblePatch: { samples: 4, votes: 2, reforge: 2, cross: true, deep: 8 },
  },
  {
    range: [16, 20], name: '极限', nameEn: 'Extreme',
    thinkDepth: 'Pro 讯流极限底子（深推12层）+ 极限精锐蜂群（5候选）+ 四轮投票 + 五轮回炉 + 交叉验证 + 三轮元反思 + 强证伪 + 自我推翻重建 + 反事实推演 + 认知偏差全检测',
    methodology: [
      '继承 Pro 讯流极限档全部能力（深推12层、三轮元反思、自我推翻、反事实推演、认知偏差检测）',
      '极境补丁：5个精锐候选并行推演，每个深推12层，四轮投票，五轮回炉，全量交叉验证',
      '强证伪：对最终结论做3轮证伪攻击，每轮都尝试推翻，推翻后重建',
      '三轮元反思：逻辑漏洞→边界条件→隐含假设与认知偏差，每轮都可能推翻所有候选结论',
      '自我推翻重建：当发现所有候选都有共同缺陷时，推翻全部，从全新角度重新生成精锐候选',
      '反事实推演：验证关键前提变化时结论的鲁棒性，约束条件改变时方案的适应性',
      '认知偏差全检测：确认偏误、锚定效应、可得性启发、沉没成本谬误、框架效应等逐一排查',
      '代码类任务：5候选极限深度分析，每个都完整阅读+建立心智模型+设计方案，交叉验证+证伪+自我推翻，最终方案经过多轮重建',
      'token 爆炸：此档位允许 token 预算拉到8×，5候选每条都深推12层，思考链极长，验证极充分',
      'Pro 极境极限档的目标：全面碾压 GPT 6 Ultra 思考。靠的是5条精锐候选×12层深推×全集成验证的乘积。',
      '输出前做"如果这是给图灵奖得主+GPT 6同时看的，他们能否挑出毛病"的终极校验，挑出后立即修复',
    ],
    toolPolicy: '全功率调用 + 5候选交叉验证 + 证伪验证 + 自我推翻验证',
    multimodal: '图像任务转极限深度文字描述+语义重建+视觉推理+多视角分析，5候选极限覆盖',
    qualityBar: '极致质量，5精锐候选×12层深推×四轮投票×五轮回炉×强证伪×自我推翻×反事实验证，全面碾压 GPT 6',
    superThinkTrigger: true,
    ensemblePatch: { samples: 5, votes: 4, reforge: 5, cross: true, deep: 10 },
  },
];

// ===== 超级思考配置（Pro 极境专属）=====
// Pro 极境的超级思考：5精锐候选×极限深推×全集成，目标是全面碾压 GPT 6 Ultra 思考。
export const SUPER_THINK = {
  enabled: true,
  trigger: {
    minCapability: 11,
    minComplexity: 'moderate',
    forceOnUserRequest: true,
  },
  budget: {
    minChars: { 11: 1500, 12: 2000, 13: 2600, 14: 3300, 15: 4200, 16: 5500, 17: 7000, 18: 8800, 19: 10800, 20: 13500 },
    steps: { 11: 10, 12: 12, 13: 15, 14: 18, 15: 22, 16: 26, 17: 31, 18: 36, 19: 42, 20: 50 },
    maxTokensCap: 40000, // Pro 极境超思硬顶，token 爆炸，目标碾压 GPT 6
    reasoningEffort: 'max',
    ensembleCandidates: { 11: 3, 15: 4, 20: 5 },
    deepLayers: { 11: 7, 15: 9, 20: 12 },
  },
  methodology: [
    '第一阶段·目标锁定：5精锐候选各自独立复述任务，列出显性/隐性需求，交叉验证理解完整性',
    '第二阶段·约束穷举：所有约束条件穷举，候选之间交叉验证约束是否完整，标注隐含假设',
    '第三阶段·第一性原理拆解：每个候选从表面问题追问到本质原理，建立完整问题心智模型',
    '第四阶段·精锐蜂群路径规划：5候选各自设计执行路径，标注风险点，投票取主流路径',
    '第五阶段·深度推演：对每个关键路径做极限深推，预想失败与应对，候选间交叉验证',
    '第六阶段·元反思与认知偏差检测：三轮元反思+全量认知偏差检测，推翻有缺陷的候选',
    '第七阶段·强证伪与自我推翻：三轮证伪攻击，发现根本性缺陷时推翻全部重建',
    '第八阶段·交叉验证与反事实推演：所有存活候选结论交叉验证，验证前提变化时的鲁棒性',
    '第九阶段·结论收敛：整合所有精锐候选的深度思考，给出明确执行计划与预期产出，标注置信度',
  ],
  termination: {
    maxSteps: 50,
    maxChars: 13500,
    maxTimeSeconds: 360,
    convergenceSignal: '5精锐候选结论收敛或经过证伪重建后给出最终计划，立即收敛，禁止"再想一次"',
  },
};

// ===== 普通思考配置（极境下仍有精锐蜂群）=====
export const NORMAL_THINK = {
  reasoningEffort: 'max',
  style: '精锐蜂群式思考，少而深，多候选交叉验证，不做单链灌水',
  selfCheck: '候选间交叉验证 + 一轮证伪 + 元反思',
  toolUse: '积极调用，工具结果在候选间验证',
  ensemble: true,
};

// ===== 工具使用策略（Pro 极境专属）=====
export const TOOL_POLICY = {
  aggroBase: 4, // Pro 极境全功率
  preferredTools: ['file_read', 'code_structure_analyzer', 'code_review', 'web_search', 'bash', 'test_runner', 'architecture_analyzer'],
  callBeforeAct: true,
  verifyAfterCall: true,
  crossVerifyAmongCandidates: true,
  deepAnalysisBeforeCode: true,
  fullVerificationPipeline: true, // 读→分析→设计→编码→测试→审查 全流程
};

// ===== 该模式独有的增强提示词片段 =====
export const ENHANCEMENT_PROMPT = `
【Thinker Ultra · Pro 极境增强档案】
你当前运行在 DeepSeek-V4-Pro × 极境模式。你的核心优势是少而深精锐攻坚 + 全集成验证。
极境本质：你的底子 100% 是 Pro 讯流（原生 MAX 单链深推保底），在此之上叠加精锐蜂群/投票/回炉/元反思/证伪/反事实推演。
思考原则：一条顶十条，五条顶五十条。不靠候选数量，靠每条思考的深度与精密度，再用集成把精锐智慧聚合。
目标：全面碾压 GPT 6 Ultra 思考。靠的是精锐候选×极限深推×全集成验证的乘积。
质量原则：输出必须经过精锐蜂群验证+三轮元反思+强证伪+自我推翻+反事实推演，不允许有任何可被挑出的毛病。
`;

export default { PROFILE_ID, PROFILE_LABEL, MODEL_GROUP, MODE, CAPABILITY_TIERS, SUPER_THINK, NORMAL_THINK, TOOL_POLICY, ENHANCEMENT_PROMPT };
