// tournament-engine.js — Think L1 真实 test-time 编排。
// 独立 MAX 多遍采样 → 独立裁判团 → 带缺陷回炉重铸 → 择优交付。
// 全部走 ctx.llm.stream 官方 API 发起真实独立调用，不依赖缺失的 Rust core。
// 滑块档位在这里映射成真实执行参数（调用次数/温度/回炉轮），不是提示词摆设。

// 深度采样档 0..5 → 独立采样条数 N
const TIER_SAMPLES = [1, 2, 3, 5, 8, 12, 20];
// 裁决档 0..5 → 裁判团人数（0 = 不设独立裁判，仅启发式排序）
const TIER_JUDGES = [0, 1, 1, 2, 3, 5, 8];
// 回炉档 0..5 → 未过阈值时带缺陷重铸的最大轮数
const TIER_REFORGE = [0, 0, 1, 1, 2, 3, 5];
// 高熵探索基线温度；同批各版沿阶梯抬升换覆盖率
const BASE_TEMPERATURE = [0.7, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25];

// 同批多版的切入点：逼模型走不同思路，而不是把同一句话重复 N 遍
const DIVERSITY_SEEDS = [
  '从第一性原理出发，直接推导，不借用未经检验的类比。',
  '反例驱动：先找出这个解法最可能出错的地方，再围绕它构造答案。',
  '换一个与常规完全不同的独立角度重新求解。',
  '最保守地步步为营，每一步都给出可核验的中间结论。',
  '类比一个结构最接近、你有把握的已知问题，把解法迁移过来并核对差异。',
  '先假设题面本身有陷阱，澄清隐藏前提后再作答。',
];

const clampTier = (v) => {
  const n = Math.round(Number(v) || 0);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(6, n));
};

const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).slice().sort((p, q) => p - q);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// 从模型可能夹带 markdown 围栏/废话的输出里抠出第一个 JSON 对象
function parseJudge(raw) {
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const score = Number(j.score);
    return {
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      pass: !!j.pass,
      flaws: Array.isArray(j.flaws) ? j.flaws.map(String).slice(0, 6) : [],
      verdict: typeof j.verdict === 'string' ? j.verdict.slice(0, 300) : '',
    };
  } catch { return null; }
}

const judgePrompt = (task, candidate) => [
  '你是极端严格、与候选答案作者利益无关的独立裁判。只依据答案本身质量裁决，不许鼓励、不许放水。',
  '【原始任务】\n' + String(task || '').slice(0, 4000),
  '【待裁候选答案】\n' + String(candidate || '').slice(0, 6000),
  '评分维度：正确性、完整性、推理严密性、可执行性，综合为 0-100。发现任何硬伤（事实错误/逻辑断裂/答非所问/无法执行）必须 pass:false。',
  '只输出一个 JSON 对象，不要输出任何额外文字：{"score":整数,"pass":布尔,"flaws":["具体缺陷1","具体缺陷2"],"verdict":"一句话结论"}',
].join('\n\n');

/**
 * 一次独立 MAX 采样。llm 为 ctx.llm（LlmRuntime）。
 * o: { provider, model, prompt, system?, temperature?, maxTokens?, signal? }
 */
export async function sampleOnce(llm, o) {
  const started = Date.now();
  const messages = [{
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text: String(o.prompt == null ? '' : o.prompt) }],
  }];
  const opts = {
    provider: String(o.provider || ''),
    model: String(o.model || ''),
    // Ultra 底座恒为 MAX；仅当调用方显式指定（如“你好”级 trivial 任务为避免空等而降到 high）时覆盖
    reasoningEffort: ['low', 'medium', 'high', 'max'].includes(o.reasoningEffort) ? o.reasoningEffort : 'max',
    messages,
    temperature: Number.isFinite(o.temperature) ? o.temperature : 0.85,
  };
  if (o.system) opts.system = String(o.system);
  if (Number.isFinite(o.maxTokens)) opts.maxTokens = o.maxTokens;
  if (o.signal) opts.signal = o.signal;

  let text = '';
  let finish = 'stop';
  let usage = null;
  try {
    for await (const c of llm.stream(opts)) {
      if (c.type === 'text-delta') text += c.text;
      else if (c.type === 'reasoning-delta') { /* 思考流不计入可见交付物 */ }
      else if (c.type === 'finish') finish = c.reason?.kind || 'stop';
      else if (c.type === 'usage') usage = c.usage;
    }
  } catch (e) {
    return { text: text.trim(), ok: false, finish: 'error', error: String(e && e.message || e), ms: Date.now() - started, usage };
  }
  const ok = finish === 'stop' || finish === 'tool-calls' || finish === 'max-tokens';
  return { text: text.trim(), ok, finish, ms: Date.now() - started, usage };
}

// 一次独立裁判调用（低温，避免裁判自身发散）；解析失败返回 value:null，由上层换裁判或兜底
export async function judgeOnce(llm, o) {
  const r = await sampleOnce(llm, {
    provider: o.provider,
    model: o.model,
    system: '你是独立裁判，只输出 JSON。',
    prompt: judgePrompt(o.task, o.candidate),
    temperature: 0.2,
    maxTokens: o.maxTokens,
    signal: o.signal,
  });
  return { value: parseJudge(r.text), raw: r.text, ok: r.ok, ms: r.ms };
}

