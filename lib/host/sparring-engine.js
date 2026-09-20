// sparring-engine.js — Think 多智能体对练·完整引擎
// 独立引擎文件：角色库 / 对练协议 / 攻击-防守-反击循环 / 裁判评分 /
// 胜者合成 / 多轮对练 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

export const SPARRING_ROLES = [
  { id: 'proponent', name: '正方', persona: '你是正方辩手，坚信你的立场是正确的。用最有力的论据、最严密的逻辑、最充分的证据来捍卫你的立场。主动预判对方的攻击并提前封堵。', style: 'aggressive' },
  { id: 'opponent', name: '反方', persona: '你是反方辩手，坚信正方的立场是错误的或有重大缺陷。用最锋利的攻击、最刁钻的反例、最严密的逻辑来拆解正方的论证。不放过任何一个漏洞。', style: 'aggressive' },
  { id: 'skeptic', name: '怀疑论者', persona: '你是极端怀疑论者，默认所有结论都是错的。对每一个断言都要求证据，对每一个推理都要求证明，对每一个前提都要求验证。不被任何"显然可知"说服。', style: 'critical' },
  { id: 'mediator', name: '调解者', persona: '你是中立调解者，不站任何一方。你的目标是找到双方立场中的合理部分，识别真正的分歧点，探索可能的共识或折中方案。保持客观公正。', style: 'neutral' },
  { id: 'devil', name: '魔鬼代言人', persona: '你是魔鬼代言人，专门站在对立立场攻击。你不是为了否定而否定，而是通过最锋利的攻击来检验立场的真正强度。找出最隐蔽的漏洞。', style: 'critical' },
  { id: 'expert', name: '领域专家', persona: '你是该问题所在领域的资深专家。用领域内的最佳实践、前沿研究、常见陷阱来评判双方的论证。指出哪些是领域共识、哪些是有争议的、哪些是错误的。', style: 'authoritative' },
];

export const SPARRING_TIERS = {
  light: { label: '轻', roleCount: 2, maxRounds: 2, maxReflections: 1, tokenBudgetMultiplier: 2.0 },
  medium: { label: '中', roleCount: 3, maxRounds: 3, maxReflections: 2, tokenBudgetMultiplier: 3.5 },
  heavy: { label: '重', roleCount: 4, maxRounds: 4, maxReflections: 3, tokenBudgetMultiplier: 5.5 },
  extreme: { label: '极', roleCount: 6, maxRounds: 6, maxReflections: 5, tokenBudgetMultiplier: 8.0 },
};

export const SPARRING_SCORE_DIMENSIONS = [
  { id: 'logic', name: '逻辑严密性', weight: 0.25 },
  { id: 'evidence', name: '证据充分性', weight: 0.20 },
  { id: 'rebuttal', name: '反驳有效性', weight: 0.20 },
  { id: 'clarity', name: '表达清晰性', weight: 0.15 },
  { id: 'depth', name: '论证深度', weight: 0.15 },
  { id: 'style', name: '辩风', weight: 0.05 },
];

export class SparringRound {
  constructor(roundNo) {
    this.roundNo = roundNo;
    this.arguments = [];
    this.judgment = null;
    this.winner = null;
  }
  addArgument(role, text) { this.arguments.push({ role, text, timestamp: Date.now() }); }
}

export function scoreArgument(argument, role, allArguments) {
  if (!argument || typeof argument !== 'string') return { total: 0, dimensions: {} };
  const scores = {};
  let total = 0;
  for (const dim of SPARRING_SCORE_DIMENSIONS) {
    let s = heuristicSparringScore(dim.id, argument, role);
    scores[dim.id] = Math.round(s * 100) / 100;
    total += s * dim.weight;
  }
  return { total: Math.round(total * 100) / 100, dimensions: scores };
}

