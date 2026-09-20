// toolbox-engine.js — Think 真实工具箱编排层（L2）。
// 与 L1 tournament-engine 的分工：
//   tournament（裂变）= 多版独立采样，整份择优替换；
//   verify（审判）    = 不重写整份，只对主回复做独立交叉审查，
//                        抓到实质硬伤才起一路 MAX 勘误，精准接回，更省、更不容易误伤好答案。
// 每一档都映射成真实执行参数（独立审查路数 / 是否起勘误），不是提示词摆设。
// 全部走 ctx.llm（经 tournament-engine 已验证的 sampleOnce）发起真实独立调用。

import { sampleOnce } from './tournament-engine.js';

// 审判档 0..6 → 独立审查路数（0 关；封顶视角数见 REVIEW_VIEWS）
const TIER_REVIEWERS = [0, 1, 1, 2, 2, 3, 3];
// 审判档 0..6 → 是否允许在抓到硬伤时起独立勘误路
const TIER_REFORGE = [false, true, true, true, true, true, true];

// 多路审查视角：彼此独立、互不捧场；档越高启用越多视角
const REVIEW_VIEWS = [
  '事实 / 计算 / 可执行性：逐句核对是否存在事实错误、算错、引用了不存在的 API·文件·命令、给出的步骤实际跑不通。',
  '逻辑严密性 / 完备性：推理链是否断裂、是否漏掉需求里点名的要点、是否答非所问、最终结论是否真被前文支撑。',
  '反面与边界：最可能翻车的边界条件、被忽略的反例，以及“看起来对、其实有坑”的地方；只报你有把握的真问题。',
];

const clampTier = (v) => {
  const n = Math.round(Number(v) || 0);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(6, n));
};

// 从模型夹带的 markdown 围栏 / 废话里抠出第一个 JSON 对象
function parseReview(raw) {
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const issues = Array.isArray(j.issues)
      ? j.issues
          .map((x) => ({
            severity: String(x && x.severity || 'minor').toLowerCase() === 'major' ? 'major' : 'minor',
            point: String(x && x.point || '').slice(0, 400),
            fix: String(x && x.fix || '').slice(0, 400),
          }))
          .filter((x) => x.point)
          .slice(0, 8)
      : [];
    return { hardFail: !!j.hardFail, issues, verdict: String(j.verdict || '').slice(0, 300) };
  } catch { return null; }
}

function reviewPrompt(task, answer, view) {
  return [
    '你是与作者利益无关、极端挑剔的独立审查者。只依据交付物本身裁决，不许鼓励、不许放水，也不许为凑数编造问题——没问题就老实返回空。',
    '【你负责的审查视角】\n' + view,
    '【原始任务】\n' + String(task || '').slice(0, 4000),
    '【待审交付物】\n' + String(answer || '').slice(0, 8000),
    '判定规则：只有“会让用户踩坑 / 结论错误 / 无法执行 / 明显漏答点名要求”才算 major；措辞、风格、可更好但不算错的一律 minor 或不报。',
    '只输出一个 JSON 对象，不要任何额外文字：',
    '{"hardFail":布尔,"issues":[{"severity":"major或minor","point":"具体问题","fix":"该怎么改"}],"verdict":"一句话总评"}',
  ].join('\n\n');
}

function revisePrompt(task, answer, issues) {
  const list = issues
    .map((x, i) => (i + 1) + '. [' + x.severity + '] ' + x.point + (x.fix ? '\n   改法：' + x.fix : ''))
    .join('\n');
  return [
    '下面这份交付物被独立审查抓到若干实质硬伤。请产出“勘误后的最终交付”：',
    '【原始任务】\n' + String(task || '').slice(0, 4000),
    '【原交付物】\n' + String(answer || '').slice(0, 8000),
    '【必须逐条解决的硬伤】\n' + list,
    '要求：保留原交付物中正确的部分，只修上述硬伤、补齐遗漏；直接给修正后的完整结果，不要寒暄、不要复述题目、不要提到“审查/硬伤”这些元词。',
  ].join('\n\n');
}

// 一次独立审查（低温，避免审查者自己发散）
async function reviewOnce(llm, o, view) {
  const r = await sampleOnce(llm, {
    provider: o.provider,
    model: o.model,
    system: '你是独立审查者，只输出 JSON。',
    prompt: reviewPrompt(o.task, o.answer, view),
    temperature: 0.2,
    maxTokens: o.maxTokens,
    signal: o.signal,
  });
  return { value: parseReview(r.text), raw: r.text, ok: r.ok, ms: r.ms };
}

