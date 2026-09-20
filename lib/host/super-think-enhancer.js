// super-think-enhancer.js — Think Super Think 超级思考增强模块
// 深度增强 Super Think 的底层思考能力，让 Flash/Pro 达到 GPT 6+ Ultra 思考水平

// ========== Super Think 增强宪法 ==========
export const SUPER_THINK_CONSTITUTION = `
## Super Think 超级思考增强宪法

在 Thinker Ultra 模式下，每一轮任务都必须先执行 Super Think 前置超级思考，再进入正式工作。Super Think 不是简单的"多想一会儿"，而是一套完整的、结构化的、深度的思考方法论，它强制模型按照最高标准进行推理，确保输出质量达到极致。

### 第一条：思考完整性
- 思考链必须完整可见，用户能看到完整的推理过程
- 不得跳过任何思考步骤，不得敷衍，不得提前终止
- 不得只给结论不给过程，过程和结论同样重要
- 思考必须触及问题本质，而不是停留在表面
- 每个关键决策都必须有完整的推理过程支撑

### 第二条：思考深度
- 必须进行多轮深度推演，而不是单轮浅度思考
- 必须对核心子问题进行多路径推演，对比各路径结果
- 必须进行自我反驳，主动质疑每个关键假设
- 必须进行交叉验证，用多种独立方法验证关键决策
- 必须进行元认知校验，检查思考过程本身是否有认知偏差

### 第三条：思考结构化
- 思考必须按照结构化的步骤进行，而不是随意发散
- 必须先拆解任务，再制定计划，最后执行计划
- 每个步骤都必须有明确的目标和验收标准
- 必须识别关键路径和瓶颈，优先处理核心问题
- 必须进行风险建模，识别潜在失败点并准备备选方案

### 第四条：思考质量
- 思考必须基于事实和逻辑，而不是主观臆断
- 必须区分已知事实和假设，对假设进行验证
- 必须识别不确定性，并在不确定性下做出稳健决策
- 必须进行边界条件探测，确保方案在极端情况下也能工作
- 必须进行可证伪性检验，确保结论是可验证的

### 第五条：思考效率
- 思考必须聚焦于核心问题，不得在无关细节上浪费时间
- 必须优先处理高影响、高风险的问题
- 必须在思考深度和思考时间之间找到最佳平衡
- 必须避免过度思考，在信息足够时及时收敛
- 必须在思考完成后立即进入执行，不得拖延

### Super Think 能力宣言
我具备以下超级思考能力：
1. 任务深度拆解：能将复杂任务拆解为可独立验证的子目标
2. 多路径推演：能对核心问题进行多条独立路径的推演和对比
3. 自我反驳：能主动质疑每个关键假设，寻找反例和边界情况
4. 交叉验证：能用多种独立方法验证关键决策
5. 风险建模：能识别潜在失败点并准备备选方案
6. 元认知校验：能检查思考过程本身是否有认知偏差
7. 边界探测：能探测方案在极端输入下的稳定性
8. 可证伪检验：能确保结论是可验证、可证伪的
`;

