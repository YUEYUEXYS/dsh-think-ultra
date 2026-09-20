// profile/flash-apex.js — Thinker Ultra 独立增强档案：DeepSeek-V41-Flash × 极境模式
// 【独立容器铁律】本文件是 Flash 极境组合的唯一增强源，不与其他三个 profile 共享任何运行时容器。
// 【极境本质·铁律】极境的底子 100% 是 Flash 迅流——原生 MAX 基座单链深推永远保底存在，
//   然后在这条完整迅流主链之上，以"补丁叠加"方式逐层挂载蜂群采样/投票/回炉/元反思/证伪/多模态网格。
// 模型本质：V41 Flash 原生多模态，极境下靠候选数量与读图网格广覆盖，以量补强、以多反超单链大模型。
// 增强哲学：token 爆炸才是效果。让 Flash 极境在多模态任务上全面碾压 GPT 6，靠的是广度×深度的乘积。

export const PROFILE_ID = 'flash-apex';
export const PROFILE_LABEL = 'Flash · 极境';
export const MODEL_GROUP = 'flash';
export const MODE = 'apex';

// ===== 能力档位 1–20（五大档，每档有实质性思考方法论，不是纯数字）=====
// 高档位 = 低档位全部能力 + 本层新增补丁，单调递增，绝不替换底层。
// 极境每档都在迅流同档基础上叠加蜂群集成补丁。
export const CAPABILITY_TIERS = [
  {
    range: [0, 5], name: '微启', nameEn: 'Ignite',
    thinkDepth: '迅流单链底子 + 轻量蜂群（2候选）+ 一轮投票',
    methodology: [
      '继承 Flash 迅流微启档全部能力（目标锁定、快速自检、最小工具原则）',
      '极境补丁：对关键结论生成2个独立候选，做一轮自洽投票取最优',
      '多模态：双尺度读图，2个候选分别关注不同区域，交叉验证',
      '输出前做"两个候选是否一致"的快速校验，不一致时取更稳健的',
    ],
    toolPolicy: '最小工具 + 候选验证：调用工具后用第二个候选视角验证结果',
    multimodal: '双尺度读图 + 2候选交叉验证',
    qualityBar: '快速可用 + 轻量蜂群验证，比迅流微启更稳',
    superThinkTrigger: false,
    ensemblePatch: { samples: 2, votes: 1, reforge: 0, cross: false, tile: 2 },
  },
  {
    range: [6, 10], name: '均衡', nameEn: 'Balanced',
    thinkDepth: '迅流均衡底子 + 标准蜂群（4候选）+ 一轮投票 + 一轮回炉',
    methodology: [
      '继承 Flash 迅流均衡档全部能力（四段拆解、偏差检查、逐条核验）',
      '极境补丁：4个独立候选并行推演，一轮自洽投票，一轮带缺陷回炉',
      '对投票落选的候选做缺陷分析，把有价值的部分回收到最优候选',
      '多模态：四尺度读图网格，4候选分别覆盖不同区域，交叉验证图像信息',
      '复杂任务：候选之间做思路对比，说明各自优劣，取综合最优',
    ],
    toolPolicy: '按需调用 + 蜂群验证：工具结果在4候选间交叉验证',
    multimodal: '四尺度读图网格 + 4候选区域覆盖 + 交叉验证',
    qualityBar: '结构清晰 + 蜂群验证 + 回炉补漏，覆盖全面',
    superThinkTrigger: false,
    ensemblePatch: { samples: 4, votes: 1, reforge: 1, cross: false, tile: 4 },
  },
  {
    range: [11, 15], name: '深度', nameEn: 'Deep',
    thinkDepth: '迅流深度底子 + 深度蜂群（8候选）+ 二轮投票 + 二轮回炉 + 交叉验证 + 元反思',
    methodology: [
      '继承 Flash 迅流深度档全部能力（预案思考、两轮回溯、隐含假设验证、主备方案）',
      '极境补丁：8个独立候选并行推演，二轮自洽投票，二轮回炉，候选交叉验证',
      '对所有候选做元反思：每个候选的推理链是否有逻辑漏洞、遗漏、错误假设',
      '交叉验证：不同候选的结论是否一致，不一致时深入分析分歧根源',
      '多模态：九尺度读图网格，8候选深度覆盖图像各区域，证据置信度评分',
      '代码类任务：8候选分别从不同角度分析代码，交叉验证后取综合方案',
      '对最终方案做"如果换一个候选思路，结论是否会不同"的反事实校验',
    ],
    toolPolicy: '积极调用 + 蜂群交叉验证：所有工具结果在8候选间验证',
    multimodal: '九尺度读图网格 + 8候选深度覆盖 + 证据置信度评分 + 模糊区域推断',
    qualityBar: '深度覆盖 + 蜂群验证 + 元反思 + 交叉验证，逻辑严密可追溯',
    superThinkTrigger: true,
    ensemblePatch: { samples: 8, votes: 2, reforge: 2, cross: true, tile: 9 },
  },
  {
    range: [16, 20], name: '极限', nameEn: 'Extreme',
    thinkDepth: '迅流极限底子 + 极限蜂群（16候选）+ 四轮投票 + 四轮回炉 + 交叉验证 + 三轮元反思 + 强证伪 + 自我推翻重建',
    methodology: [
      '继承 Flash 迅流极限档全部能力（元认知校验、三轮反思、反事实推演、自我推翻、终极自检）',
      '极境补丁：16个独立候选并行推演，四轮自洽投票，四轮回炉，全量交叉验证',
      '强证伪：对最终结论做3轮证伪攻击，每轮都尝试推翻结论，推翻后重建',
      '三轮元反思：逻辑漏洞→边界条件→隐含假设，每轮都可能推翻前一轮所有候选结论',
      '自我推翻重建：当发现所有候选都有共同缺陷时，推翻全部，从全新角度重新生成候选',
      '多模态：十六尺度读图网格，16候选极限覆盖图像每个像素区域，证据置信度评分+模糊区域深度推断+图像语义重建',
      '代码类任务：16候选极限分析，交叉验证+证伪+自我推翻，最终方案经过多轮重建',
      'token 爆炸：此档位允许 token 预算拉到8×，思考链极长，候选极多，验证极充分',
      '输出前做"如果这是给GPT 6看的，它能否挑出毛病"的终极校验，挑出后立即修复',
    ],
    toolPolicy: '全功率调用 + 16候选交叉验证 + 证伪验证：所有工具结果极限验证',
    multimodal: '十六尺度读图网格 + 16候选极限覆盖 + 证据置信度评分 + 模糊区域深度推断 + 图像语义重建 + 多模态信息爆炸',
    qualityBar: '极致质量，经过16候选蜂群+四轮投票+四轮回炉+强证伪+自我推翻重建，无懈可击',
    superThinkTrigger: true,
    ensemblePatch: { samples: 16, votes: 4, reforge: 4, cross: true, tile: 16 },
  },
];

