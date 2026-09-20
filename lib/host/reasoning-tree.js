// reasoning-tree.js — Think 递归推演树（test-time compute 的树形展开）
//
// 单层锦标赛是「多版采样 → 裁判 → 择优」。本引擎把它递归化：
//   根层按 branch 档并行分叉出 W 个不同视角候选 → 独立裁判团打分；
//   最优候选若仍有硬伤（pass=false），不丢弃、不简单重写，而是带着缺陷再分叉一棵
//   修复子树，子树内继续裁判、继续递归，深度由 deep 档决定，最终沿分数回溯全局最优。
//   交付前再过一道反事实红队（多重宇宙证伪）：结论必须在多条独立攻击路径下存活，
//   被击杀则带击杀理由回炉一层。
//
// 与 tournament-engine 共用真实独立调用积木（ctx.llm.stream, reasoningEffort:max）。
// 防爆三件套：总调用硬顶 HARD_CALL_CAP / 并发池 POOL / AbortSignal，任何一层失败都
// 收敛到当前最优而非抛崩——这是「狠」与「不卡死」同时成立的前提。

import { sampleOnce, judgeOnce } from './tournament-engine.js';

const clampT = (v) => {
  const n = Math.round(Number(v) || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(6, n));
};

// branch 档 0..6 → 每层分叉宽度；deep 档 → 允许向下递归的层数
export const TREE_BREADTH = [0, 1, 2, 2, 3, 3, 4];
export const TREE_DEPTH = [0, 0, 1, 1, 2, 2, 3];
// 单次推演树允许的独立模型调用总硬顶（采样+裁判+红队合计），到顶立即停止扩张、收敛当前最优
const HARD_CALL_CAP = [0, 4, 8, 14, 24, 40, 72];
const POOL = 4;

const ROOT_SEEDS = [
  '从第一性原理直接推导，不借用未经检验的类比。',
  '反例驱动：先定位这个解法最可能出错的环节，围绕它构造答案。',
  '换一个与常规正交的独立角度求解。',
  '最保守地步步为营，每步给出可核验中间结论。',
];
const REPAIR_SEEDS = [
  '先补上被指出的最致命缺陷，再把整条推理链重新走通。',
  '保留站得住的子结论，只重建有缺陷的环节并复核接缝。',
  '换一条独立路径绕开被否决的环节，结论必须与保留部分一致。',
  '对被攻击点做最强辩护；辩护不成立就明确改判，不许嘴硬。',
];

const FALSIFY_DIMS = [
  '前提：结论依赖的关键前提是否真的成立，有无隐藏假设？',
  '反例：是否存在一个边界反例就能推翻它？',
  '复核：其中的数字/计算/代码行为能否用第二种方法独立复现一致？',
  '偷换：有没有答非所问、偷换概念、或以偏概全？',
];

function rootPrompt(task, i) {
  return '【解题视角】' + ROOT_SEEDS[i % ROOT_SEEDS.length] + '\n\n【任务】\n' +
    String(task || '').slice(0, 6000) + '\n\n直接交付完整结果，不要寒暄、不要复述题目。';
}
function repairPrompt(task, parent, flaws, i) {
  return '【上一版结论（需修复，不要照抄）】\n' + String(parent || '').slice(0, 4000) +
    '\n\n【被独立裁判抓到的硬伤】\n- ' + (flaws && flaws.length ? flaws.slice(0, 6).join('\n- ') : '未达交付标准，整体严密性不足') +
    '\n\n【本版修复策略】' + REPAIR_SEEDS[i % REPAIR_SEEDS.length] +
    '\n\n【原始任务】\n' + String(task || '').slice(0, 4000) +
    '\n\n交付修复后的完整结果，不要寒暄、不要复述题目、不要提及审查过程。';
}
function falsifyPrompt(task, answer) {
  return '你是结论的红队，任务是尽力【击杀】下面这个答案，不是安慰作者。逐条攻击：\n' +
    FALSIFY_DIMS.map((d, i) => (i + 1) + '. ' + d).join('\n') +
    '\n\n【原始任务】\n' + String(task || '').slice(0, 3000) +
    '\n【待击杀结论】\n' + String(answer || '').slice(0, 6000) +
    '\n\n只有当四个维度都无法构成实质反驳时才判存活。只输出一个 JSON：' +
    '{"survived":布尔,"kills":["最致命的击杀理由1","理由2"]}';
}
function parseFalsify(raw) {
  if (!raw) return { survived: false, kills: [] };
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return { survived: false, kills: [] };
  try {
    const j = JSON.parse(m[0]);
    return {
      survived: !!j.survived,
      kills: Array.isArray(j.kills) ? j.kills.map(String).slice(0, 6) : [],
    };
  } catch { return { survived: false, kills: [] }; }
}