function heuristicSparringScore(dimId, text, role) {
  const len = text.length;
  switch (dimId) {
    case 'logic':
      if (/因为|所以|因此|由于|导致|从而|推理|推导|证明|前提|结论/.test(text)) return 0.8;
      if (len > 200) return 0.65;
      return 0.5;
    case 'evidence':
      if (/根据|来源|数据|研究|实验|统计|引用|证据|事实/.test(text)) return 0.85;
      if (/例如|比如|举例|案例/.test(text)) return 0.7;
      return 0.45;
    case 'rebuttal':
      if (/反驳|驳斥|不对|错误|漏洞|缺陷|相反|反之|然而|但是/.test(text)) return 0.8;
      if (role === 'opponent' || role === 'skeptic' || role === 'devil') return 0.7;
      return 0.5;
    case 'clarity':
      if (/^#|^\d+\.|^- |首先|其次|最后|第一|第二/.test(text) || /\n\n/.test(text)) return 0.8;
      if (len > 300) return 0.6;
      return 0.55;
    case 'depth':
      if (/本质|根本|深层|底层|第一性原理|机制|原理|根源/.test(text)) return 0.85;
      if (/因为|由于|导致|引起/.test(text)) return 0.65;
      return 0.5;
    case 'style':
      if (role === 'proponent' || role === 'opponent') return 0.75;
      if (role === 'mediator') return 0.7;
      return 0.6;
    default:
      return 0.5;
  }
}

export function judgeRound(round) {
  if (!round || round.arguments.length === 0) return { winner: null, scores: {}, summary: '无论证' };
  const scores = {};
  for (const arg of round.arguments) {
    const s = scoreArgument(arg.text, arg.role, round.arguments);
    if (!scores[arg.role]) scores[arg.role] = { total: 0, count: 0 };
    scores[arg.role].total += s.total;
    scores[arg.role].count++;
  }
  for (const role of Object.keys(scores)) {
    scores[role].avg = Math.round((scores[role].total / scores[role].count) * 100) / 100;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1].avg - a[1].avg);
  const winner = sorted.length > 0 ? sorted[0][0] : null;
  const runnerUp = sorted.length > 1 ? sorted[1][0] : null;
  const margin = winner && runnerUp ? Math.round((scores[winner].avg - scores[runnerUp].avg) * 100) / 100 : 0;
  return { winner, runnerUp, margin, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.avg])), decisive: margin >= 0.15, summary: `${winner}以${margin}分优势胜出` };
}

export function buildSparringPrompt(role, objective, history, roundNo) {
  const r = SPARRING_ROLES.find((x) => x.id === role) || SPARRING_ROLES[0];
  const historyText = history && history.length > 0
    ? `\n\n之前的对练记录：\n${history.slice(-3).map((h, i) => `第${h.roundNo}轮：\n${h.arguments.map((a) => `[${a.role}] ${a.text.slice(0, 300)}`).join('\n')}`).join('\n\n')}`
    : '';
  return [
    `【Think 多智能体对练·第${roundNo}轮·${r.name}】`,
    `${r.persona}`,
    ``,
    `辩题/问题：${String(objective || '').slice(0, 400)}`,
    historyText,
    ``,
    `请以"${r.name}"的身份给出你的论证/反驳。要求：`,
    `1. 严格遵守你的角色立场`,
    `2. 针对之前的论证给出具体回应`,
    `3. 用逻辑和证据说话，不做无根据的断言`,
    `4. 论证长度控制在200-500字`,
  ].join('\n');
}

export function synthesizeWinner(rounds, objective) {
  const allJudgments = rounds.filter((r) => r.judgment && r.judgment.winner);
  if (allJudgments.length === 0) return null;
  const winnerCounts = {};
  for (const j of allJudgments) winnerCounts[j.winner] = (winnerCounts[j.winner] || 0) + 1;
  const overallWinner = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const winningRounds = rounds.filter((r) => r.judgment?.winner === overallWinner);
  const bestArguments = [];
  for (const r of winningRounds) {
    for (const arg of r.arguments) {
      if (arg.role === overallWinner) bestArguments.push(arg.text.slice(0, 300));
    }
  }
  return {
    overallWinner,
    winnerRole: SPARRING_ROLES.find((r) => r.id === overallWinner)?.name || overallWinner,
    roundsWon: winnerCounts[overallWinner] || 0,
    totalRounds: rounds.length,
    winRate: `${Math.round(((winnerCounts[overallWinner] || 0) / rounds.length) * 100)}%`,
    bestArguments: bestArguments.slice(0, 5),
    synthesisPrompt: [
      `【Think 多智能体对练·胜者合成】`,
      `经过 ${rounds.length} 轮对练，${overallWinner}以${winnerCounts[overallWinner]}胜${rounds.length - winnerCounts[overallWinner]}负胜出。`,
      ``,
      `辩题：${String(objective || '').slice(0, 300)}`,
      ``,
      `胜方最佳论证：`,
      ...bestArguments.slice(0, 5).map((a, i) => `${i + 1}. ${a}`),
      ``,
      `请综合胜方的最佳论证，给出一个完整、严谨、有说服力的最终结论。同时吸收败方论证中的合理部分。`,
    ].join('\n'),
  };
}