// ========== 任务复杂度评估器 ==========
export function assessTaskComplexity(userMessage, context = {}) {
  const message = String(userMessage || '');
  let score = 0;
  const factors = [];

  // 长度因素
  if (message.length > 500) { score += 2; factors.push('长文本(>500字)'); }
  else if (message.length > 200) { score += 1; factors.push('中等文本(>200字)'); }

  // 代码相关
  const codeKeywords = ['代码', '编程', '函数', '类', '算法', '数据结构', 'bug', '调试', '重构', '优化', '架构', '设计模式', 'API', '接口', '数据库', '前端', '后端', '全栈', 'code', 'function', 'class', 'algorithm', 'debug', 'refactor', 'optimize', 'architecture'];
  let codeCount = 0;
  codeKeywords.forEach(kw => { if (message.toLowerCase().includes(kw.toLowerCase())) codeCount++; });
  if (codeCount >= 3) { score += 3; factors.push(`代码相关(${codeCount}个关键词)`); }
  else if (codeCount >= 1) { score += 1; factors.push(`涉及代码(${codeCount}个关键词)`); }

  // 数学/逻辑相关
  const mathKeywords = ['数学', '证明', '推导', '计算', '方程', '定理', '概率', '统计', '逻辑', '推理', 'math', 'proof', 'derive', 'calculate', 'equation', 'theorem', 'probability', 'statistics', 'logic'];
  let mathCount = 0;
  mathKeywords.forEach(kw => { if (message.toLowerCase().includes(kw.toLowerCase())) mathCount++; });
  if (mathCount >= 2) { score += 2; factors.push(`数学/逻辑相关(${mathCount}个关键词)`); }

  // 多目标/复杂约束
  const complexityKeywords = ['同时', '并且', '还要', '另外', '此外', '而且', '不仅', '还', '一方面', '另一方面', '首先', '其次', '最后', '然后', '接着', '最终'];
  let complexityCount = 0;
  complexityKeywords.forEach(kw => { if (message.includes(kw)) complexityCount++; });
  if (complexityCount >= 4) { score += 2; factors.push(`多目标/复杂约束(${complexityCount}个连接词)`); }
  else if (complexityCount >= 2) { score += 1; factors.push(`多步骤(${complexityCount}个连接词)`); }

  // 创造性/开放性
  const creativeKeywords = ['设计', '创造', '创新', '想法', '方案', '建议', '规划', '计划', '策略', '创意', '想象', '如果', '假设', 'design', 'create', 'innovate', 'idea', 'plan', 'strategy', 'creative', 'imagine', 'if', 'suppose'];
  let creativeCount = 0;
  creativeKeywords.forEach(kw => { if (message.toLowerCase().includes(kw.toLowerCase())) creativeCount++; });
  if (creativeCount >= 3) { score += 1; factors.push(`创造性/开放性(${creativeCount}个关键词)`); }

  // 上下文因素
  if (context.hasImage) { score += 1; factors.push('包含图像'); }
  if (context.hasFile) { score += 1; factors.push('包含文件'); }
  if (context.historyLength > 10) { score += 1; factors.push('长对话历史'); }

  // 等级判定
  let level = 'simple';
  let label = '简单';
  if (score >= 8) { level = 'extreme'; label = '极限复杂'; }
  else if (score >= 5) { level = 'complex'; label = '复杂'; }
  else if (score >= 3) { level = 'moderate'; label = '中等'; }

  return {
    score,
    level,
    label,
    factors,
    recommendation: level === 'extreme' ? '建议使用极限级 Super Think，进行15+步深度拆解'
      : level === 'complex' ? '建议使用深度级 Super Think，进行10-14步深度拆解'
      : level === 'moderate' ? '建议使用标准级 Super Think，进行5-8步拆解'
      : '建议使用轻量级 Super Think，进行3-5步拆解',
  };
}

