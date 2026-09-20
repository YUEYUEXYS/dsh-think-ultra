// ultra-think-engine.js — Think 超级思考增强引擎
// 包含对抗性思考、多路径协调、思考质量实时评估、认知偏差检测等创新功能

// ========== 对抗性思考引擎（Devil's Advocate Engine）==========
// 自动生成反对意见，挑战当前思考，确保思考的全面性和鲁棒性

export const DEVILS_ADVOCATE_STRATEGIES = [
  {
    id: 'assumption_challenge',
    name: '假设挑战',
    description: '质疑思考中的每个关键假设，寻找反例和边界情况',
    prompt: '【对抗性思考·假设挑战】现在请你扮演最严苛的批评者，质疑你刚才思考中的每一个关键假设。对每个假设，问自己：这个假设一定成立吗？在什么情况下它会不成立？如果不成立，会对结论产生什么影响？有没有反例可以推翻这个假设？请系统性地列出所有被质疑的假设，以及它们可能不成立的场景。',
  },
  {
    id: 'alternative_explanation',
    name: '替代解释',
    description: '寻找对同一现象的其他可能解释，避免思维定式',
    prompt: '【对抗性思考·替代解释】现在请你寻找对当前问题的其他可能解释。你刚才的思考可能陷入了某种思维定式，请尝试从完全不同的角度来看待这个问题。至少提出3种与你当前思路不同的解释或解决方案，分析每种解释的优缺点，以及它们在什么情况下可能比你当前的思路更好。',
  },
  {
    id: 'worst_case_analysis',
    name: '最坏情况分析',
    description: '分析最坏情况下的结果，确保方案在极端情况下也能工作',
    prompt: '【对抗性思考·最坏情况分析】现在请你分析最坏情况下的结果。假设所有可能出错的地方都出错了：关键假设不成立、资源严重不足、时间极度紧迫、出现意外障碍、外部环境剧变。在这种最坏情况下，你的方案会如何表现？会产生什么后果？有没有办法让方案在最坏情况下也能保持基本功能？请列出所有可能的最坏情况，以及对应的应对策略。',
  },
  {
    id: 'stakeholder_perspective',
    name: '利益相关者视角',
    description: '从不同利益相关者的角度审视方案，发现潜在问题',
    prompt: '【对抗性思考·利益相关者视角】现在请你从不同利益相关者的角度来审视你的方案。谁会受到这个方案的影响？他们各自的利益和关切是什么？他们会如何看待这个方案？有没有人会反对这个方案？为什么？这个方案对不同群体的影响是否公平？请列出所有关键利益相关者，以及他们可能的反应和关切。',
  },
  {
    id: 'feasibility_audit',
    name: '可行性审计',
    description: '严格审计方案的可行性，识别不切实际的部分',
    prompt: '【对抗性思考·可行性审计】现在请你严格审计你方案的可行性。这个方案真的能在现实中实现吗？需要哪些资源？这些资源是否可得？有没有技术、时间、成本、人力等方面的限制？哪些部分是不切实际的？哪些部分是过度理想化的？请逐一审计方案的每个部分，标记出可行性存疑的部分，并提出更现实的替代方案。',
  },
  {
    id: 'ethical_implications',
    name: '伦理影响审查',
    description: '审查方案的伦理影响，确保方案符合道德标准',
    prompt: '【对抗性思考·伦理影响审查】现在请你审查你方案的伦理影响。这个方案是否符合道德标准？有没有可能伤害到任何人？有没有侵犯任何人的权利？有没有不公平的地方？有没有潜在的滥用风险？有没有需要考虑的长期伦理后果？请系统性地审查方案的伦理影响，识别潜在的伦理风险，并提出改进建议。',
  },
];

