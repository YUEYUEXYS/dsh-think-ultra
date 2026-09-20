// pref-compiler.js
// Think 偏好指令·条款级语义分层编译器（v0.11-RC2「Ultra 偏好体系」内核）
//
// 它不按字数把一句话砍成半截。它做四件事：
//   1) 原子化：把自由文本按换行/中文句读/序号切成一条条完整条款（绝不跨句截断）；
//   2) 语义分层：每条按「抽象深度 × 强制力」归到六层之一，命中多重身份时归到最底层（最强约束）；
//   3) 预算装填：按 模型 profile × 深度档 × token 预算，从最底层起整条款装填，
//      预算紧张时从最表层（弹性偏好）整层剥除——身份/律令永远在；
//   4) 模型分化：Flash/Vision 同一套精炼命令式 profile，Pro 一套更深更全的 profile（吃满四万字）。
//
// 六层（order 越小越抽象、越不可丢）：
//   identity   身份宪法  —— 你是谁（旧硬规则抽取抓不到这一层，因为它不含“必须/禁止”）
//   imperative 绝对律令  —— 必须/严禁/绝不/never 一类硬边界
//   directive  行为准则  —— 优先/尽量/避免/默认 一类强倾向
//   format     输出契约  —— 语言/格式/字数/语气/结构
//   context    背景语境  —— 项目/团队/技术栈
//   wish       弹性偏好  —— 其余软愿望，最先被预算剥除

export const PREF_LAYERS = [
  { key: 'identity', zh: '身份定位', order: 0 },
  { key: 'imperative', zh: '绝对要求', order: 1 },
  { key: 'directive', zh: '行为准则', order: 2 },
  { key: 'format', zh: '输出契约', order: 3 },
  { key: 'context', zh: '背景语境', order: 4 },
  { key: 'wish', zh: '弹性偏好', order: 5 },
];
const LAYER_KEYS = PREF_LAYERS.map((l) => l.key);
const ZH_OF = Object.fromEntries(PREF_LAYERS.map((l) => [l.key, l.zh]));