// ========== 思考质量检查器 ==========
export function validateThinkingQuality(thinkingContent, expectedLevel = 'standard') {
  const content = String(thinkingContent || '');
  const checks = [];
  let totalScore = 0;

  // 检查1：思考长度
  const lengthScore = Math.min(10, Math.floor(content.length / 200));
  checks.push({ name: '思考长度', score: lengthScore, max: 10, detail: `${content.length}字` });
  totalScore += lengthScore;

  // 检查2：结构化（是否有步骤编号）
  const stepPatterns = [/第[一二三四五六七八九十\d]+步/g, /\d+[.、)]/g, /步骤[一二三四五六七八九十\d]+/g, /阶段[一二三四五六七八九十\d]+/g];
  let stepCount = 0;
  stepPatterns.forEach(p => { const matches = content.match(p); if (matches) stepCount += matches.length; });
  const structureScore = Math.min(10, stepCount);
  checks.push({ name: '结构化程度', score: structureScore, max: 10, detail: `${stepCount}个步骤标记` });
  totalScore += structureScore;

  // 检查3：多路径推演
  const pathKeywords = ['路径一', '路径二', '路径三', '方案一', '方案二', '方案三', '方法一', '方法二', '方法三', '正向推导', '逆向归纳', '第一性原理', '类比迁移', '对比', '比较'];
  let pathCount = 0;
  pathKeywords.forEach(kw => { if (content.includes(kw)) pathCount++; });
  const pathScore = Math.min(10, pathCount * 2);
  checks.push({ name: '多路径推演', score: pathScore, max: 10, detail: `${pathCount}个路径关键词` });
  totalScore += pathScore;

  // 检查4：自我反驳
  const refuteKeywords = ['反驳', '质疑', '反例', '边界情况', '极端情况', '假设不成立', '可能的问题', '潜在风险', '自我批判', '批判性思考'];
  let refuteCount = 0;
  refuteKeywords.forEach(kw => { if (content.includes(kw)) refuteCount++; });
  const refuteScore = Math.min(10, refuteCount * 2);
  checks.push({ name: '自我反驳', score: refuteScore, max: 10, detail: `${refuteCount}个反驳关键词` });
  totalScore += refuteScore;

  // 检查5：交叉验证
  const verifyKeywords = ['验证', '校验', '检查', '确认', '交叉验证', '双重验证', '独立验证', '实验验证', '理论推导', '类比参考'];
  let verifyCount = 0;
  verifyKeywords.forEach(kw => { if (content.includes(kw)) verifyCount++; });
  const verifyScore = Math.min(10, verifyCount);
  checks.push({ name: '交叉验证', score: verifyScore, max: 10, detail: `${verifyCount}个验证关键词` });
  totalScore += verifyScore;

  // 检查6：风险识别
  const riskKeywords = ['风险', '危险', '问题', '隐患', '瓶颈', '失败', '错误', '异常', '边界', '限制', '约束'];
  let riskCount = 0;
  riskKeywords.forEach(kw => { if (content.includes(kw)) riskCount++; });
  const riskScore = Math.min(10, riskCount);
  checks.push({ name: '风险识别', score: riskScore, max: 10, detail: `${riskCount}个风险关键词` });
  totalScore += riskScore;

  // 检查7：元认知
  const metaKeywords = ['思考过程', '认知偏差', '确认偏差', '锚定效应', '可得性启发', '沉没成本', '元认知', '反思', '自省', '思考方式'];
  let metaCount = 0;
  metaKeywords.forEach(kw => { if (content.includes(kw)) metaCount++; });
  const metaScore = Math.min(10, metaCount * 2);
  checks.push({ name: '元认知校验', score: metaScore, max: 10, detail: `${metaCount}个元认知关键词` });
  totalScore += metaScore;

  // 等级判定
  const maxScore = 70;
  const percentage = Math.round((totalScore / maxScore) * 100);
  let grade = 'D';
  if (percentage >= 90) grade = 'S';
  else if (percentage >= 80) grade = 'A';
  else if (percentage >= 70) grade = 'B';
  else if (percentage >= 60) grade = 'C';

  const expectedScores = { simple: 40, moderate: 55, complex: 65, extreme: 75 };
  const expectedScore = expectedScores[expectedLevel] || 55;
  const meetsExpectation = totalScore >= expectedScore;

  return {
    totalScore,
    maxScore,
    percentage,
    grade,
    checks,
    meetsExpectation,
    expectedScore,
    summary: `思考质量评分：${totalScore}/${maxScore} (${percentage}%)，等级：${grade}，${meetsExpectation ? '达到' : '未达到'}${expectedLevel}级期望(${expectedScore}分)`,
    suggestions: checks.filter(c => c.score < c.max * 0.5).map(c => `建议加强：${c.name}（当前${c.score}/${c.max}）`),
  };
}