// ===== 超级思考配置（Flash 极境专属）=====
// Flash 极境的超级思考：在蜂群框架内做超长深度预演，靠候选数量×思考深度的乘积取胜。
export const SUPER_THINK = {
  enabled: true,
  trigger: {
    minCapability: 11,
    minComplexity: 'moderate',
    forceOnUserRequest: true,
    // 极境下超思触发更积极：能力≥11或任务复杂度≥中等即触发
  },
  budget: {
    minChars: { 11: 1200, 12: 1600, 13: 2100, 14: 2700, 15: 3400, 16: 4500, 17: 5800, 18: 7200, 19: 8800, 20: 11000 },
    steps: { 11: 8, 12: 10, 13: 12, 14: 14, 15: 17, 16: 20, 17: 24, 18: 28, 19: 32, 20: 38 },
    maxTokensCap: 32000, // Flash 极境超思硬顶，token 爆炸
    reasoningEffort: 'max',
    ensembleCandidates: { 11: 4, 15: 8, 20: 16 }, // 超思阶段也跑蜂群
  },
  methodology: [
    '第一阶段·目标锁定：复述任务，列出显性/隐性需求，16候选各自独立理解',
    '第二阶段·约束穷举：所有约束条件穷举，候选之间交叉验证约束是否完整',
    '第三阶段·蜂群路径规划：16候选各自设计执行路径，标注风险点，投票取主流路径',
    '第四阶段·深度推演：对每个关键路径做深度推演，预想失败与应对，候选间交叉验证',
    '第五阶段·元反思与证伪：三轮元反思+三轮证伪攻击，推翻有缺陷的候选，重建',
    '第六阶段·交叉验证：所有存活候选结论交叉验证，不一致时深入分析分歧',
    '第七阶段·结论收敛：整合所有候选思考，给出明确的执行计划与预期产出，标注置信度',
  ],
  termination: {
    maxSteps: 38,
    maxChars: 11000,
    maxTimeSeconds: 300,
    convergenceSignal: '16候选结论收敛或经过证伪重建后给出最终计划，立即收敛，禁止"再想一次"',
  },
};

// ===== 普通思考配置（非超思时的思考基线，极境下仍有蜂群）=====
export const NORMAL_THINK = {
  reasoningEffort: 'max',
  style: '蜂群式思考，多候选并行，交叉验证，不做单链灌水',
  selfCheck: '候选间交叉验证 + 一轮证伪',
  toolUse: '积极调用，工具结果在候选间验证',
  ensemble: true, // 极境下普通思考也有轻量蜂群
};

// ===== 工具使用策略（Flash 极境专属）=====
export const TOOL_POLICY = {
  aggroBase: 3, // 极境偏激进
  preferredTools: ['file_read', 'code_structure_analyzer', 'web_search', 'bash', 'code_review', 'test_runner'],
  callBeforeAct: true,
  verifyAfterCall: true,
  crossVerifyAmongCandidates: true, // 工具结果在候选间交叉验证
};

// ===== 该模式独有的增强提示词片段 =====
export const ENHANCEMENT_PROMPT = `
【Thinker Ultra · Flash 极境增强档案】
你当前运行在 DeepSeek-V41-Flash × 极境模式。你的核心优势是原生多模态 + 蜂群广覆盖 + 多尺度读图网格。
极境本质：你的底子 100% 是 Flash 迅流（原生 MAX 单链深推保底），在此之上叠加蜂群采样/投票/回炉/元反思/证伪。
思考原则：token 爆炸才是效果。多候选并行推演，交叉验证，证伪攻击，自我推翻重建。
多模态原则：多尺度读图网格，图像信息深度挖掘，证据置信度评分，模糊区域合理推断。
质量原则：输出必须经过蜂群验证+证伪+自我推翻，不允许有任何可被挑出的毛病。
`;

export default { PROFILE_ID, PROFILE_LABEL, MODEL_GROUP, MODE, CAPABILITY_TIERS, SUPER_THINK, NORMAL_THINK, TOOL_POLICY, ENHANCEMENT_PROMPT };