/**
 * 审判工具箱。
 * llm 为 ctx.llm；cfg: { provider, model, tier, task, answer, maxTokens?, signal?, log? }
 * 返回 { ran, reviewers, triggered, hardFail, major, issues, revision, calls }
 *  - triggered=false 时不动主回复（审查认为没问题 / 证据不足），revision 为空。
 */
export async function runVerify(llm, cfg) {
  const log = typeof cfg.log === 'function' ? cfg.log : () => {};
  const tier = clampTier(cfg.tier);
  const calls = { reviews: 0, revise: 0, failed: 0 };
  const none = { ran: false, reviewers: 0, triggered: false, hardFail: false, major: 0, issues: [], revision: '', calls };
  if (tier <= 0) return none;
  const answer = String(cfg.answer || '');
  const task = String(cfg.task || '');
  if (answer.length < 24 || !task) return none;

  const nReviewers = Math.min(TIER_REVIEWERS[tier], REVIEW_VIEWS.length);
  if (nReviewers <= 0) return none;

  // 多路独立审查（不同视角），结论聚合
  const batched = [];
  for (let i = 0; i < nReviewers; i++) {
    batched.push(reviewOnce(llm, cfg, REVIEW_VIEWS[i % REVIEW_VIEWS.length]).then((r) => {
      calls.reviews++;
      if (!r.value) { calls.failed++; return null; }
      return r.value;
    }));
  }
  const verdicts = (await Promise.all(batched)).filter(Boolean);
  if (!verdicts.length) {
    log('verify: 审查路全部失败，跳过（不影响主回复）');
    return { ...none, ran: true, reviewers: nReviewers, calls };
  }

  const hardFailAny = verdicts.some((v) => v.hardFail);
  // major 问题按“问题点”粗去重（不同审查者抓到同一处只算一处）
  const majorSeen = [];
  const minorAll = [];
  verdicts.forEach((v) => {
    v.issues.forEach((x) => {
      if (x.severity !== 'major') { minorAll.push(x); return; }
      const key = x.point.slice(0, 24);
      if (!majorSeen.some((s) => s.point.slice(0, 24) === key)) majorSeen.push(x);
    });
  });

  // 触发勘误的证据门槛：审查者明确判 hardFail，或至少抓到一条 major。
  // 单一审查者“觉得不够好”的 minor 不推翻主回复，避免自评偏见把对的答案改坏。
  const triggered = TIER_REFORGE[tier] && (hardFailAny || majorSeen.length >= 1);
  log('verify: tier=' + tier + ' reviewers=' + verdicts.length + ' hardFail=' + hardFailAny + ' major=' + majorSeen.length + ' triggered=' + triggered);
  if (!triggered) {
    return { ran: true, reviewers: verdicts.length, triggered: false, hardFail: hardFailAny, major: majorSeen.length, issues: majorSeen, revision: '', calls };
  }

  // 一路独立 MAX 勘误
  const issuesForRevise = majorSeen.concat(minorAll).slice(0, 6);
  const rev = await sampleOnce(llm, {
    provider: cfg.provider,
    model: cfg.model,
    system: '你是最终勘误者，直接交付修正后的结果。',
    prompt: revisePrompt(task, answer, issuesForRevise),
    temperature: 0.5,
    maxTokens: cfg.maxTokens,
    signal: cfg.signal,
  });
  calls.revise++;
  if (!rev.ok || !rev.text || rev.text.length < 24) {
    calls.failed++;
    log('verify: 勘误路失败/为空，保留主回复');
    return { ran: true, reviewers: verdicts.length, triggered: false, hardFail: hardFailAny, major: majorSeen.length, issues: majorSeen, revision: '', calls };
  }

  return {
    ran: true,
    reviewers: verdicts.length,
    triggered: true,
    hardFail: hardFailAny,
    major: majorSeen.length,
    issues: issuesForRevise,
    revision: rev.text,
    calls,
  };
}

export const toolboxTiers = { TIER_REVIEWERS, TIER_REFORGE, REVIEW_VIEWS };

export default { runVerify, toolboxTiers };