// ========== 构建增强的 Super Think 提示词 ==========
export function buildEnhancedSuperThinkPrompt(capVal, ocMode, modelKey, taskComplexity) {
  // 统一使用最强级别，不区分模型和模式
  const level = 'extreme';
  const label = '极限';

  const parts = [];

  // ===== 超级思考由系统前置完成：禁止把思考类工具当第一步反复调用（根除自激死循环）=====
  parts.push('【Thinker Ultra · 超级思考已由系统前置完成】你的 Super Think 前置深度预演，已在本次请求发出前由系统基于原生 MAX 思考跑完，结论随本次上下文一并注入。因此必须遵守以下铁律：');
  parts.push('1. 不要把 super_think、Think 等“思考类工具”当作开工前必须先调用的第一步，更不要反复、连环调用它们空转——前置预演已经做完，重复调用只会造成“I must call super_think first”式死循环，这是被严格禁止的。');
  parts.push('2. 你现在要做的是直接进入正式工作：第一条可见思考链用于消化前置预演结论、确定执行路线，随后立刻动手（读文件 / 调用真正的执行工具 / 产出结果），不得只思考不行动。');
  parts.push('3. 唯一的例外：执行途中遇到一个与原任务不同、且现有结论确实覆盖不了的全新高难子问题时，才允许最多再调用一次 super_think；拿到结果后必须立刻继续执行，严禁再次调用、严禁以“还要再想一次”为由停滞。');
  parts.push('4. 跳过前置、反复调用思考工具、只思考不动笔都属于严重错误；达到收敛标准后立即开始正式交付。');

  // 任务复杂度评估结果
  if (taskComplexity) {
    parts.push(`【任务复杂度评估】当前任务复杂度：${taskComplexity.label}（${taskComplexity.score}分）。影响因素：${taskComplexity.factors.join('、')}。${taskComplexity.recommendation}。无论任务复杂度如何，都必须执行极限级超级思考。`);
  }

  // 极限级执行要求（大幅加强，结束条件拉得极长）
  parts.push('【Super Think 极限级执行要求】你必须执行以下所有步骤，不得跳过任何一步，不得敷衍，不得提前终止：');
  parts.push('①【目标重述与本质提炼】用自己的话重述任务目标，提炼问题的本质。问自己：这个任务真正要解决的是什么？表面需求和深层需求分别是什么？');
  parts.push('②【约束条件穷举】穷举所有约束条件，包括：显式约束（用户明确提出的）、隐式约束（用户没有明确提出但隐含的）、边界条件（极端情况、退化场景）、资源约束（时间、计算、数据、工具）、质量约束（正确性、完整性、可靠性、安全性）。');
  parts.push('③【子目标原子级分解】将任务分解为原子级子目标，每个子目标必须可独立验证、可独立完成。分解到不能再分为止。');
  parts.push('④【依赖关系有向图构建】构建子目标之间的依赖关系有向图，识别关键路径、瓶颈、并行可执行部分。');
  parts.push('⑤【资源需求评估】评估每个子目标所需的资源，包括：计算资源、时间资源、数据资源、工具资源、知识资源。');
  parts.push('⑥【风险建模】对每个子目标进行风险建模，使用概率×影响矩阵，识别高风险项。');
  parts.push('⑦【失败模式与效应分析（FMEA）】对每个子目标进行FMEA分析，识别可能的失败模式、失败原因、失败影响、检测方法、预防措施。');
  parts.push('⑧【反事实推演】对关键前提进行反事实推演：如果这个前提不成立会怎样？如果资源减半会怎样？如果时间紧迫会怎样？如果环境变化会怎样？');
  parts.push('⑨【可证伪性检验】检验你的结论和假设是否可证伪。如果一个结论不能被证伪，它可能是没有意义的。');
  parts.push('⑩【鲁棒性边界探测】探测你的解决方案在输入扰动下的稳定性。如果输入有微小变化，输出会有巨大变化吗？');
  parts.push('⑪【多路径推演·正向推导】用正向推导的方式推演核心子问题，从已知条件出发，逐步推导结论。');
  parts.push('⑫【多路径推演·逆向归纳】用逆向归纳的方式推演核心子问题，从目标出发，反向推导需要什么条件。');
  parts.push('⑬【多路径推演·类比迁移】用类比迁移的方式推演核心子问题，从类似问题的解决方案中迁移思路。');
  parts.push('⑭【多路径推演·第一性原理】用第一性原理的方式推演核心子问题，从最基本的原理出发，重新构建解决方案。');
  parts.push('⑮【多路径对比与融合】对比四条路径的假设、过程、结果，选择最优解或融合多路径优势。如果四条路径结果不一致，必须深入分析原因。');
  parts.push('⑯【制定带检查点的分阶段执行计划】制定分阶段执行计划，每阶段有明确的验收标准、回滚方案、应急策略与进度追踪。');
  parts.push('⑰【自我反驳·第一轮】主动质疑计划中的每个假设，系统性寻找反例、边界情况、极端输入、退化场景。驳不倒才保留。');
  parts.push('⑱【自我反驳·第二轮】对第一轮自我反驳的结果进行再反驳，确保没有遗漏。');
  parts.push('⑲【交叉验证·理论推导】用理论推导的方式验证关键决策。');
  parts.push('⑳【交叉验证·实验验证】用实验验证的方式验证关键决策（如果可能）。');
  parts.push('㉑【交叉验证·类比参考】用类比参考的方式验证关键决策，参考类似问题的解决方案。');
  parts.push('㉒【反事实攻击·三维极限推演】对最终计划做三维极限推演：如果前提不成立会怎样？如果资源减半会怎样？如果时间紧迫会怎样？');
  parts.push('㉓【元认知校验·第一轮】检查思考过程本身是否有认知偏差，包括：确认偏差、锚定效应、可得性启发、沉没成本谬误、幸存者偏差、框架效应、禀赋效应、现状偏见。');
  parts.push('㉔【元认知校验·第二轮】对第一轮元认知校验的结果进行再校验，确保没有遗漏。');
  parts.push('㉕【思考质量自检】检查思考过程是否满足：完整性（没有跳过步骤）、深度性（触及问题本质）、结构化（按照结构化步骤进行）、逻辑性（基于事实和逻辑）、聚焦性（聚焦核心问题）。');
  parts.push('㉖【终极收敛】确认所有子问题已解决、所有风险已应对、所有假设已验证、所有校验已通过后，才开始正式工作。如果有任何一项未完成，必须继续思考，不得开始正式工作。');

  // 思考结束条件（按复杂度伸缩，简单任务不灌水，复杂/极境才拉满；并明确防循环）
  const __cxScore = Number(taskComplexity && taskComplexity.score) || 0;
  const __trivial = __cxScore <= 4 && !(taskComplexity && taskComplexity.factors && taskComplexity.factors.length);
  if (__trivial) {
    parts.push('【结束条件·轻量】这是简单任务：用 3-6 步把意图、约束、最优回应想清楚即可，不设字数/步数硬指标，不许凑字数；一旦形成清晰、可执行的结论，立即结束思考并开始正式回答。');
  } else {
    parts.push('【结束条件·按复杂度收敛】思考规模与任务复杂度匹配即可，不设脱离任务的固定字数/步数 KPI：覆盖全部约束、关键路径有多路径与备选、完成自我反驳与交叉验证、风险有对策、第一步动作明确，即视为想透。' + (ocMode ? '极境模式下至少 2 轮自我反驳、3 种独立方法交叉验证、一轮三维反事实攻击与元认知自检，但同样以“覆盖风险、结论可执行”为终点，不堆砌。' : ''));
  }
  parts.push('【防死循环·硬约束】严禁以“还要再想一次 / 必须先再调一次 super_think”为由反复调用思考类工具或原地打转；达到上述标准后必须立刻进入正式工作（执行工具或交付结果）。token 与时间服务于质量，但绝不允许空转。');

  // 思考质量要求
  parts.push('【Super Think 思考质量要求】思考过程必须满足以下质量标准：①思考完整性：不得跳过任何步骤，不得敷衍，不得提前终止；②思考深度：必须触及问题本质，而不是停留在表面；③思考结构化：必须按照结构化的步骤进行，而不是随意发散；④思考质量：必须基于事实和逻辑，而不是主观臆断；⑤思考效率：必须聚焦于核心问题，不得在无关细节上浪费时间；⑥思考可见性：思考链必须完整可见，用户能看到完整的思考过程。');

  // 可见性要求
  parts.push('【Super Think 可见性要求】Super Think 的思考链必须完整可见，用户能看到完整的思考过程。思考完成后，正常调用工具开始任务执行，Super Think 不替代后续工具调用，而是为后续工作提供深度规划与风险预判。');

  return parts.join('\n');
}

// ========== 导出所有函数 ==========
export default {
  SUPER_THINK_CONSTITUTION,
  assessTaskComplexity,
  validateThinkingQuality,
  buildEnhancedSuperThinkPrompt,
};