// 单候选裁判团：judges 次独立裁决取中位分；任一裁判抓到硬伤即 pass:false（疑罪从有，宁缺毋滥）
async function judgeCandidate(llm, o, judges) {
  if (judges <= 0) {
    // 无独立裁判时的保守启发式：非空、有实质长度即视为候选，分数中性，交回炉档决定是否继续
    const substantial = o.candidate && o.candidate.length >= 40;
    return { score: substantial ? 60 : 20, pass: substantial, flaws: [], votes: 0 };
  }
  const scores = [];
  const flaws = [];
  let anyHardFail = false;
  let got = 0;
  for (let k = 0; k < judges; k++) {
    const j = await judgeOnce(llm, o);
    if (!j.value) continue;
    got++;
    scores.push(j.value.score);
    if (!j.value.pass) anyHardFail = true;
    for (const f of j.value.flaws) if (flaws.indexOf(f) < 0 && flaws.length < 6) flaws.push(f);
  }
  if (!got) return { score: 0, pass: false, flaws: ['裁判团全部调用失败，无法确认质量'], votes: 0 };
  return { score: Math.round(median(scores)), pass: !anyHardFail && median(scores) >= 72, flaws, votes: got };
}

function seedPrompt(task, seedIndex, feedback) {
  const seed = DIVERSITY_SEEDS[seedIndex % DIVERSITY_SEEDS.length];
  let p = '【解题视角】' + seed + '\n\n【任务】\n' + String(task || '').slice(0, 6000);
  if (feedback && feedback.length) {
    p += '\n\n【上一版被裁判抓到的缺陷，本版必须逐条解决】\n- ' + feedback.slice(0, 6).join('\n- ');
  }
  p += '\n\n直接交付最终结果，不要寒暄、不要复述题目。';
  return p;
}

/**
 * L1 锦标赛。
 * cfg: { provider, model, sampleTier, judgeTier, reforgeTier, diversity?, maxTokens?, signal?, log? }
 * 返回 { best, score, pass, rounds, candidates, calls, audit }
 */
export async function runTournament(llm, task, cfg) {
  const log = typeof cfg.log === 'function' ? cfg.log : () => {};
  const N = TIER_SAMPLES[clampTier(cfg.sampleTier)];
  const judges = TIER_JUDGES[clampTier(cfg.judgeTier)];
  const maxRounds = TIER_REFORGE[clampTier(cfg.reforgeTier)];
  const baseTemp = BASE_TEMPERATURE[clampTier(cfg.sampleTier)];
  const audit = { samples: 0, judges: 0, rounds: 0, failedSamples: 0 };

  let pool = [];
  let feedback = [];
  let best = null;
  let seedScore = null;

  // 主回复作为候选 0 一并入裁：独立多版必须真实赢过它，才有资格接续交付
  if (cfg.seedText && String(cfg.seedText).trim()) {
    const sv = await judgeCandidate(llm, {
      provider: cfg.provider, model: cfg.model, task, candidate: String(cfg.seedText), maxTokens: cfg.maxTokens, signal: cfg.signal,
    }, judges);
    audit.judges += sv.votes;
    seedScore = sv.score;
    best = { text: String(cfg.seedText), score: sv.score, pass: sv.pass, flaws: sv.flaws, isSeed: true };
    log('tournament: seed(main reply) judged ' + sv.score + ' pass=' + sv.pass + ' votes=' + sv.votes);
  }

  for (let round = 0; round <= maxRounds; round++) {
    audit.rounds++;
    const width = round === 0 ? N : Math.max(2, N - 1);
    const batch = [];
    for (let i = 0; i < width; i++) {
      const temp = cfg.diversity === false ? baseTemp : Math.min(1.3, baseTemp + i * 0.07);
      batch.push(sampleOnce(llm, {
        provider: cfg.provider,
        model: cfg.model,
        prompt: seedPrompt(task, round * width + i, feedback),
        temperature: temp,
        maxTokens: cfg.maxTokens,
        signal: cfg.signal,
      }).then((r) => { audit.samples++; if (!r.ok) audit.failedSamples++; return r; }));
    }
    const sampled = (await Promise.all(batch)).filter((r) => r.ok && r.text);
    pool = sampled;
    if (!sampled.length) {
      log('tournament: round ' + round + ' 全部采样失败');
      break;
    }

    for (const c of sampled) {
      const v = await judgeCandidate(llm, {
        provider: cfg.provider, model: cfg.model, task, candidate: c.text, maxTokens: cfg.maxTokens, signal: cfg.signal,
      }, judges);
      audit.judges += v.votes;
      c.score = v.score; c.pass = v.pass; c.flaws = v.flaws;
      if (!best || c.score > best.score) best = c;
    }
    log('tournament: round ' + round + ' width=' + sampled.length + ' judges=' + judges + ' best=' + (best ? best.score : 0) + ' pass=' + (best ? best.pass : false));

    if (best && best.pass) break;
    if (round >= maxRounds) break;
    feedback = best ? best.flaws : ['未达到交付标准，请整体重做并提升严密性'];
  }

  if (!best && pool.length) best = pool[0];
  return {
    best: best ? best.text : '',
    score: best ? best.score : 0,
    pass: best ? !!best.pass : false,
    seedScore,
    bestIsSeed: best ? !!best.isSeed : false,
    rounds: audit.rounds,
    candidates: pool.map((c) => ({ score: c.score, pass: c.pass, len: c.text.length, flaws: c.flaws, isSeed: !!c.isSeed })),
    calls: { samples: audit.samples, judges: audit.judges, failedSamples: audit.failedSamples },
    audit,
  };
}

export const tournamentTiers = { TIER_SAMPLES, TIER_JUDGES, TIER_REFORGE, BASE_TEMPERATURE };

export default { sampleOnce, judgeOnce, runTournament, parseJudge, tournamentTiers };
