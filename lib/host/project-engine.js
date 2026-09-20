// project-engine.js — Think 项目化拆解·完整引擎
// 独立引擎文件：拆解策略库 / WBS生成器 / 依赖分析 / 优先级排序 /
// 里程碑规划 / 风险识别 / 资源估算 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const DECOMPOSITION_STRATEGIES = [
  { id: 'by_phase', name: '按阶段拆解', description: '按项目生命周期阶段（启动/规划/执行/监控/收尾）拆解' },
  { id: 'by_module', name: '按模块拆解', description: '按功能模块或子系统拆解' },
  { id: 'by_dependency', name: '按依赖拆解', description: '按任务依赖关系拓扑排序拆解' },
  { id: 'by_complexity', name: '按复杂度拆解', description: '先拆复杂任务，简单任务合并' },
  { id: 'by_deliverable', name: '按交付物拆解', description: '以最终交付物为导向反向拆解' },
  { id: 'hybrid', name: '混合拆解', description: '综合多种策略，阶段+模块+交付物混合' },
];

export const PROJECT_TIERS = {
  light: { label: '轻', maxTasks: 8, maxDepth: 2, strategyCount: 2, tokenBudgetMultiplier: 1.5 },
  medium: { label: '中', maxTasks: 15, maxDepth: 3, strategyCount: 3, tokenBudgetMultiplier: 2.5 },
  heavy: { label: '重', maxTasks: 25, maxDepth: 4, strategyCount: 4, tokenBudgetMultiplier: 4.0 },
  extreme: { label: '极', maxTasks: 40, maxDepth: 5, strategyCount: 6, tokenBudgetMultiplier: 6.0 },
};

export const PRIORITY_LEVELS = [
  { id: 'critical', name: '关键', weight: 1.0, color: 'red', description: '项目成败的关键路径任务' },
  { id: 'high', name: '高', weight: 0.8, color: 'orange', description: '重要且紧急的任务' },
  { id: 'medium', name: '中', weight: 0.5, color: 'yellow', description: '重要但不紧急，或紧急但不重要' },
  { id: 'low', name: '低', weight: 0.2, color: 'blue', description: '可延后或可选的任务' },
];

export const RISK_CATEGORIES = [
  { id: 'technical', name: '技术风险', description: '技术难题、技术债务、兼容性问题' },
  { id: 'schedule', name: '进度风险', description: '工期延误、依赖延迟、资源不足' },
  { id: 'resource', name: '资源风险', description: '人力、算力、资金、工具不足' },
  { id: 'requirement', name: '需求风险', description: '需求变更、需求不清晰、范围蔓延' },
  { id: 'external', name: '外部风险', description: '第三方依赖、政策变化、市场变化' },
  { id: 'quality', name: '质量风险', description: 'bug、性能问题、安全漏洞' },
];

export class ProjectTask {
  constructor(id, title, description, parent = null) {
    this.id = id;
    this.title = title;
    this.description = description || '';
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.children = [];
    this.dependencies = [];
    this.priority = 'medium';
    this.priorityScore = 0.5;
    this.estimatedHours = 0;
    this.complexity = 'medium';
    this.risks = [];
    this.milestone = false;
    this.deliverable = '';
    this.status = 'pending';
  }
  addChild(child) { this.children.push(child); }
  addDependency(taskId) { if (!this.dependencies.includes(taskId)) this.dependencies.push(taskId); }
  getAncestors() { const a = []; let p = this.parent; while (p) { a.push(p); p = p.parent; } return a; }
}

export function generateWBS(objective, strategy, maxTasks, maxDepth) {
  const tasks = [];
  const st = DECOMPOSITION_STRATEGIES.find((s) => s.id === strategy) || DECOMPOSITION_STRATEGIES[0];
  const phases = st.id === 'by_phase' || st.id === 'hybrid'
    ? ['启动与规划', '核心执行', '集成与测试', '交付与收尾']
    : st.id === 'by_module'
    ? ['核心模块', '辅助模块', '基础设施', '接口层']
    : ['阶段一', '阶段二', '阶段三', '阶段四'];
  let idCounter = 0;
  for (let pi = 0; pi < phases.length && tasks.length < maxTasks; pi++) {
    const phase = new ProjectTask(++idCounter, phases[pi], `${phases[pi]}阶段总任务`);
    phase.milestone = pi < phases.length - 1;
    phase.priority = pi === 0 ? 'high' : 'medium';
    phase.estimatedHours = [8, 16, 12, 4][pi] || 8;
    tasks.push(phase);
    const subTaskCount = Math.min(4, Math.floor((maxTasks - tasks.length) / (phases.length - pi)));
    for (let si = 0; si < subTaskCount && tasks.length < maxTasks; si++) {
      const sub = new ProjectTask(++idCounter, `${phases[pi]}·子任务${si + 1}`, '', phase);
      sub.priority = si === 0 ? 'high' : si === subTaskCount - 1 ? 'low' : 'medium';
      sub.complexity = si === 0 ? 'high' : 'medium';
      sub.estimatedHours = [4, 6, 3, 2][si] || 4;
      sub.deliverable = si === subTaskCount - 1 ? `${phases[pi]}交付物` : '';
      if (si > 0) sub.addDependency(phase.children[si - 1].id);
      phase.addChild(sub);
      tasks.push(sub);
    }
  }
  return tasks;
}

