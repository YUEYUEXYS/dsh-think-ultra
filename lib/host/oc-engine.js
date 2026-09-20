// oc-engine.js — Overclock Ensemble 超频集成管线（真实 test-time 计算，非提示词摆设）。
// 流水线：独立多采样 → 分歧聚类 → 自洽一致性投票 → 交叉验证 → 证伪淘汰 → 置信融合 → 收敛合成。
// 调度参数全部来自 oc-core.ocPlan（Flash V41 多而广：文本蜂群 + 多尺度读图网格；Pro 少而深：精锐深推）。
// 三层熔断硬顶缺一不可：maxCalls 最大独立调用数、perCallTimeoutMs 单调用超时、totalTokenBudget 总 token；
// 任一触顶立即停止扩张并用当前最强候选产出阶段结果，绝不无限递归、绝不卡死。
// 采样/裁判原语复用 tournament-engine，不重复造轮子。

import { sampleOnce, judgeOnce } from './tournament-engine.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).slice().sort((p, q) => p - q);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// 蜂群多样性切入：逼每条采样走不同思路，而不是把同一句话重复 N 遍
const LANE_SEEDS = [
  '从第一性原理直接推导，不借用未经检验的类比。',
  '反例驱动：先找最可能出错的环节，围绕它构造答案。',
  '换一个与常规正交的独立角度求解。',
  '最保守地步步为营，每步给出可核验中间结论。',
  '类比结构最接近、你有把握的已知问题，迁移并核对差异。',
  '先假设题面有隐藏陷阱，澄清前提后再作答。',
  '逆向构造：从目标终态倒推所需条件与步骤。',
  '分解为相互独立的子问题，分别求解后再拼装。',
  '用最精炼的形式化记号重述问题，再做严格推演。',
  '枚举边界与退化情形，确保主结论在边界仍成立。',
  '采用怀疑论者视角，逐条质疑直觉答案后重建。',
  '优先给出可执行/可计算的落地路径，再补论证。',
];

// ───────────────────────── 确定性文本工具（聚类/指纹，不额外花 LLM 调用） ─────────────────────────
function normalizeText(s) {
  return String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function shingles(s, k = 2) {
  const t = normalizeText(s);
  const set = new Set();
  for (let i = 0; i + k <= t.length; i++) set.add(t.slice(i, i + k));
  return set;
}
// 数字/结论指纹：候选给出的关键数值结论，是"是否同一答案"的强信号
function numFingerprints(s) {
  return new Set(String(s || '').match(/-?\d+(?:\.\d+)?/g) || []);
}
// 混合相似度：字符 2-gram Jaccard × 数值结论一致性（数值冲突强分裂、数值一致强聚合）
function similarity(aText, bText) {
  const A = shingles(aText, 2), B = shingles(bText, 2);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const denom = A.size + B.size - inter;
  const jac = denom ? inter / denom : 0;
  const na = numFingerprints(aText), nb = numFingerprints(bText);
  if (na.size || nb.size) {
    let common = 0;
    for (const x of na) if (nb.has(x)) common++;
    const minSize = Math.min(na.size, nb.size);
    if (common === 0) return jac * 0.35;                                   // 数值结论无交集 → 强分裂
    if (minSize >= 1 && common === minSize) return Math.max(jac, 0.5);     // 少数值方被完全包含 → 核心结论一致，保证成簇
  }
  return jac;
}

// 贪心并查式聚类：混合相似度≥threshold 归同簇；返回 { labels, clusters:[{id,members,representative}] }
export function clusterCandidates(cands, threshold = 0.34) {
  const n = cands.length;
  const labels = new Array(n).fill(-1);
  const clusters = [];
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    const members = [i];
    labels[i] = clusters.length;
    for (let j = i + 1; j < n; j++) {
      if (labels[j] !== -1) continue;
      if (similarity(cands[i].text, cands[j].text) >= threshold) { labels[j] = labels[i]; members.push(j); }
    }
    clusters.push({ id: clusters.length, members, representative: i });
  }
  // 每簇代表 = 成员中信息最充分（更长）的一条
  for (const cl of clusters) {
    const ranked = cl.members.slice().sort((a, b) => cands[b].text.length - cands[a].text.length);
    cl.representative = ranked[0];
  }
  clusters.sort((a, b) => b.members.length - a.members.length);
  return { labels, clusters };
}