export class SparringFuse {
  constructor(options = {}) {
    this.maxSessions = options.maxSessions || 5;
    this.maxRounds = options.maxRounds || 6;
    this.maxTokenBudget = options.maxTokenBudget || 30000;
    this.sessionCount = 0;
    this.roundCount = 0;
    this.tokenEstimate = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkSession() {
    if (this.sessionCount >= this.maxSessions) { this.trip(`对练次数熔断：${this.maxSessions}`); return false; }
    this.sessionCount++;
    return true;
  }
  checkRound() {
    if (this.roundCount >= this.maxRounds) { this.trip(`轮次熔断：${this.maxRounds}`); return false; }
    this.roundCount++;
    return true;
  }
  checkToken(est) {
    this.tokenEstimate += est || 0;
    if (this.tokenEstimate >= this.maxTokenBudget) { this.trip(`Token熔断：${this.maxTokenBudget}`); return false; }
    return true;
  }
  trip(r) { this.tripped = true; this.tripReason = r; }
  reset() { this.sessionCount = 0; this.roundCount = 0; this.tokenEstimate = 0; this.tripped = false; this.tripReason = ''; }
  status() { return { sessionCount: this.sessionCount, maxSessions: this.maxSessions, roundCount: this.roundCount, maxRounds: this.maxRounds, tokenEstimate: this.tokenEstimate, tripped: this.tripped, tripReason: this.tripReason }; }
}

export class SparringStats {
  constructor() { this.sessions = new Map(); }
  getSession(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { sparringSessions: 0, totalRounds: 0, totalArguments: 0, decisiveRate: 0, roleWinCounts: {}, fuseTrips: 0, startTime: Date.now() });
    return this.sessions.get(id);
  }
  recordSession(id, rounds, args, decisive) {
    const s = this.getSession(id);
    s.sparringSessions++;
    s.totalRounds += rounds;
    s.totalArguments += args;
    s.decisiveRate = (s.decisiveRate * (s.sparringSessions - 1) + (decisive ? 1 : 0)) / s.sparringSessions;
  }
  recordRoleWin(id, role) { const s = this.getSession(id); s.roleWinCounts[role] = (s.roleWinCounts[role] || 0) + 1; }
  recordFuseTrip(id) { this.getSession(id).fuseTrips++; }
  summary(id) {
    const s = this.getSession(id);
    const topRoles = Object.entries(s.roleWinCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([role, count]) => { const r = SPARRING_ROLES.find((x) => x.id === role); return { name: r?.name || role, count }; });
    return { sparringSessions: s.sparringSessions, totalRounds: s.totalRounds, totalArguments: s.totalArguments, decisiveRate: `${Math.round(s.decisiveRate * 100)}%`, topWinners: topRoles, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

export class SparringEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = SPARRING_TIERS[this.intensity] || SPARRING_TIERS.medium;
    this.fuse = new SparringFuse({ maxRounds: this.tier.maxRounds });
    this.stats = new SparringStats();
  }
  setIntensity(i) { if (SPARRING_TIERS[i]) { this.intensity = i; this.tier = SPARRING_TIERS[i]; } }
  async spar(sessionId, objective, steerFn) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason };
    if (!this.fuse.checkSession()) return { ok: false, reason: this.fuse.tripReason };
    const shuffled = [...SPARRING_ROLES].sort(() => Math.random() - 0.5);
    const roles = shuffled.slice(0, this.tier.roleCount);
    const rounds = [];
    let totalArgs = 0;
    for (let roundNo = 1; roundNo <= this.tier.maxRounds; roundNo++) {
      if (this.fuse.tripped) break;
      if (!this.fuse.checkRound()) break;
      const round = new SparringRound(roundNo);
      for (const role of roles) {
        if (!this.fuse.checkToken(500)) break;
        const prompt = buildSparringPrompt(role.id, objective, rounds, roundNo);
        if (typeof steerFn === 'function') {
          try {
            const result = await steerFn(prompt, 'sparring-argue');
            const text = result?.text || result?.content || '';
            if (text) { round.addArgument(role.id, text); totalArgs++; }
          } catch (e) { /* 论证失败不阻断 */ }
        }
      }
      round.judgment = judgeRound(round);
      if (round.judgment.winner) this.stats.recordRoleWin(sessionId, round.judgment.winner);
      rounds.push(round);
      if (round.judgment.decisive && roundNo >= 2) break;
    }
    const synthesis = synthesizeWinner(rounds, objective);
    const decisive = rounds.some((r) => r.judgment?.decisive);
    this.stats.recordSession(sessionId, rounds.length, totalArgs, decisive);
    if (this.fuse.tripped) this.stats.recordFuseTrip(sessionId);
    return { ok: true, roles: roles.map((r) => ({ id: r.id, name: r.name })), rounds: rounds.map((r) => ({ roundNo: r.roundNo, argCount: r.arguments.length, judgment: r.judgment })), totalRounds: rounds.length, totalArguments: totalArgs, synthesis, decisive, fuseStatus: this.fuse.status() };
  }
  getStats(id) { return this.stats.summary(id); }
  getFuseStatus() { return this.fuse.status(); }
  reset() { this.fuse.reset(); }
}

export function createSparringPrompt(objective, intensity = 'medium') {
  const tier = SPARRING_TIERS[intensity] || SPARRING_TIERS.medium;
  return [`【Think 多智能体对练·${tier.label}档激活】`, `${tier.roleCount}个智能体角色（正方/反方/怀疑论者/调解者/魔鬼代言人/领域专家）就问题进行${tier.maxRounds}轮对练。`, `每轮各角色独立论证，6维评分（逻辑/证据/反驳/清晰/深度/辩风），裁判判定单轮胜者。`, `多轮后统计总胜率，合成胜方最佳论证+败方合理部分，给出最终结论。`, `目标：${String(objective || '').slice(0, 300)}`].join('\n');
}