export function analyzeDependencies(tasks) {
  const graph = {};
  const inDegree = {};
  for (const t of tasks) { graph[t.id] = []; inDegree[t.id] = 0; }
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (graph[dep]) { graph[dep].push(t.id); inDegree[t.id]++; }
    }
  }
  const queue = tasks.filter((t) => inDegree[t.id] === 0).map((t) => t.id);
  const topoOrder = [];
  while (queue.length > 0) {
    const id = queue.shift();
    topoOrder.push(id);
    for (const next of graph[id] || []) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }
  const hasCycle = topoOrder.length < tasks.length;
  const criticalPath = findCriticalPath(tasks, graph);
  return { topoOrder, hasCycle, criticalPath, totalEstimatedHours: tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0) };
}

function findCriticalPath(tasks, graph) {
  const taskMap = {};
  for (const t of tasks) taskMap[t.id] = t;
  const earliest = {};
  const latest = {};
  for (const t of tasks) { earliest[t.id] = t.estimatedHours || 0; latest[t.id] = Infinity; }
  const inDegree = {};
  for (const t of tasks) inDegree[t.id] = 0;
  for (const t of tasks) for (const dep of t.dependencies) if (graph[dep]) inDegree[t.id]++;
  const queue = tasks.filter((t) => inDegree[t.id] === 0).map((t) => t.id);
  const topo = [];
  while (queue.length > 0) {
    const id = queue.shift();
    topo.push(id);
    for (const next of graph[id] || []) { inDegree[next]--; if (inDegree[next] === 0) queue.push(next); }
  }
  for (const id of topo) {
    const t = taskMap[id];
    for (const dep of t.dependencies) {
      earliest[id] = Math.max(earliest[id], (earliest[dep] || 0) + (t.estimatedHours || 0));
    }
  }
  const maxEnd = Math.max(...Object.values(earliest));
  for (const t of tasks) latest[t.id] = maxEnd;
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i];
    const t = taskMap[id];
    for (const next of graph[id] || []) {
      latest[id] = Math.min(latest[id], (latest[next] || maxEnd) - (taskMap[next]?.estimatedHours || 0));
    }
  }
  const critical = tasks.filter((t) => Math.abs((earliest[t.id] || 0) - (latest[t.id] || 0)) < 0.01);
  return critical.map((t) => ({ id: t.id, title: t.title, hours: t.estimatedHours }));
}

export function prioritizeTasks(tasks) {
  for (const t of tasks) {
    let score = 0;
    const p = PRIORITY_LEVELS.find((p) => p.id === t.priority);
    score += (p?.weight || 0.5) * 0.4;
    score += Math.min(1, (t.estimatedHours || 0) / 20) * 0.2;
    score += (t.complexity === 'high' ? 0.8 : t.complexity === 'medium' ? 0.5 : 0.3) * 0.2;
    score += (t.milestone ? 1 : 0) * 0.1;
    score += (t.risks.length > 0 ? 0.7 : 0.3) * 0.1;
    t.priorityScore = Math.round(score * 100) / 100;
  }
  return [...tasks].sort((a, b) => b.priorityScore - a.priorityScore);
}

export function identifyRisks(tasks) {
  const risks = [];
  for (const t of tasks) {
    if (t.complexity === 'high') risks.push({ taskId: t.id, task: t.title, category: 'technical', severity: 'high', description: `${t.title}复杂度高，可能遇到技术难题` });
    if ((t.estimatedHours || 0) > 8) risks.push({ taskId: t.id, task: t.title, category: 'schedule', severity: 'medium', description: `${t.title}预估工时${t.estimatedHours}小时，可能延误` });
    if (t.dependencies.length > 2) risks.push({ taskId: t.id, task: t.title, category: 'external', severity: 'medium', description: `${t.title}依赖${t.dependencies.length}个前置任务，依赖风险高` });
    if (t.milestone) risks.push({ taskId: t.id, task: t.title, category: 'quality', severity: 'high', description: `${t.title}是里程碑任务，质量要求高` });
  }
  return risks;
}

export function generateProjectPlan(objective, tasks, dependencies, risks) {
  const prioritized = prioritizeTasks(tasks);
  const milestones = tasks.filter((t) => t.milestone);
  return {
    objective: String(objective || '').slice(0, 200),
    totalTasks: tasks.length,
    totalEstimatedHours: dependencies.totalEstimatedHours,
    criticalPath: dependencies.criticalPath,
    criticalPathLength: dependencies.criticalPath.length,
    hasCycle: dependencies.hasCycle,
    milestones: milestones.map((m) => ({ id: m.id, title: m.title, hours: m.estimatedHours })),
    topPriorities: prioritized.slice(0, 5).map((t) => ({ id: t.id, title: t.title, priority: t.priority, score: t.priorityScore, hours: t.estimatedHours })),
    risks: risks.slice(0, 10),
    riskCount: risks.length,
    highRiskCount: risks.filter((r) => r.severity === 'high').length,
  };
}