// —— 信号词：按 order 从强到弱依次测，第一个命中即归该层（保证强约束不被误丢到软层）——
const RE_IDENTITY = /(你是一?[个位名]|你的身份|你扮演|扮演一?个|作为一?[名个]|人设|角色设定|act\s+as|you\s+are\s+a|your\s+role|role\s*:)/i;
const RE_IMPERATIVE = /(必须|务必|一定(要)?|绝不|永不|永远不?要|严禁|禁止|不得|不准|不能|不许|不要|绝不能|千万|硬性|must\b|never\b|always\b|no\s+matter|regardless|don'?t\b|do\s+not\b|forbidden|required)/i;
const RE_DIRECTIVE = /(优先|尽量|尽可能|避免|默认(就)?|应当|应该|倾向|总是|通常|一般来说|建议|推荐|力争|保证|力求|倾向于|prefer|avoid|should\b|usually|generally|strive|by\s+default)/i;
const RE_FORMAT = /(中文|英文|简体|繁体|语言|语气|口吻|措辞|风格|格式|字数|[0-9０-９]+\s*字|json|markdown|缩进|单位|emoji|表情|标题|列表|表格|分段|换行|命名|小写|大写|标点|脚注|引用|in\s+chinese|in\s+english|language|tone|format|font|heading|bullet)/i;
const RE_CONTEXT = /(我的?项目|我们?项目|项目是|项目用|背景(是)?|团队|技术栈|代码库|代码仓|代码库|工程(是|用)?|我们?用|工作是|业务(是)?|公司(是)?|栈是|repo|code ?base|stack|our\s+project|the\s+project)/i;

export function estPrefTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const words = (text.replace(/[一-鿿㐀-䶿]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
  const punct = (text.match(/[.,;:!?，。；：！？、]/g) || []).length;
  return Math.ceil(cjk * 1.1 + words * 1.3 + punct * 0.6);
}

// 原子切分：换行优先；单行内再按中文句读拆；剥序号；去重；不拆英文句点（保护 e.g. / 版本号 / 小数）
export function splitClauses(raw) {
  const out = [];
  const seen = new Set();
  const blocks = String(raw || '').replace(/\r\n?/g, '\n').split(/\n+/);
  for (const block of blocks) {
    const pieces = block.split(/(?<=[。；！？])/);
    for (let piece of pieces) {
      piece = piece.replace(/^\s*(?:[-*•·▪◦]|\d+[.)、]|[（(]\d+[)）]|[一二三四五六七八九十]+[、.])\s*/, '').trim();
      if (piece.length < 2) continue;
      const dedupKey = piece.replace(/\s+/g, '').toLowerCase().slice(0, 48);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push(piece);
    }
  }
  return out;
}

// 非强制措辞（软愿望信号）；可验证的硬格式词（即便语气委婉也仍是输出契约）
const RE_HEDGE = /(如果可以|要是能|不妨|也好|也许|或许|稍微|稍稍|一点儿?|点儿|有点?儿|轻松点|别太|somewhat|if\s+possible|maybe|perhaps|would\s+be\s+nice|optionally)/i;
const RE_HARD_FORMAT = /(中文|英文|简体|繁体|json|markdown|字数|[0-9０-９]+\s*字|单位|emoji|表情|表格|标题|列表|缩进|命名|小写|大写|in\s+chinese|in\s+english)/i;

export function classifyClause(clause) {
  const t = String(clause || '');
  if (RE_IDENTITY.test(t)) return 'identity';
  if (RE_IMPERATIVE.test(t)) return 'imperative';
  if (RE_DIRECTIVE.test(t)) return 'directive';
  // 用户用了非强制措辞、且不涉及可验证的硬形式要求 → 即使提到“语气/风格”这种软话题，也归弹性偏好
  if (RE_HEDGE.test(t) && !RE_HARD_FORMAT.test(t)) return 'wish';
  if (RE_FORMAT.test(t)) return 'format';
  if (RE_CONTEXT.test(t)) return 'context';
  return 'wish';
}

export function classifyPrefs(prefs) {
  const buckets = Object.fromEntries(LAYER_KEYS.map((k) => [k, []]));
  for (const text of splitClauses(prefs)) {
    buckets[classifyClause(text)].push(text);
  }
  return buckets;
}

// —— 双模型 profile：Flash/Vision 同构精炼；Pro 更深更全 ——
// cap：该层最多保留多少条（identity/imperative 给得很宽，实际由宪法硬顶兜底）
// open(deep)：该深度档下对“软偏好注入”开放到哪些层（order）；宪法 L0/L1 永远先走另一条注入
// share：token 预算中偏好最多占的比例（其余留给深度/看图/对抗等注入）
const FLASH_PROFILE = {
  cap: { identity: 40, imperative: 40, directive: 10, format: 8, context: 5, wish: 3 },
  softOpen: (d) => (d >= 6 ? [2, 3, 4, 5] : d >= 4 ? [2, 3, 4] : d >= 2 ? [2, 3] : [2]),
  share: 0.5,
  constitutionHardChars: 1600,
};
const PRO_PROFILE = {
  cap: { identity: 80, imperative: 80, directive: 22, format: 18, context: 16, wish: 12 },
  softOpen: (d) => (d >= 4 ? [2, 3, 4, 5] : d >= 2 ? [2, 3, 4] : [2, 3]),
  share: 0.64,
  constitutionHardChars: 2200,
};
export const PREF_PROFILES = { flash: FLASH_PROFILE, vision: FLASH_PROFILE, pro: PRO_PROFILE };
export function prefProfileOf(model) {
  const m = String(model || '').toLowerCase();
  // 调用方传入的是 detectModel 归一后的全名（deepseek-v4-pro/...-flash/...-vision-exp），
  // 这里收敛到 short profile：Pro 用更深更全的 PRO_PROFILE，Flash/Vision 共用精炼 profile。
  if (m.includes('pro')) return PRO_PROFILE;
  return FLASH_PROFILE;
}

const clampTier = (v) => {
  const n = Math.round(Number(v) || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(6, n));
};

// 宪法层：身份 + 绝对律令。整条款装填到硬顶（不砍半句），供“节流闸门前”那条注入使用——预算再紧也在。
export function compileConstitution(prefs, model) {
  const prof = prefProfileOf(model);
  const b = classifyPrefs(prefs);
  const picked = [];
  let chars = 0;
  const take = (layer) => {
    for (const clause of b[layer].slice(0, prof.cap[layer])) {
      const add = clause.length + 1;
      if (chars + add > prof.constitutionHardChars) break;
      chars += add;
      picked.push({ layer, text: clause });
    }
  };
  take('identity');
  take('imperative');
  const sections = [];
  for (const key of ['identity', 'imperative']) {
    const items = picked.filter((p) => p.layer === key).map((p) => p.text);
    if (items.length) sections.push('■' + ZH_OF[key] + '\n' + items.map((x, i) => (i + 1) + '. ' + x).join('\n'));
  }
  return {
    text: sections.join('\n\n'),
    identity: b.identity.slice(),
    imperative: b.imperative.slice(),
    count: picked.length,
    chars,
    tokens: estPrefTokens(sections.join('\n\n')),
  };
}

// 软偏好层：行为准则/输出契约/背景/弹性偏好（宪法已先行注入，这里不再重复身份/律令）。
// 按 deep 决定开到哪层、按预算整条款装填；装不下的高层整条剥除并计入 dropped（可观测，绝不静默半句）。
export function compileSoftPrefs(opts) {
  const { prefs, model, deepTier, budgetTokens } = opts || {};
  const prof = prefProfileOf(model);
  const deep = clampTier(deepTier);
  const b = classifyPrefs(prefs);
  const openOrders = prof.softOpen(deep);
  const totalClauses = LAYER_KEYS.reduce((n, k) => n + b[k].length, 0);

  let tokenBudget = Infinity;
  if (Number.isFinite(budgetTokens) && budgetTokens > 0) {
    tokenBudget = Math.floor(budgetTokens * prof.share);
  }

  const usedLayers = [];
  const sectionTexts = [];
  let usedTokens = 0;
  let kept = 0;
  let exhausted = false;

  for (const order of [2, 3, 4, 5]) {
    if (exhausted || !openOrders.includes(order)) continue;
    const key = LAYER_KEYS[order];
    const candidates = b[key].slice(0, prof.cap[key]);
    const keptHere = [];
    for (const clause of candidates) {
      const cost = estPrefTokens(clause) + 4;
      if (tokenBudget !== Infinity && usedTokens + cost > tokenBudget) { exhausted = true; break; }
      usedTokens += cost;
      keptHere.push(clause);
    }
    if (keptHere.length) {
      usedLayers.push(key);
      sectionTexts.push('■' + ZH_OF[key] + '\n' + keptHere.map((x, i) => (i + 1) + '. ' + x).join('\n'));
      kept += keptHere.length;
    }
  }

  // 宪法已带走 identity+imperative；dropped = 其余没进来的条款（未开放层 + 预算剥除）
  const softTotal = totalClauses - b.identity.length - b.imperative.length;
  const dropped = Math.max(0, softTotal - kept);

  return {
    text: sectionTexts.join('\n\n'),
    layers: usedLayers,
    layerZh: usedLayers.map((k) => ZH_OF[k]),
    dropped,
    kept,
    chars: sectionTexts.join('\n\n').length,
    tokens: usedTokens,
    deep,
  };
}

export default {
  PREF_LAYERS, PREF_PROFILES, estPrefTokens, splitClauses, classifyClause, classifyPrefs,
  prefProfileOf, compileConstitution, compileSoftPrefs,
};