// 受限并发：至多 pool 个任务在飞，结果按原顺序返回（不一次性炸出 W^depth 个请求）
async function mapPool(items, pool, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const n = Math.max(1, Math.min(pool, items.length));
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const k = cursor++;
      if (k >= items.length) break;
      try { out[k] = await fn(items[k], k); } catch { out[k] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * 递归推演树。
 * cfg: { provider, model, branchTier, deepTier, seedText?, maxTokens?, signal?,
 *        sample?, judge?, falsify?, log? }
 * sample/judge/falsify 可注入（测试用 mock）；缺省走 tournament-engine 的真实独立调用。
 * 返回 { best, score, pass, ran, depthUsed, calls, cap, falsified, audit }
 */
export async function runReasoningTree(llm, task, cfg) {
  const o = cfg || {};
  const log = typeof o.log === 'function' ? o.log : () => {};
  const breadth = TREE_BREADTH[clampT(o.branchTier)];
  const maxDepth = TREE_DEPTH[clampT(o.deepTier)];
  if (breadth <= 0) return { best: '', score: 0, pass: false, ran: false, depthUsed: 0, calls: 0, cap: 0, falsified: null, audit: { breadth: 0, maxDepth: 0 } };

  const driveTier = Math.max(clampT(o.branchTier), clampT(o.deepTier));
  const cap = HARD_CALL_CAP[driveTier] || 8;
  const budget = { cap, left: cap, calls: 0 };
  // 统一记账口：任何一次模型调用（含注入的自定义调用器）前先 charge，到硬顶即止
  const charge = () => { if (budget.left <= 0) return false; budget.left--; budget.calls++; return true; };
  const base = { provider: o.provider, model: o.model, maxTokens: o.maxTokens, signal: o.signal };

  const sample = o.sample || (async (prompt, temp) => {
    const r = await sampleOnce(llm, Object.assign({}, base, { prompt, temperature: temp }));
    return { text: r.text, ok: r.ok };
  });
  const judge = o.judge || (async (cand) => {
    const j1 = await judgeOnce(llm, Object.assign({}, base, { task, candidate: cand }));
    const v1 = j1.value;
    if (!o.sparring) {
      if (v1) return { score: v1.score, pass: v1.pass, flaws: v1.flaws || [] };
      return { score: cand ? 55 : 0, pass: false, flaws: ['裁判调用失败，按未通过处理'] };
    }
    // 稳健陪审：第二独立团复核；预算不足则退化为单团，绝不超调
    if (budget.left <= 0 || !charge()) {
      return v1 ? { score: v1.score, pass: v1.pass, flaws: v1.flaws || [] } : { score: cand ? 55 : 0, pass: false, flaws: ['裁判调用失败，按未通过处理'] };
    }
    const j2 = await judgeOnce(llm, Object.assign({}, base, { task, candidate: cand }));
    const v2 = j2.value;
    if (!v2) return v1 ? { score: v1.score, pass: v1.pass, flaws: v1.flaws || [] } : { score: cand ? 55 : 0, pass: false, flaws: ['裁判调用失败，按未通过处理'] };
    const score = Math.round((v1.score + v2.score) / 2);
    const bothHardFail = !v1.pass && !v2.pass; // 两团都判硬伤才算失败，降低单团严苛误杀
    const flaws = (v1.flaws || []).slice();
    for (const f of (v2.flaws || [])) if (flaws.indexOf(f) < 0 && flaws.length < 6) flaws.push(f);
    return { score, pass: !bothHardFail && score >= 70, flaws };
  });
  const falsify = o.falsify || (async (cand) => {
    const r = await sampleOnce(llm, Object.assign({}, base, { prompt: falsifyPrompt(task, cand), temperature: 0.2 }));
    if (!r.ok) return { survived: true, kills: [], degraded: true }; // 证伪调用失败：疑罪从无，绝不据网络故障回炉好结论
    return parseFalsify(r.text);
  });

  // 单层：并发生成 W 个候选 → 并发裁判 → 返回本层最优
  async function growLayer(isRoot, parentText, flaws) {
    if (budget.left <= 0) return null;
    const width = Math.min(breadth, Math.max(1, budget.left));
    const raws = await mapPool(Array.from({ length: width }), POOL, async (_, i) => {
      if (!charge()) return null;
      const prompt = isRoot ? rootPrompt(task, i) : repairPrompt(task, parentText, flaws, i);
      const r = await sample(prompt, 0.82 + i * 0.07);
      return r && r.ok && r.text ? r.text : null;
    });
    const valid = raws.filter(Boolean);
    if (!valid.length) return null;
    const scored = await mapPool(valid, POOL, async (text) => {
      if (!charge()) return { text, score: 50, pass: false, flaws: [] };
      const v = await judge(text);
      return { text, score: v.score | 0, pass: !!v.pass, flaws: v.flaws || [] };
    });
    const ok = scored.filter(Boolean).sort((a, b) => b.score - a.score);
    return ok[0] || null;
  }

  let globalBest = null;
  // 主回复作为候选 0 先入树：独立推演只有严格更优才有资格替换它
  if (o.seedText && String(o.seedText).trim() && budget.left >= 1) {
    try {
      const sv = await judge(String(o.seedText));
      globalBest = { text: String(o.seedText), score: sv.score | 0, pass: !!sv.pass, flaws: sv.flaws || [], isSeed: true };
      log('reasoning-tree: main reply seeded at ' + globalBest.score);
    } catch { /* seed 失败不阻塞探索 */ }
  }
  let node = await growLayer(true, null, []);
  let depthUsed = 0;
  while (node) {
    if (!globalBest || node.score > globalBest.score) globalBest = node;
    // 已通过裁判、或递归深度用尽、或预算不足以再开一层 → 停止下钻
    if (node.pass || depthUsed >= maxDepth || budget.left < 2) break;
    depthUsed++;
    const child = await growLayer(false, node.text, node.flaws);
    if (!child) break;
    node = child;
  }

  // 反事实红队（轮数由 falsify 档驱动；0=不证伪零调用）：被击杀→回炉一层→再证伪，直到存活或轮数/预算用尽
  const FALSIFY_ROUNDS = [0, 1, 1, 2, 2, 3, 3];
  const redRounds = FALSIFY_ROUNDS[clampT(o.falsifyTier)];
  let redTeam = null;
  for (let ri = 0; ri < redRounds && globalBest && globalBest.text; ri++) {
    if (!charge()) break;
    let verdict;
    try { verdict = await falsify(globalBest.text); }
    catch (e) { log('falsify round failed (contained): ' + String(e)); break; }
    redTeam = verdict;
    if (!verdict || verdict.survived || verdict.degraded) break; // 存活 / 证伪服务降级 → 止
    if (budget.left < 2) break;
    const repaired = await growLayer(false, globalBest.text, verdict.kills || []);
    if (!repaired) break;
    if (repaired.score >= globalBest.score) globalBest = repaired;
  }

  log('reasoning-tree: breadth=' + breadth + ' depth=' + maxDepth + ' used=' + depthUsed +
    ' calls=' + budget.calls + '/' + cap + ' best=' + (globalBest ? globalBest.score : 0) +
    ' survived=' + (redTeam ? redTeam.survived : 'n/a'));

  return {
    best: globalBest ? globalBest.text : '',
    score: globalBest ? globalBest.score : 0,
    pass: globalBest ? !!globalBest.pass : false,
    bestIsSeed: globalBest ? !!globalBest.isSeed : false,
    ran: true,
    depthUsed,
    calls: budget.calls,
    cap,
    falsified: redTeam,
    audit: { breadth, maxDepth },
  };
}

export const reasoningTreeTiers = { TREE_BREADTH, TREE_DEPTH, HARD_CALL_CAP };

export default { runReasoningTree, reasoningTreeTiers };