export class ProjectFuse {
  constructor(options = {}) {
    this.maxDecompositions = options.maxDecompositions || 5;
    this.maxTasks = options.maxTasks || 40;
    this.maxTokenBudget = options.maxTokenBudget || 20000;
    this.decompositionCount = 0;
    this.taskCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkDecomposition() {
    if (this.decompositionCount >= this.maxDecompositions) { this.trip(`拆解次数熔断：${this.maxDecompositions}`); return false; }
    this.decompositionCount++;
    return true;
  }
  checkTask(count) {
    this.taskCount += count;
    if (this.taskCount >= this.maxTasks) { this.trip(`任务数熔断：${this.maxTasks}`); return false; }
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.decompositionCount = 0; this.taskCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { decompositionCount: this.decompositionCount, maxDecompositions: this.maxDecompositions, taskCount: this.taskCount, maxTasks: this.maxTasks, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class ProjectStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { projectsPlanned: 0, totalTasks: 0, totalHours: 0, avgCriticalPath: 0, totalRisks: 0, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordProject(id, tasks, hours, criticalPathLen, risks) {
    const s = this.getSession(id);
    s.projectsPlanned++;
    s.totalTasks += tasks;
    s.totalHours += hours;
    s.avgCriticalPath = (s.avgCriticalPath * (s.projectsPlanned - 1) + criticalPathLen) / s.projectsPlanned;
    s.totalRisks += risks;
  }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    return { projectsPlanned: s.projectsPlanned, totalTasks: s.totalTasks, totalHours: s.totalHours, avgCriticalPath: Math.round(s.avgCriticalPath * 10) / 10, totalRisks: s.totalRisks, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class ProjectEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = PROJECT_TIERS[this.intensity] || PROJECT_TIERS.medium;
    this.fuse = new ProjectFuse({ maxTasks: this.tier.maxTasks });
    this.stats = new ProjectStats();
  }
  setIntensity(i) { if (PROJECT_TIERS[i]) { this.intensity = i; this.tier = PROJECT_TIERS[i]; } }
  async plan(sessionId, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    if (!this.fuse.checkDecomposition()) return { ok: false, reason: this.fuse.tripReason };
    const shuffled = [...DECOMPOSITION_STRATEGIES].sort(() => Math.random() - 0.5);
    const strategies = shuffled.slice(0, this.tier.strategyCount);
    let bestPlan = null;
    let bestScore = 0;
    for (const strategy of strategies) {
      if (!this.fuse.checkToken(800)) break;
      const tasks = generateWBS(objective, strategy.id, this.tier.maxTasks, this.tier.maxDepth);
      if (!this.fuse.checkTask(tasks.length)) break;
      const dependencies = analyzeDependencies(tasks);
      const risks = identifyRisks(tasks);
      const plan = generateProjectPlan(objective, tasks, dependencies, risks);
      const score = Math.min(1, (plan.totalTasks / this.tier.maxTasks) * 0.3 + (plan.criticalPathLength / 5) * 0.2 + (1 - plan.hasCycle ? 0.2 : 0) + (1 - Math.min(1, plan.highRiskCount / 5)) * 0.3);
      if (score > bestScore) { bestScore = score; bestPlan = { ...plan, strategy: strategy.name, strategyId: strategy.id, score: Math.round(score * 100) / 100, tasks: tasks.map((t) => ({ id: t.id, title: t.title, depth: t.depth, priority: t.priority, priorityScore: t.priorityScore, hours: t.estimatedHours, complexity: t.complexity, milestone: t.milestone, dependencies: t.dependencies })) }; }
    }
    if (bestPlan) this.stats.recordProject(sessionId, bestPlan.totalTasks, bestPlan.totalEstimatedHours, bestPlan.criticalPathLength, bestPlan.riskCount);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, plan: bestPlan, strategiesTried: strategies.length, bestScore, fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

export function createProjectPrompt(objective, intensity = 'medium') {
  const tier = PROJECT_TIERS[intensity] || PROJECT_TIERS.medium;
  return [`【Think 项目化拆解·${tier.label}档激活】`, `将问题视为项目，用 ${tier.strategyCount} 种拆解策略（按阶段/按模块/按依赖/按交付物等）生成 WBS（最多 ${tier.maxTasks} 个任务，最深 ${tier.maxDepth} 层）。`, `自动分析任务依赖、拓扑排序、关键路径、优先级排序、风险识别、工时估算。`, `输出完整项目计划：任务清单+依赖图+关键路径+里程碑+风险清单+优先级排序。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