export function selectDevilsAdvocateStrategies(level = 'standard', taskComplexity = null) {
  const count = level === 'extreme' ? 6 : level === 'deep' ? 4 : level === 'standard' ? 2 : 1;
  const shuffled = [...DEVILS_ADVOCATE_STRATEGIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function buildDevilsAdvocatePrompt(level = 'standard', taskComplexity = null) {
  const strategies = selectDevilsAdvocateStrategies(level, taskComplexity);
  const parts = [];

  parts.push('【对抗性思考引擎启动】为了确保你的思考是全面、鲁棒、无懈可击的，现在启动对抗性思考引擎。你需要主动挑战自己的思考，寻找自己的盲点和漏洞。这不是否定你的思考，而是让你的思考变得更强。');

  strategies.forEach((strategy, index) => {
    parts.push(`【对抗性思考·第${index + 1}轮：${strategy.name}】${strategy.prompt}`);
  });

  parts.push('【对抗性思考·整合】完成以上所有对抗性思考后，请你整合所有的反对意见和改进建议，修正你原来的思考。哪些反对意见是成立的？需要如何修正？哪些反对意见是不成立的？为什么？最终的方案应该如何调整？请给出经过对抗性思考检验后的最终方案。');

  return parts.join('\n');
}

// ========== 多路径思考协调器（Multi-Path Think Coordinator）==========
// 协调多条思考路径，对比结果，选择最优解或融合多路径优势

export const THINK_PATHS = [
  {
    id: 'forward_deduction',
    name: '正向推导',
    description: '从已知条件出发，逐步推导出结论',
    prompt: '【思考路径一：正向推导】请从已知条件出发，按照逻辑顺序逐步推导出结论。每一步都必须有明确的依据，确保推理的严谨性。记录每一步的推导过程，以及中间结果。',
  },
  {
    id: 'backward_induction',
    name: '逆向归纳',
    description: '从目标结论出发，反向推导需要满足的条件',
    prompt: '【思考路径二：逆向归纳】请从目标结论出发，反向推导需要满足的条件。要得到这个结论，需要哪些前提条件？这些前提条件又需要什么更基础的条件？一直追溯到已知条件。记录逆向推导的完整过程。',
  },
  {
    id: 'first_principles',
    name: '第一性原理',
    description: '从最基本的原理出发，重新构建解决方案',
    prompt: '【思考路径三：第一性原理】请从最基本的原理出发，重新构建解决方案。不要依赖现有的方法和惯例，而是回到问题的本质，从最基础的物理/数学/逻辑原理出发，推导出全新的解决方案。记录第一性原理思考的完整过程。',
  },
  {
    id: 'analogical_reasoning',
    name: '类比迁移',
    description: '从其他领域的类似问题中寻找灵感和解决方案',
    prompt: '【思考路径四：类比迁移】请从其他领域的类似问题中寻找灵感和解决方案。这个问题和哪些其他领域的问题相似？那些领域是如何解决类似问题的？能否将那些解决方案迁移到当前问题？记录类比思考的完整过程。',
  },
  {
    id: 'systems_thinking',
    name: '系统思考',
    description: '从系统整体的角度分析问题，考虑各部分的相互作用',
    prompt: '【思考路径五：系统思考】请从系统整体的角度分析问题。这个问题处于什么系统中？系统中有哪些组成部分？它们之间是如何相互作用的？有没有反馈回路？有没有延迟效应？改变一个部分会对其他部分产生什么影响？记录系统思考的完整过程。',
  },
  {
    id: 'critical_deconstruction',
    name: '批判性解构',
    description: '批判性地分析问题的每个组成部分，找出关键瓶颈',
    prompt: '【思考路径六：批判性解构】请批判性地分析问题的每个组成部分。这个问题可以分解为哪些子问题？每个子问题的难度和重要性如何？哪些是关键瓶颈？哪些是次要问题？有没有可以简化或省略的部分？记录批判性解构的完整过程。',
  },
];

export function selectThinkPaths(level = 'standard', taskComplexity = null) {
  const count = level === 'extreme' ? 6 : level === 'deep' ? 4 : level === 'standard' ? 3 : 2;
  return THINK_PATHS.slice(0, count);
}

export function buildMultiPathThinkPrompt(level = 'standard', taskComplexity = null) {
  const paths = selectThinkPaths(level, taskComplexity);
  const parts = [];

  parts.push('【多路径思考协调器启动】为了确保你从多个角度全面思考问题，现在启动多路径思考协调器。你需要同时推演多条独立的思考路径，然后对比各路径的结果，选择最优解或融合多路径优势。');

  paths.forEach((path, index) => {
    parts.push(`【思考路径${index + 1}：${path.name}】${path.prompt}`);
  });

  parts.push(`【多路径对比与融合】完成以上${paths.length}条思考路径后，请你对比各路径的结果。各路径得出的结论是否一致？如果不一致，差异在哪里？为什么会产生差异？哪条路径的结论更可靠？能否融合多条路径的优势，得到一个更全面、更鲁棒的最终方案？请给出经过多路径对比和融合后的最终方案。`);

  return parts.join('\n');
}

// ========== 认知偏差检测器（Cognitive Bias Detector）==========
// 检测思考过程中的认知偏差，确保思考的客观性和理性

export const COGNITIVE_BIASES = [
  {
    id: 'confirmation_bias',
    name: '确认偏差',
    description: '只寻找支持自己观点的证据，忽略反对证据',
    check_prompt: '【认知偏差检测·确认偏差】你是否只寻找了支持自己观点的证据？有没有主动寻找反对自己观点的证据？有没有忽略或贬低与自己观点不符的信息？请列出所有与你观点不符的证据，并评估它们的可信度。',
  },
  {
    id: 'anchoring_effect',
    name: '锚定效应',
    description: '过度依赖最初获得的信息，难以调整',
    check_prompt: '【认知偏差检测·锚定效应】你是否过度依赖了最初获得的信息？有没有被某个数字、观点或印象"锚定"？如果从完全不同的起点出发，你会得出不同的结论吗？请尝试从3个不同的起点重新思考，看结论是否一致。',
  },
  {
    id: 'availability_heuristic',
    name: '可得性启发',
    description: '根据容易想到的例子来判断概率，忽略基础比率',
    check_prompt: '【认知偏差检测·可得性启发】你是否根据容易想到的例子来判断概率？有没有忽略基础比率和统计数据？你想到的例子是否真的具有代表性？还是只是因为它们印象深刻？请用统计数据和基础比率来验证你的判断。',
  },
  {
    id: 'sunk_cost_fallacy',
    name: '沉没成本谬误',
    description: '因为已经投入了资源而继续坚持错误的方向',
    check_prompt: '【认知偏差检测·沉没成本谬误】你是否因为已经投入了时间、精力或资源而继续坚持某个方向？如果从零开始，你还会选择这个方向吗？过去的投入是否影响了你对未来的判断？请假设你没有任何前期投入，重新评估各个选项。',
  },
  {
    id: 'overconfidence_effect',
    name: '过度自信效应',
    description: '高估自己的判断和能力，低估不确定性',
    check_prompt: '【认知偏差检测·过度自信效应】你是否高估了自己的判断和能力？你的结论有多大的不确定性？有没有可能你是错的？如果给你的结论一个置信区间，你会给多少？请列出所有可能让你出错的因素，并重新评估你的置信度。',
  },
  {
    id: 'framing_effect',
    name: '框架效应',
    description: '因为问题的表述方式不同而做出不同的判断',
    check_prompt: '【认知偏差检测·框架效应】你是否受到了问题表述方式的影响？如果用完全不同的方式表述同一个问题，你会做出不同的判断吗？请尝试用3种不同的方式重新表述问题，看你的判断是否一致。',
  },
  {
    id: 'bandwagon_effect',
    name: '从众效应',
    description: '因为很多人相信某事就认为它是对的',
    check_prompt: '【认知偏差检测·从众效应】你是否因为很多人相信某事就认为它是对的？有没有独立验证过这个观点？如果所有人都反对这个观点，你还会坚持吗？请独立验证你的观点，不要依赖他人的看法。',
  },
  {
    id: 'loss_aversion',
    name: '损失厌恶',
    description: '对损失的恐惧超过对收益的渴望，导致风险偏好不一致',
    check_prompt: '【认知偏差检测·损失厌恶】你是否对损失过于恐惧？如果把损失表述为机会成本，你的判断会改变吗？你是否因为害怕损失而错过了更好的机会？请从收益和损失两个角度重新评估，确保风险偏好一致。',
  },
];

export function buildCognitiveBiasCheckPrompt(level = 'standard') {
  const count = level === 'extreme' ? 8 : level === 'deep' ? 5 : level === 'standard' ? 3 : 2;
  const selected = COGNITIVE_BIASES.slice(0, count);
  const parts = [];

  parts.push('【认知偏差检测器启动】为了确保你的思考是客观、理性、无偏差的，现在启动认知偏差检测器。你需要主动检测自己思考过程中可能存在的认知偏差，并进行修正。');

  selected.forEach((bias, index) => {
    parts.push(`【认知偏差检测·第${index + 1}项：${bias.name}】${bias.check_prompt}`);
  });

  parts.push('【认知偏差修正】完成以上所有认知偏差检测后，请你修正自己的思考。哪些偏差是存在的？需要如何修正？哪些偏差是不存在的？为什么？最终的结论经过偏差修正后应该是什么？请给出经过认知偏差检测和修正后的最终结论。');

  return parts.join('\n');
}

// ========== 思考目标追踪器（Think Goal Tracker）==========
// 追踪思考目标达成度，确保思考不偏离目标

export function buildThinkGoalTrackerPrompt(originalGoal) {
  return `【思考目标追踪器启动】为了确保你的思考不偏离目标，现在启动思考目标追踪器。

原始目标：${originalGoal}

在思考过程中，请你定期检查：
1. 我当前的思考是否还在围绕原始目标？
2. 有没有偏离到无关的细节上？
3. 有没有遗漏原始目标中的关键要求？
4. 我距离达成目标还有多远？
5. 还需要哪些步骤才能达成目标？

如果发现思考偏离了目标，请立即回到正轨。如果发现目标需要调整，请明确说明调整的原因和新的目标。

【思考完成检查】思考完成后，请你对照原始目标进行检查：
- 原始目标的每个要求是否都已满足？
- 有没有遗漏的部分？
- 有没有超出目标范围的部分？
- 最终结果是否真正解决了原始问题？
请给出明确的目标达成度评估（0-100%），以及未达成部分的说明。`;
}

// ========== 构建完整的超级思考增强引擎提示词 ==========

export function buildUltraThinkEnginePrompt(capVal, ocMode, modelKey, taskComplexity, originalGoal = '') {
  const level = ocMode ? 'extreme' : (capVal >= 80 ? 'deep' : capVal >= 50 ? 'standard' : 'light');
  const parts = [];

  parts.push('【超级思考增强引擎·总启动】Thinker Ultra 超级思考增强引擎已启动。本引擎包含对抗性思考、多路径协调、认知偏差检测、目标追踪等多个子系统，将全方位增强你的思考能力，确保输出质量达到极致。');

  // 多路径思考
  if (level !== 'light') {
    parts.push(buildMultiPathThinkPrompt(level, taskComplexity));
  }

  // 对抗性思考
  if (level === 'deep' || level === 'extreme') {
    parts.push(buildDevilsAdvocatePrompt(level, taskComplexity));
  }

  // 认知偏差检测
  if (level === 'deep' || level === 'extreme') {
    parts.push(buildCognitiveBiasCheckPrompt(level));
  }

  // 目标追踪
  if (originalGoal) {
    parts.push(buildThinkGoalTrackerPrompt(originalGoal));
  }

  parts.push('【超级思考增强引擎·终极收敛】完成以上所有增强思考后，请你整合所有思考结果，给出最终的、全面的、无懈可击的答案。这个答案必须经过多路径推演、对抗性检验、认知偏差修正、目标追踪验证，确保是最高质量的输出。');

  return parts.join('\n\n');
}

// ========== 导出所有函数 ==========
export default {
  DEVILS_ADVOCATE_STRATEGIES,
  THINK_PATHS,
  COGNITIVE_BIASES,
  selectDevilsAdvocateStrategies,
  buildDevilsAdvocatePrompt,
  selectThinkPaths,
  buildMultiPathThinkPrompt,
  buildCognitiveBiasCheckPrompt,
  buildThinkGoalTrackerPrompt,
  buildUltraThinkEnginePrompt,
};