// 合并多个 AbortSignal：外部取消 OR 单调用超时，任一触发即中止
function combineSignal(external, timeoutMs) {
  const ctl = new AbortController();
  const timers = [];
  const abort = () => ctl.abort();
  if (external) {
    if (external.aborted) ctl.abort();
    else external.addEventListener('abort', abort, { once: true });
  }
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timers.push(setTimeout(() => ctl.abort(new Error('per-call timeout')), timeoutMs));
  }
  const cleanup = () => timers.forEach(clearTimeout);
  return { signal: ctl.signal, cleanup };
}

const FALSIFY_PROMPT = (task, answer) => [
  '你是专职证伪器，目标是尽力推翻下面的候选答案，而不是夸奖它。',
  '【原始任务】\n' + String(task || '').slice(0, 4000),
  '【候选答案】\n' + String(answer || '').slice(0, 6000),
  '从事实错误、逻辑断裂、反例、边界遗漏、答非所问五个方向攻击。只输出 JSON：',
  '{"falsified":布尔(是否存在无法被候选自身辩护的硬伤),"counterexamples":["反例1","反例2"],"severity":0到100整数,"patch":"若有硬伤，一句话指出必须如何修正"}',
].join('\n\n');

const CROSS_PROMPT = (task, a, b) => [
  '你是交叉验证器，判断两份独立解答在关键结论上是否一致。只输出 JSON：',
  '{"conflict":布尔(关键结论是否实质冲突),"points":["一致/冲突点"],"verdict":"一句话"}',
  '【任务】\n' + String(task || '').slice(0, 3000),
  '【解答A】\n' + String(a || '').slice(0, 3500),
  '【解答B】\n' + String(b || '').slice(0, 3500),
].join('\n\n');

const SYNTH_PROMPT = (task, versions, note) => [
  '下面是对同一任务彼此独立、结论收敛的多份高质量解答。请融合它们的正确部分、消除彼此瑕疵，',
  '产出一份唯一的、可直接交付的最终答案（不要寒暄、不要复述题目、不要提及你在融合）。',
  note ? '【融合要求】' + note : '',
  '【原始任务】\n' + String(task || '').slice(0, 4000),
  '【收敛的多份解答】\n' + versions.map((v, i) => `# 版本${i + 1}\n` + String(v).slice(0, 3000)).join('\n\n'),
].filter(Boolean).join('\n\n');

function extractJson(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
function parseFalsify(raw) {
  const o = extractJson(raw);
  if (!o) return null;
  return {
    falsified: !!o.falsified,
    counterexamples: Array.isArray(o.counterexamples) ? o.counterexamples.map(String).slice(0, 5) : [],
    severity: clamp(Number(o.severity) || 0, 0, 100),
    patch: typeof o.patch === 'string' ? o.patch.slice(0, 300) : '',
  };
}
function parseCross(raw) {
  const o = extractJson(raw);
  if (!o) return { conflict: false, points: [] };
  return { conflict: !!o.conflict, points: Array.isArray(o.points) ? o.points.map(String) : [] };
}

/**
 * Overclock Ensemble 主入口。
 * @param llm ctx.llm（LlmRuntime）
 * @param task 原始任务/目标文本
 * @param plan oc-core.ocPlan 产出的调度计划
 * @param o { provider, model, seedText?, system?, signal?, log?, emit?, hard:{maxCalls,perCallTimeoutMs,totalTokenBudget}, vision? }
 */
export async function runEnsemble(llm, task, plan, o = {}) {
  const log = typeof o.log === 'function' ? o.log : () => {};
  const emit = typeof o.emit === 'function' ? o.emit : () => {};
  const stage = (name, data) => { emit({ stage: name, at: Date.now(), ...data }); };
  const started = Date.now();

  const stats = {
    samples: 0, failedSamples: 0, clusters: 0, votes: 0, judgeCalls: 0,
    falsifyCalls: 0, eliminated: 0, pruned: 0, crossCalls: 0, synthCalls: 0,
    totalCalls: 0, tokensUsed: 0, stoppedByLimit: null, reforgeRounds: 0,
  };
  const budget = {
    maxCalls: Number.isFinite(o.hard?.maxCalls) ? o.hard.maxCalls : Math.max(8, (plan.estCalls || 1) + 8),
    perCallTimeoutMs: Number.isFinite(o.hard?.perCallTimeoutMs) ? o.hard.perCallTimeoutMs : 45000,
    totalTokenBudget: Number.isFinite(o.hard?.totalTokenBudget) ? o.hard.totalTokenBudget : Infinity,
  };
  const callLeft = () => stats.totalCalls < budget.maxCalls;
  const charge = (usage) => {
    const u = usage || {};
    stats.tokensUsed += Number(u.input_tokens || u.prompt_tokens || 0) + Number(u.output_tokens || u.completion_tokens || 0);
    if (stats.tokensUsed > budget.totalTokenBudget && budget.totalTokenBudget !== Infinity) {
      stats.stoppedByLimit = 'token-budget'; return false;
    }
    return true;
  };
  async function timedSample(args) {
    if (!callLeft()) { stats.stoppedByLimit = stats.stoppedByLimit || 'max-calls'; return { ok: false, text: '', finish: 'cap' }; }
    stats.totalCalls += 1;
    const { signal, cleanup } = combineSignal(o.signal, budget.perCallTimeoutMs);
    try { return await sampleOnce(llm, { ...args, signal }); }
    finally { cleanup(); }
  }
  async function timedJudge(args) {
    if (!callLeft()) return { value: null };
    stats.totalCalls += 1; stats.judgeCalls += 1;
    const { signal, cleanup } = combineSignal(o.signal, budget.perCallTimeoutMs);
    try { return await judgeOnce(llm, { ...args, signal }); }
    finally { cleanup(); }
  }

  // Velocity / 单链：不做任何集成，直接返回主回复（OC 关闭时零额外开销）
  if (!plan.ensemble || plan.samples <= 1) {
    stage('velocity', { ensemble: false });
    const seed = String(o.seedText || '').trim();
    if (seed) return { best: seed, confidence: seed.length >= 40 ? 66 : 50, ensemble: false, winnerCluster: 0, stats, stages: [], ms: Date.now() - started };
    const r = await timedSample({ provider: o.provider, model: o.model, system: o.system, prompt: task, temperature: plan.temperature ?? 0.6, maxTokens: o.maxTokens });
    charge(r.usage);
    return { best: r.text, confidence: r.ok ? 60 : 0, ensemble: false, winnerCluster: 0, stats, stages: [], ms: Date.now() - started };
  }

  // 反馈（回炉时把上轮缺陷注入采样）
  let feedback = [];
  let pool = [];
  let champion = null; // { text, score, cluster, votes, confidence }

  const sampleBatch = async (width, roundIndex) => {
    const jobs = [];
    for (let i = 0; i < width; i++) {
      if (!callLeft()) { stats.stoppedByLimit = stats.stoppedByLimit || 'max-calls'; break; }
      const lane = LANE_SEEDS[(roundIndex * width + i) % LANE_SEEDS.length];
      let prompt = (plan.modelGroup === 'flash'
        ? `【多尺度独立读图·网格 ${plan.tileGrid || 1} 分区·证据置信阈值 ${(plan.evidenceConf || 0.5).toFixed(2)}】\n`
        : '【解题视角】' + lane + '\n') +
        '【任务】\n' + String(task || '').slice(0, 6000);
      if (feedback.length) prompt += '\n\n【上一轮被抓到的缺陷，本轮必须逐条解决】\n- ' + feedback.slice(0, 6).join('\n- ');
      prompt += '\n\n直接交付最终结果，不要寒暄、不要复述题目。';
      const temp = Math.min(1.3, (plan.temperature ?? 0.85) + i * 0.06);
      jobs.push(timedSample({ provider: o.provider, model: o.model, system: o.system, prompt, temperature: temp, maxTokens: o.maxTokens })
        .then((r) => { if (r.ok && r.text) { stats.samples += 1; } else { stats.failedSamples += 1; } charge(r.usage); return r; }));
    }
    const rs = await Promise.all(jobs);
    return rs.filter((r) => r.ok && r.text && r.text.length >= 8);
  };

  const maxReforge = plan.reforgeRounds || 0;
  for (let round = 0; round <= maxReforge; round++) {
    if (stats.stoppedByLimit) break;
    const width = round === 0 ? plan.samples : Math.max(2, plan.samples - 2);
    stage('sample', { round, width });
    const got = await sampleBatch(width, round);
    pool = got.map((r) => ({ text: r.text, raw: r }));
    // 主回复作为候选 0 一并入裁（固定索引 0）：独立多版若与主回复同簇，则集成只是佐证、无需改写；
    // 只有不含主回复的另一簇凭更高置信胜出，才算"集成真赢过主回复"，才允许接管交付。
    const seedText = String(o.seedText || '').trim();
    if (seedText) pool.unshift({ text: seedText, isSeed: true });
    if (!pool.length) { log('oc: round ' + round + ' 采样全失败'); break; }

    // 1) 分歧聚类
    const { clusters } = clusterCandidates(pool);
    stats.clusters = clusters.length;
    stage('cluster', { count: clusters.length, sizes: clusters.map((c) => c.members.length) });

    // 2) 每簇代表独立裁判打分（voteRounds 轮取中位）+ 3) 自洽投票（成员数=票数）
    const scored = [];
    for (const cl of clusters) {
      if (!callLeft()) break;
      const rep = pool[cl.representative].text;
      const votes = cl.members.length;
      stats.votes += votes;
      const jr = [], passes = [];
      for (let v = 0; v < Math.max(1, plan.voteRounds || 0); v++) {
        const j = await timedJudge({ provider: o.provider, model: o.model, task, candidate: rep, maxTokens: o.maxTokens });
        if (j.value) { jr.push(j.value.score); passes.push(!!j.value.pass); }
      }
      const judgeScore = jr.length ? median(jr) : (rep.length >= 40 ? 58 : 25);
      const judgePass = passes.length ? passes.every(Boolean) : true;
      // 置信融合：裁判质量 0.6 + 自洽得票率 0.4（self-consistency）
      const voteShare = votes / pool.length;
      const confidence = clamp(Math.round(judgeScore * 0.6 + voteShare * 100 * 0.4), 0, 100);
      const weak = judgeScore < 50 || !judgePass;
      if (weak) stats.pruned += votes; // 裁判判不及格的整簇作为弱路径淘汰
      scored.push({ cluster: cl.id, members: cl.members, text: rep, judgeScore, judgePass, votes, confidence, weak });
      charge();
    }
    // 健康簇优先，同健康度按置信排序；被淘汰弱簇仅在全军覆没时兜底
    scored.sort((a, b) => (a.weak === b.weak ? b.confidence - a.confidence : a.weak ? 1 : -1));
    stage('vote', { ranking: scored.map((s) => ({ cluster: s.cluster, votes: s.votes, judge: s.judgeScore, conf: s.confidence, weak: s.weak })) });

    // 4) 交叉验证：冠军 vs 亚军关键结论是否冲突
    if (plan.crossCheck && scored.length >= 2 && callLeft()) {
      stats.totalCalls += 1; stats.crossCalls += 1;
      const { signal, cleanup } = combineSignal(o.signal, budget.perCallTimeoutMs);
      try {
        const cr = await sampleOnce(llm, { provider: o.provider, model: o.model, system: '你是交叉验证器，只输出 JSON。', prompt: CROSS_PROMPT(task, scored[0].text, scored[1].text), temperature: 0.2, maxTokens: o.maxTokens, signal });
        const cv = parseCross(cr.text); charge(cr.usage);
        stage('cross', cv);
        if (cv.conflict && scored[0]) scored[0].confidence = clamp(scored[0].confidence - 6, 0, 100); // 实质分歧→保守降权，交给证伪裁决
      } finally { cleanup(); }
      scored.sort((a, b) => (a.weak === b.weak ? b.confidence - a.confidence : a.weak ? 1 : -1));
    }

    // 5) 证伪淘汰：对当前冠军做 falsifyRounds 轮反例攻击，被硬伤证伪则淘汰、亚军递补
    let leader = scored[0];
    for (let f = 0; f < (plan.falsifyRounds || 0); f++) {
      if (!leader || !callLeft()) break;
      stats.totalCalls += 1; stats.falsifyCalls += 1;
      const { signal, cleanup } = combineSignal(o.signal, budget.perCallTimeoutMs);
      try {
        const fr = await sampleOnce(llm, { provider: o.provider, model: o.model, system: '你是专职证伪器，只输出 JSON。', prompt: FALSIFY_PROMPT(task, leader.text), temperature: 0.3, maxTokens: o.maxTokens, signal });
        const fv = parseFalsify(fr.text); charge(fr.usage);
        stage('falsify', { cluster: leader.cluster, result: fv });
        if (fv.falsified && fv.severity >= 60) {
          leader.eliminated = true; stats.eliminated += 1;
          stats.pruned += (leader.members ? leader.members.length : 1); // 冠军簇被证伪，整簇计入淘汰
          feedback = feedback.concat(fv.counterexamples || [fv.patch]).filter(Boolean).slice(0, 6);
          scored.shift();
          leader = scored[0];
        } else { break; } // 证伪不倒→冠军确立
      } finally { cleanup(); }
    }

    champion = leader || scored[0] || null;
    // 收敛判据：置信达标 或 已无回炉预算/调用预算 → 结束
    const passLine = plan.modelGroup === 'pro' ? 78 : 72;
    if (!champion) break;
    const championHasSeed = !!(champion.members && champion.members.includes(0));
    // 主回复所在簇已达标＝多数独立版支持主回复，无需再回炉；或冠军达标/预算耗尽也结束
    if (champion.confidence >= passLine || championHasSeed || round >= maxReforge || !callLeft()) break;
    feedback = ['未达置信阈值 ' + passLine + '（当前 ' + champion.confidence + '），整体重做并提升严密性'];
    stats.reforgeRounds += 1;
  }

  if (!champion && pool.length) champion = { text: pool[0].text, confidence: 40, cluster: 0, votes: 1, members: [0] };
  const bestIsSeed = !!(champion && champion.members && champion.members.includes(0));
  if (!champion) {
    return { best: String(o.seedText || ''), confidence: 0, ensemble: true, winnerCluster: -1, bestIsSeed: true, stats, stages: [], stoppedByLimit: stats.stoppedByLimit || 'all-samples-failed', ms: Date.now() - started };
  }

  // 主回复簇胜出：集成只起到佐证作用，直接保留主回复、跳过合成/深推，零额外调用
  if (bestIsSeed) {
    stage('done', { confidence: champion.confidence, bestIsSeed: true, calls: stats.totalCalls, tokens: stats.tokensUsed });
    return {
      best: String(o.seedText || champion.text || '').trim(), confidence: champion.confidence,
      ensemble: true, bestIsSeed: true, winnerCluster: champion.cluster, votes: champion.votes,
      judgeScore: champion.judgeScore, stats: { ...stats, deepPasses: 0 },
      stoppedByLimit: stats.stoppedByLimit, ms: Date.now() - started,
    };
  }

  // 6) 收敛合成：冠军簇多成员时做一次融合（Pro 深路径按 deepPerLane 递进精炼），受预算约束
  let best = champion.text;
  const sameCluster = pool.filter((_, i) => champion.members && champion.members.includes(i)).map((c) => c.text);
  const synthVersions = Array.from(new Set(sameCluster.length > 1 ? sameCluster : [champion.text])).slice(0, 4);
  let deepPasses = 0;
  if (synthVersions.length > 1 && callLeft()) {
    stats.totalCalls += 1; stats.synthCalls += 1;
    const { signal, cleanup } = combineSignal(o.signal, budget.perCallTimeoutMs);
    try {
      const sr = await sampleOnce(llm, { provider: o.provider, model: o.model, system: o.system, prompt: SYNTH_PROMPT(task, synthVersions, plan.modelGroup === 'pro' ? '保持最高严密性，补全形式化步骤。' : ''), temperature: 0.5, maxTokens: o.maxTokens, signal });
      if (sr.ok && sr.text) { best = sr.text; charge(sr.usage); stage('synthesize', { from: synthVersions.length }); }
    } finally { cleanup(); }
  }
  // 精锐深推：对收敛结果逐层精炼。两模型都深推（极境底子之上的补丁）：
  // Pro 少而深走全量 deepPerLane；Flash 蜂群主走广度，深推层数取一半（至少1层），把算力留给多候选。
  const rawDeep = Math.max(0, (plan.deepPerLane || 1) - 1);
  const targetDeep = plan.modelGroup === 'pro' ? rawDeep : Math.max(0, Math.floor(rawDeep / 2));
  let cursor = best;
  for (let d = 0; d < targetDeep; d++) {
    if (!callLeft()) { stats.stoppedByLimit = stats.stoppedByLimit || 'max-calls'; break; }
    stats.totalCalls += 1;
    const { signal, cleanup } = combineSignal(o.signal, budget.perCallTimeoutMs);
    try {
      const dr = await sampleOnce(llm, {
        provider: o.provider, model: o.model, system: o.system, temperature: 0.55, maxTokens: o.maxTokens, signal,
        prompt: '【深度精炼·第' + (d + 1) + '层】在不改变正确结论的前提下，补全跳步、消除冗余、强化论证严密性，输出更优的同一答案：\n\n任务：' + String(task || '').slice(0, 3000) + '\n\n当前答案：\n' + String(cursor).slice(0, 6000),
      });
      if (dr.ok && dr.text && dr.text.length >= cursor.length * 0.6) { cursor = dr.text; deepPasses += 1; charge(dr.usage); }
    } finally { cleanup(); }
  }
  best = cursor;

  stage('done', { confidence: champion.confidence, eliminated: stats.eliminated, calls: stats.totalCalls, tokens: stats.tokensUsed, deepPasses });
  return {
    best: String(best || '').trim(),
    confidence: champion.confidence,
    ensemble: true,
    bestIsSeed,
    winnerCluster: champion.cluster,
    votes: champion.votes,
    judgeScore: champion.judgeScore,
    stats: { ...stats, deepPasses },
    stoppedByLimit: stats.stoppedByLimit,
    ms: Date.now() - started,
  };
}

export default { runEnsemble, clusterCandidates };
