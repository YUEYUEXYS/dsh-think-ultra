// grounding-core.cjs
// ============================================================================
// Deterministic Grounding Core (DGC) — 确定性核验内核
// ----------------------------------------------------------------------------
// 宿主侧纯本地、零网络、零 LLM、零 token 的确定性审计层。
// 与 runVerify / judgepanel / runExecVerify（都是"用 LLM 查 LLM"）不同，本层
// 用确定性代码对"有唯一正确答案"的声明做真值判定：
//   1. 算术等式      （12 × 8 = 96 / 12 乘以 8 等于 96 / 200 的 15% 是 30）
//   2. 日期星期      （2026 年 9 月 19 日是星期六）
//   3. 枚举计数      （"共 5 点"后实际数字编号列表项数）
//   4. 单位换算      （3 公里 = 3000 米 / 2 小时 = 120 分钟）
//
// 设计铁律：PRECISION-FIRST（宁可不报，绝不误报）。一次误报会把正确答案改错，
// 代价远高于漏报。因此只处理"显式等式 + 可确定性求值"的形态，代码块、变量、
// 代数、范围、约数、版本号、日期戳、URL、货币汇率等一律不碰。
// ============================================================================
'use strict';

/* ---------------------------------------------------------------------------
 * 1) 中文数字
 * ------------------------------------------------------------------------- */
const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT = { 十: 10, 百: 100, 千: 1000, 万: 10000, 萬: 10000, 亿: 100000000, 億: 100000000 };

/**
 * 解析中文数字串，支持 "一万二千三百零五"、"零点二五"、"十"、"二十"。
 * 返回 number；无法解析时返回 null。
 */
function cnToNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^[\d.,\s]+$/.test(s)) return null; // 纯阿拉伯数字交给别处
  // 小数部分："三点一四"
  const dian = s.split(/点|·/);
  if (dian.length > 2) return null;
  let intPart = dian[0];
  let fracPart = dian.length === 2 ? dian[1] : '';
  let fracStr = '';
  if (fracPart) {
    for (const ch of fracPart) {
      if (ch in CN_DIGIT) fracStr += CN_DIGIT[ch];
      else if (/\s/.test(ch)) { /* 忽略空格 */ }
      else return null;
    }
  }
  // 纯中文整数
  if (!/^[零〇一二两三四五六七八九十百千万億亿萬\s]+$/.test(intPart)) return null;
  if (intPart.replace(/\s/g, '') === '') return null;
  let total = 0;
  let section = 0; // 万/亿以下的累计
  let number = 0;
  let sawDigit = false;
  for (const ch of intPart.replace(/\s/g, '')) {
    if (ch in CN_DIGIT) {
      number = CN_DIGIT[ch];
      sawDigit = true;
    } else if (ch === '十' || ch === '百' || ch === '千') {
      if (!sawDigit) number = 1; // "十" = 10、"十二" = 12
      section += number * CN_UNIT[ch];
      number = 0;
      sawDigit = false;
    } else if (ch === '万' || ch === '萬' || ch === '亿' || ch === '億') {
      section += number;
      if (ch === '万' || ch === '萬') {
        total += section * 10000;
      } else {
        total = (total + section) * 100000000;
      }
      section = 0;
      number = 0;
      sawDigit = false;
    } else {
      return null;
    }
  }
  section += number;
  total += section;
  let result = total;
  if (fracStr) result = total + Number('0.' + fracStr);
  return result;
}

/* ---------------------------------------------------------------------------
 * 2) 安全算术求值器（递归下降，白名单，绝不 eval/Function）
 * ------------------------------------------------------------------------- */
class ArithError extends Error { }

const OPERATORS = new Set(['+', '-', '*', '/', '×', '÷', '^', '**', '%']);
const CN_OP = { '加': '+', '加上': '+', '减': '-', '减去': '-', '乘': '*', '乘以': '*', '除': '/', '除以': '/', '×': '*', '÷': '/', '÷': '/' };

/**
 * 把含中文运算符、中文数字、百分号、千分位的表达式标准化为 ASCII 算术串。
 * 例："12 乘以 8" -> "12*8"；"一千二" -> "1200"；"200 的 15%" -> "200*15/100"。
 * 不做任何求值，只做词法归一。
 */
function normalizeExpression(raw) {
  let s = String(raw);
  // 中文运算符（多字优先）
  const phrases = ['乘以', '除以', '加上', '减去', '加', '减', '乘', '除', '×', '÷', '**', '^', '×', '÷'];
  for (const p of phrases) {
    if (p === '除以') s = s.split('除以').join(' ÷ ');
    else if (p === '乘以') s = s.split('乘以').join(' × ');
    else if (p === '加上') s = s.split('加上').join(' + ');
    else if (p === '减去') s = s.split('减去').join(' - ');
    else if (p === '加') s = s.split('加').join(' + ');
    else if (p === '减') s = s.split('减').join(' - ');
    else if (p === '乘') s = s.split('乘').join(' × ');
    else if (p === '除') s = s.split('除').join(' ÷ ');
  }
  // 中文数字 token：先尝试把连续中文数字串转成阿拉伯数字
  s = s.replace(/[零〇一二两三四五六七八九十百千万億亿萬点·\s]+/g, (m) => {
    const core = m.trim();
    if (!core) return m;
    if (!/[零〇一二两三四五六七八九十百千万億亿萬]/.test(core)) return m; // 纯空格
    if (core === '点' || core === '·') return m;
    const v = cnToNumber(core);
    if (v == null) return m;
    return String(v);
  });
  // 符号归一
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^');
  // "X 的 Y%" -> X * Y / 100（"的"在百分比语境）
  s = s.replace(/\s*的\s*([0-9.]+)\s*%/g, ' * $1 / 100');
  // 百分号（裸 N%）：在算式侧出现时归一为 N/100
  s = s.replace(/([0-9.]+)\s*%/g, '($1/100)');
  // 千分位
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1');
  // 全角
  s = s.replace(/．/g, '.').replace(/（/g, '(').replace(/）/g, ')').replace(/＋/g, '+').replace(/－/g, '-').replace(/＊/g, '*').replace(/／/g, '/');
  return s;
}

/**
 * 白名单递归下降求值。
 * 允许：数字、+ - * / % ^、括号、一元正负、空白。任何其它字符（字母、函数、
 * 标识符、逗号、分号等）一律抛 ArithError，从根上杜绝注入。
 */
function safeEval(raw) {
  const src = normalizeExpression(raw);
  let i = 0;
  const isDigit = (c) => c >= '0' && c <= '9';
  const skip = () => { while (i < src.length && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n')) i++; };

  function parseNumber() {
    skip();
    let str = '';
    while (i < src.length && (isDigit(src[i]) || src[i] === '.')) { str += src[i]; i++; }
    if (str === '' || str === '.') throw new ArithError('bad number');
    if ((str.match(/\./g) || []).length > 1) throw new ArithError('bad decimal');
    return Number(str);
  }
  function parseParen() {
    skip();
    if (src[i] === '(') {
      i++;
      const v = parseExpr();
      skip();
      if (src[i] !== ')') throw new ArithError('missing )');
      i++;
      return v;
    }
    return parseNumber();
  }
  function parseUnary() {
    skip();
    if (src[i] === '+') { i++; return parseUnary(); }
    if (src[i] === '-') { i++; return -parseUnary(); }
    return parseParen();
  }
  function parsePow() {
    let v = parseUnary();
    skip();
    while (src[i] === '^') {
      i++;
      const r = parseUnary();
      if (!Number.isFinite(r) || !Number.isFinite(v)) throw new ArithError('pow domain');
      v = Math.pow(v, r);
    }
    return v;
  }
  function parseMul() {
    let v = parsePow();
    skip();
    while (src[i] === '*' || src[i] === '/' || src[i] === '%') {
      const op = src[i]; i++;
      const r = parsePow();
      if (op === '*') v = v * r;
      else if (op === '/') { if (r === 0) throw new ArithError('div zero'); v = v / r; }
      else v = v % r;
      skip();
    }
    return v;
  }
  function parseAdd() {
    let v = parseMul();
    skip();
    while (src[i] === '+' || src[i] === '-') {
      const op = src[i]; i++;
      const r = parseMul();
      v = op === '+' ? v + r : v - r;
      skip();
    }
    return v;
  }
  function parseExpr() { return parseAdd(); }

  const value = parseExpr();
  skip();
  if (i !== src.length) throw new ArithError('trailing char at ' + i + ': ' + JSON.stringify(src.slice(i)));
  if (!Number.isFinite(value)) throw new ArithError('non-finite');
  return value;
}

/* ---------------------------------------------------------------------------
 * 3) 文本预处理：剥离代码、URL、版本号、日期戳、时间戳（防误报）
 * ------------------------------------------------------------------------- */
function stripNonVerifiable(text) {
  if (!text) return { text: '', masked: [] };
  const masked = [];
  let t = String(text);
  // 围栏代码块
  t = t.replace(/```[\s\S]*?```/g, (m) => { masked.push(m); return ' '; });
  // 行内代码
  t = t.replace(/`[^`\n]*`/g, (m) => { masked.push(m); return ' '; });
  // URL / 邮箱 / 文件路径
  t = t.replace(/(https?:\/\/|www\.|mailto:)[^\s)]*/g, ' ');
  t = t.replace(/[A-Za-z]:\\[^\s]*|[A-Za-z0-9_.-]+\.[A-Za-z0-9_-]+\/[^\s]*/g, ' ');
  // 时间戳 HH:MM(:SS)
  t = t.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
  // 日期 YYYY-MM-DD / YYYY/M/D / YYYY年M月D日（星期核验单独处理，这里先标记但保留中文日期给日期模块）
  t = t.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ');
  // 三点版本号 x.y.z 与带 v 前缀
  t = t.replace(/\bv?\d+\.\d+\.\d+[A-Za-z0-9._-]*\b/g, ' ');
  // 带单位的版本/型号（如 iPhone 16、v2、第 8 章）不处理：交给等式锚定天然过滤
  return { text: t, masked };
}

/* ---------------------------------------------------------------------------
 * 4) 算术等式抽取与核验
 * ------------------------------------------------------------------------- */
// 等式连接词（算式侧 -> 答案侧）。顺序敏感，先长后短。
const EQUALS = ['＝', '=', '等于', '等於', '等于说', '也就是', '即', '合计为', '总计为', '共计为', '共计', '合计', '总计', '总共为', '总共是', '一共是', '共是', '等于', '是', '为', '得', '得到'];
// 答案侧允许的单位（只用于剥除，不参与算术判定）
const TRAIL_UNIT = '(?:%|个|项|条|点|种|类|步|处|篇|名|位|家|次|遍|倍|元|块|分|秒|分钟|小时|天|年|米|公里|千克|克|个百分点)?';

// 数字 token：阿拉伯（含千分位、小数、%）或中文数字
const NUM = '(?:[0-9][0-9,]*\\.?[0-9]*%?|[零〇一二两三四五六七八九十百千万億亿萬点·]+)';
// 算式 token 字符集
const ARITH_CHAR = '[0-9.,%\\(\\)\\.\\+\\-\\*\\/×÷^\\s零〇一二两三四五六七八九十百千万億亿萬点·加减乘除×÷()（）．＊／－＋以的]';
// 算术等式：算式（含至少一个运算符） 连接词 数字。连接词前后允许中英文逗号/分号等停顿。
const ARITH_EQ_RE = new RegExp(
  '(' + ARITH_CHAR + '+?)' +
  '[\\s，,、；;]*(?:=|＝|等于|等於|也就是|合计为|总计为|共计为|共计|合计|总计|总共为|总共是|一共是|共是|是|为|得|得到)[\\s，,、；;]*' +
  '(' + NUM + ')\\s*' + TRAIL_UNIT,
  'g'
);

// 用于判断算式侧是否真的含二元运算符（避免把 "2026 是 10" 这种无意义声明当等式）
// 同时识别 "X 的 Y%"（百分比结构，归一化后即 X*Y/100）
const HAS_BIN_OP = /(?:[0-9零〇一二两三四五六七八九十百千万亿][\s的]*(?:\+|-|\*|\/|×|÷|\^|\*\*|加|减|乘|除|乘以|除以|加上|减去)[\s的]*[0-9零〇一二两三四五六七八九十百千万亿(（])|(?:[0-9零〇一二两三四五六七八九十百千万亿][\s的]*的[\s的]*[0-9.][0-9.]*\s*%)/;

function parseNumToken(tok) {
  if (tok == null) return null;
  let s = String(tok).trim();
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  s = s.replace(/,/g, '');
  let v;
  if (/^[0-9.]+$/.test(s)) {
    if ((s.match(/\./g) || []).length > 1) return null;
    v = Number(s);
  } else {
    v = cnToNumber(s);
  }
  if (v == null || !Number.isFinite(v)) return null;
  if (pct) v = v / 100;
  return v;
}

/** 按答案的精度比对：答案写 0.33 就把真值四舍五入到 2 位再比，避免 1/3 截断误报。 */
function closeByClaimed(actual, claimed, claimedRaw) {
  if (!Number.isFinite(actual) || !Number.isFinite(claimed)) return false;
  const raw = String(claimedRaw || '').trim().replace(/[,，]/g, '');
  // 整数答案：真值四舍五入到整数必须严格相等
  if (!/[.．点]/.test(raw)) {
    return Math.abs(actual - claimed) < 1e-6 && Math.round(actual) === claimed;
  }
  // 小数答案：按答案给出的小数位对齐
  const dot = raw.search(/[.．点]/);
  const tail = raw.slice(dot + 1);
  const decMatch = tail.match(/^[0-9]+/);
  const decimals = decMatch ? decMatch[0].length : 0;
  const rounded = Number(actual.toFixed(decimals));
  if (rounded === claimed) return true;
  // 相对容差兜底（0.3%），对极小绝对值用绝对容差
  const tol = Math.max(1e-4, Math.abs(actual) * 0.003);
  return Math.abs(actual - claimed) <= tol;
}

function verifyArithmetic(text) {
  const errors = [];
  const claims = [];
  let m;
  ARITH_EQ_RE.lastIndex = 0;
  // 逐行处理，避免跨行误连
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    // 一行内可能有多个等式
    let lm;
    const re = new RegExp(ARITH_EQ_RE.source, 'g');
    while ((lm = re.exec(line)) !== null) {
      const left = lm[1];
      const claimedRaw = lm[2];
      const full = lm[0];
      // 排除：算式侧无二元运算符
      if (!HAS_BIN_OP.test(left)) continue;
      // 排除：含代数变量字母（中文/数字/运算符之外的拉丁字母）
      if (/[A-Za-z]/.test(left)) continue;
      // 排除：范围/省略号
      if (/[~～…]|\.\s*\.\s*\./.test(left)) continue;
      // 排除：比较/逻辑符号（已在等式连接词中，但左值仍可能含 == != <= >= && ||）
      if (/[=<>!]={1,2}|&&|\|\||<=|>=|≠|≡/.test(left)) continue;
      // 排除：连接词前的算式侧以"减号/负号"结尾等畸形
      const trimmedLeft = left.trim();
      if (/[+\-*/×÷^]\s*$/.test(trimmedLeft)) continue;
      // 排除：括号不平衡
      const open = (trimmedLeft.match(/[（(]/g) || []).length;
      const close = (trimmedLeft.match(/[)）]/g) || []).length;
      if (open !== close) continue;
      let actual;
      try {
        actual = safeEval(trimmedLeft);
      } catch (e) {
        continue; // 求值失败（安全原因）-> 不核验，绝不臆断
      }
      if (!Number.isFinite(actual)) continue;
      const claimed = parseNumToken(claimedRaw);
      if (claimed == null) continue;
      claims.push({ left: trimmedLeft.replace(/\s+/g, ' '), claimed: claimedRaw, actual });
      if (!closeByClaimed(actual, claimed, claimedRaw)) {
        // 再做一次保守：若答案是真值的前若干位截断（有效数字），放过
        const sig = significantDigitsMatch(actual, claimedRaw);
        if (!sig) {
          errors.push({
            kind: 'arithmetic',
            raw: full.replace(/\s+/g, ' ').trim().slice(0, 80),
            expected: formatNumber(actual),
            claimed: String(claimedRaw).trim(),
            expression: trimmedLeft.replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }
  }
  return { errors, claims };
}

/** 有效数字对齐：答案可能按有效数字截断（如 1/3=0.333）。 */
function significantDigitsMatch(actual, claimedRaw) {
  const raw = String(claimedRaw).replace(/[,，%]/g, '').trim();
  const m = raw.match(/^0?\.(0*)([0-9]+)$/);
  if (!m) {
    // 形如 12.34
    const m2 = raw.match(/^([0-9]+)\.([0-9]+)$/);
    if (!m2) return false;
    const sig = (m2[1].replace(/^0+/, '') + m2[2]).length;
    const r = Number(actual.toPrecision(Math.max(1, sig)));
    return Math.abs(r - Number(raw)) <= Math.max(1e-9, Math.abs(actual) * 1e-6);
  }
  const leadZeros = m[1].length;
  const sig = m[2].length;
  const r = Number(actual.toPrecision(leadZeros + sig));
  return Math.abs(r - Number(raw)) <= Math.max(1e-12, Math.abs(actual) * 1e-6);
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return String(n);
  // 整数直接返回；小数保留合理位数，去掉浮点尾噪
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  let s = Number(n.toFixed(10)).toString();
  return s;
}

/* ---------------------------------------------------------------------------
 * 5) 日期星期核验
 * ------------------------------------------------------------------------- */
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const DATE_RE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:是|为|星期|礼拜)?\s*星期\s*([一二三四五六日天七])/g;
const DATE_RE2 = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:是|为)\s*周\s*([一二三四五六日天七])/g;

function verifyDates(text) {
  const errors = [];
  const claims = [];
  const doRe = (re) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const [, y, mo, d, w] = m;
      const yy = Number(y), mm = Number(mo), dd = Number(d);
      const dt = new Date(Date.UTC(yy, mm - 1, dd));
      if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) continue; // 非法日期
      const actual = dt.getUTCDay(); // 0=周日
      let claimed = WEEK_ZH.indexOf(w === '天' ? '日' : w);
      if (w === '七') claimed = 0;
      if (claimed < 0) continue;
      claims.push({ date: `${yy}-${mm}-${dd}`, claimed: w, actual: WEEK_ZH[actual] });
      if (actual !== claimed) {
        errors.push({
          kind: 'date',
          raw: m[0].replace(/\s+/g, '').slice(0, 40),
          expected: '星期' + WEEK_ZH[actual],
          claimed: '星期' + w,
          expression: `${yy}年${mm}月${dd}日`,
        });
      }
    }
  };
  doRe(DATE_RE);
  doRe(DATE_RE2);
  return { errors, claims };
}

/* ---------------------------------------------------------------------------
 * 6) 枚举计数核验
 * ------------------------------------------------------------------------- */
// 触发："共 N 点/项/条/个/大/处/步/种/类/原因/方法/步骤/方面/注意/关键/要素"
const COUNT_TRIGGER = /(?:共|一共|总共|总计|合计|以下|如下|下面|列出了?|列举|分为|包含|包括|有)[^0-9零〇一二两三四五六七八九十百千万亿\n]{0,8}?([0-9]+|[零〇一二两三四五六七八九十百千万]+)\s*(?:个|项|条|点|种|类|步|处|篇|名|位|家|大|方面|原因|方法|步骤|阶段|要素|注意|关键|原则|特征|问题|层面|维度|核心|部分)/g;

function cnSmallNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  return cnToNumber(s);
}

function verifyCounts(text) {
  const errors = [];
  const claims = [];
  let m;
  COUNT_TRIGGER.lastIndex = 0;
  while ((m = COUNT_TRIGGER.exec(text)) !== null) {
    const claimed = cnSmallNumber(m[1]);
    if (!Number.isFinite(claimed) || claimed < 2 || claimed > 60) continue; // 保守区间
    // 从触发位置往后找数字编号列表（1. 2. 3. / 1) 2) / 1、）
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4000);
    // 只统计"行首数字编号"，编号须从 1 开始连续
    const itemRe = /(^|\n)\s*(\d{1,2})\s*[.、)）]\s*\S/g;
    const seen = [];
    let im;
    while ((im = itemRe.exec(after)) !== null) {
      seen.push(Number(im[2]));
      if (seen.length > 80) break;
    }
    // 找一个"从 1 开始连续递增"的编号序列（允许重复开头，取最长连续段）
    if (seen.length < 2) continue;
    // 统计最大连续 1..N
    let expect = 1;
    let maxRun = 0;
    const used = new Set();
    for (const n of seen) {
      if (n === expect && !used.has(n)) { used.add(n); maxRun = expect; expect++; }
    }
    if (maxRun < 2) continue;
    // 仅当编号序列与声称数都较明确、且实际数明显对不上才报；
    // 必须声称的 N 与列表编号序列长度都落在合理区间，且差距明确（至少差 1，且不是嵌套造成）
    if (maxRun !== claimed) {
      // 保守：若实际编号数 >= 声称（列表写全了，可能后面还有别的编号），只在"少于声称"时才判定
      // （写全甚至更多通常是嵌套/附录，不报错；只有"承诺 N 个但编号没到 N"才是硬伤）
      if (maxRun < claimed) {
        errors.push({
          kind: 'count',
          raw: m[0].replace(/\s+/g, '').slice(0, 40),
          expected: '编号到 ' + claimed + '（实际只到 ' + maxRun + '）',
          claimed: String(claimed),
          expression: '枚举应为 ' + claimed + ' 项，实际检测到 ' + maxRun + ' 项',
        });
        claims.push({ claimed: claimed, actual: maxRun });
      }
    }
  }
  return { errors, claims };
}

/* ---------------------------------------------------------------------------
 * 7) 单位换算核验（同维度线性换算；温度非线性单独处理）
 * ------------------------------------------------------------------------- */
const UNITS = {
  // 长度（基准 m）
  mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000,
  毫米: 0.001, 厘米: 0.01, 公分: 0.01, 分米: 0.1, 米: 1, 公里: 1000, 千米: 1000, 里: 500,
  inch: 0.0254, in: 0.0254, 英寸: 0.0254, ft: 0.3048, 英尺: 0.3048, mile: 1609.344, 英里: 1609.344,
  // 质量（基准 g）
  mg: 0.001, g: 1, kg: 1000, t: 1e6,
  毫克: 0.001, 克: 1, 千克: 1000, 公斤: 1000, 吨: 1e6, 斤: 500, 两: 50, 磅: 453.59237, lb: 453.59237, oz: 28.349523, 盎司: 28.349523,
  // 存储（基准 byte）
  bit: 0.125, byte: 1, bytes: 1, B: 1,
  KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5,
  kb: 1000, mb: 1000 ** 2, gb: 1000 ** 3, tb: 1000 ** 4,
  // 时间（基准 s）
  ms: 0.001, s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  min: 60, mins: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hour: 3600, hours: 3600,
  day: 86400, days: 86400, week: 604800, weeks: 604800,
  毫秒: 0.001, 秒: 1, 秒钟: 1, 分钟: 60, 分: 60, 小时: 3600, 时: 3600, 天: 86400, 日: 86400, 周: 604800, 星期: 604800,
  // 面积（基准 m²）
  平方米: 1, 公顷: 10000, 平方公里: 1e6, 平方千米: 1e6, 亩: 2000 / 3,
  // 体积（基准 L）
  ml: 0.001, L: 1, l: 1, 毫升: 0.001, 升: 1, 公升: 1,
};

const UNIT_ALIASES = Object.keys(UNITS);
// 构造单位匹配（长别名优先）
const UNIT_PAT = UNIT_ALIASES.sort((a, b) => b.length - a.length).map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const UNIT_EQ_RE = new RegExp(
  '([0-9][0-9,]*\\.?[0-9]*|' + '[零〇一二两三四五六七八九十百千万億亿萬点·]+' + ')' +
  '\\s*(' + UNIT_PAT + ')' +
  '\\s*(?:=|＝|等于|等於|是|为|相当于|合)\\s*' +
  '([0-9][0-9,]*\\.?[0-9]*|' + '[零〇一二两三四五六七八九十百千万億亿萬点·]+' + ')' +
  '\\s*(' + UNIT_PAT + ')',
  'g'
);

function verifyUnits(text) {
  const errors = [];
  const claims = [];
  // 温度（线性/非线性）单独处理。单位用捕获组：①数字1 ②单位1 ③数字2 ④单位2
  const TEMP_UNIT = '℃|℉|°\\s*[CFK]|摄氏度|华氏度|开尔文|摄氏|华氏';
  const tempRe = new RegExp(
    '(-?\\d+(?:\\.\\d+)?)\\s*(' + TEMP_UNIT + ')' +
    '[\\s，,、；;]*(?:=|＝|等于|等於|是|为|相当于)[\\s，,、；;]*' +
    '(-?\\d+(?:\\.\\d+)?)\\s*(' + TEMP_UNIT + ')', 'g');
  let tm;
  const tempKind = (u) => {
    const x = u.replace(/\s/g, '');
    if (x.includes('℃') || x.includes('摄氏') || /(?:^|[^A-Za-z])C(?:[^A-Za-z]|$)/.test(x)) return 'C';
    if (x.includes('℉') || x.includes('华氏') || /(?:^|[^A-Za-z])F(?:[^A-Za-z]|$)/.test(x)) return 'F';
    if (x.includes('开尔文') || /(?:^|[^A-Za-z])K(?:[^A-Za-z]|$)/.test(x)) return 'K';
    return null;
  };
  const toC = (v, k) => (k === 'C' ? v : k === 'F' ? (v - 32) * 5 / 9 : v - 273.15);
  const fromC = (c, k) => (k === 'C' ? c : k === 'F' ? c * 9 / 5 + 32 : c + 273.15);
  while ((tm = tempRe.exec(text)) !== null) {
    const a = Number(tm[1]), ua = tempKind(tm[2]), b = Number(tm[3]), ub = tempKind(tm[4]);
    if (!ua || !ub || ua === ub) continue;
    const ca = toC(a, ua), cb = toC(b, ub);
    const expectedB = fromC(ca, ub);
    claims.push({ from: `${a}${ua}`, to: `${b}${ub}` });
    if (Math.abs(ca - cb) > 0.6) {
      errors.push({
        kind: 'unit',
        raw: tm[0].replace(/\s+/g, ' '),
        expected: formatNumber(expectedB) + ub,
        claimed: tm[0].replace(/\s+/g, ' '),
        expression: `${a}${ua} = ${formatNumber(expectedB)}${ub}`,
      });
    }
  }
  // 线性单位
  let m;
  UNIT_EQ_RE.lastIndex = 0;
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const re = new RegExp(UNIT_EQ_RE.source, 'g');
    while ((m = re.exec(line)) !== null) {
      const a = parseNumToken(m[1]);
      const ua = m[2];
      const b = parseNumToken(m[3]);
      const ub = m[4];
      if (a == null || b == null) continue;
      const fa = UNITS[ua], fb = UNITS[ub];
      if (fa == null || fb == null) continue;
      // 必须同维度（基准换算结果落在同一量纲；简单用"换算后再换算回"判断是否同维度）
      const inBase = a * fa;
      const expectedB = inBase / fb;
      if (!Number.isFinite(expectedB)) continue;
      // 维度粗判：不允许跨量纲（如 3kg = X米），用单位类别表
      const catOf = (u) => {
        const length = ['mm','cm','dm','m','km','毫米','厘米','公分','分米','米','公里','千米','里','inch','in','英寸','ft','英尺','mile','英里'];
        const mass = ['mg','g','kg','t','毫克','克','千克','公斤','吨','斤','两','磅','lb','oz','盎司'];
        const store = ['bit','byte','bytes','B','KB','MB','GB','TB','PB','kb','mb','gb','tb'];
        const time = ['ms','s','sec','secs','second','seconds','min','mins','minute','minutes','h','hr','hour','hours','day','days','week','weeks','毫秒','秒','秒钟','分钟','分','小时','时','天','日','周','星期'];
        const area = ['平方米','公顷','平方公里','平方千米','亩'];
        const vol = ['ml','L','l','毫升','升','公升'];
        if (length.includes(u)) return 'L';
        if (mass.includes(u)) return 'M';
        if (store.includes(u)) return 'S';
        if (time.includes(u)) return 'T';
        if (area.includes(u)) return 'A';
        if (vol.includes(u)) return 'V';
        return '?';
      };
      if (catOf(ua) !== catOf(ub)) continue;
      claims.push({ from: `${a}${ua}`, to: `${b}${ub}`, expected: expectedB });
      // 存储类有 1000（SI）/1024（JEDEC）双标准，都属正确，放宽到 5% 仅抓离谱错误；
      // 其余线性单位容差 0.5%。
      const cat = catOf(ua);
      const relTol = cat === 'S' ? 0.05 : 0.005;
      const tol = Math.max(1e-3, Math.abs(expectedB) * relTol);
      if (Math.abs(expectedB - b) > tol) {
        errors.push({
          kind: 'unit',
          raw: m[0].replace(/\s+/g, ' '),
          expected: formatNumber(expectedB) + ub,
          claimed: m[0].replace(/\s+/g, ' '),
          expression: `${a}${ua} = ${formatNumber(expectedB)}${ub}`,
        });
      }
    }
  }
  return { errors, claims };
}

/* ---------------------------------------------------------------------------
 * 8) 主入口
 * ------------------------------------------------------------------------- */
class GroundingCore {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.maxErrors = options.maxErrors || 8;
    this.history = [];
    this._turnGuard = new Map(); // sessionId -> {userSeq, steered, sig, busy}
  }

  /**
   * 核验一段助手最终文本。
   * @param {string} text 助手输出
   * @param {object} context { now?: Date }
   * @returns {{checked:number,errors:Array,claims:number,passed:boolean,summary:string}}
   */
  verify(text, context = {}) {
    const result = { checked: 0, errors: [], claims: 0, passed: true, summary: '' };
    if (!this.enabled || !text || typeof text !== 'string' || text.trim().length < 4) return result;
    try {
      const { text: clean } = stripNonVerifiable(text);
      const a = verifyArithmetic(clean);
      const d = verifyDates(text); // 日期用原文（stripNonVerifiable 会剥离中文日期前的数字日期形态）
      const c = verifyCounts(clean);
      const u = verifyUnits(clean);
      const all = [...a.errors, ...d.errors, ...c.errors, ...u.errors];
      // 去重（同表达式只报一次）
      const seen = new Set();
      for (const e of all) {
        const key = e.kind + '|' + (e.expression || e.raw);
        if (seen.has(key)) continue;
        seen.add(key);
        result.errors.push(e);
      }
      result.claims = a.claims.length + d.claims.length + c.claims.length + u.claims.length;
      result.checked = result.claims;
      if (result.errors.length > this.maxErrors) result.errors.length = this.maxErrors;
      result.passed = result.errors.length === 0;
      result.summary = this.buildRevision(result.errors);
      this.history.push({ at: Date.now(), claims: result.claims, errors: result.errors.length });
      if (this.history.length > 200) this.history.shift();
    } catch (e) {
      // 任何异常都不得阻断主链路：核验失败 = 不报，绝不误报
      result.passed = true;
      result.errors = [];
    }
    return result;
  }

  /**
   * 宿主回合集成入口（turn-stopping）：对"最后一条助手输出"做确定性核验并决定是否注入勘误。
   * 自包含会话级防自激：同一 userSeq（同一个用户问题）最多 steer 一次；同一事件签名不重入；
   * 不依赖 LLM 自省接续预算（简单问题 cplx=0 时该预算为 0，所以不能走 continuation gate）。
   *
   * @param {object} q
   * @param {string} q.sessionId       会话 id（guard 按会话隔离）
   * @param {number} q.userSeq        当前用户消息序号（同序号内不重复勘误，新问题重置）
   * @param {string} q.sig            事件流签名（同签名不重入）
   * @param {string} q.assistantText  最后一条助手文本
   * @param {Date}   [q.now]
   * @param {(content:string)=>boolean} q.steer 注入勘误回调，返回 true 表示成功接续
   * @returns {{checked:number,errors:number,steered:boolean,summary:string|null}}
   */
  evaluateTurn(q = {}) {
    const out = { checked: 0, errors: 0, steered: false, summary: null };
    if (!this.enabled) return out;
    const sessionId = q.sessionId;
    if (!sessionId || typeof q.steer !== 'function') return out;
    let g = this._turnGuard.get(sessionId);
    if (!g) { g = { userSeq: -1, steered: 0, sig: null, busy: false }; this._turnGuard.set(sessionId, g); }
    try {
      // 新用户问题：重置勘误额度（允许对新问题再勘一次）
      if (g.userSeq !== q.userSeq) { g.userSeq = q.userSeq; g.steered = 0; g.sig = null; }
      // 三重防自激：不忙 + 签名变化 + 本问题尚未勘误
      if (g.busy || g.sig === q.sig || g.steered >= 1) return out;
      const at = q.assistantText;
      if (!at || typeof at !== 'string' || at.length < 4) return out;
      g.busy = true; g.sig = q.sig;
      try {
        const res = this.verify(at, { now: q.now || new Date() });
        out.checked = res.checked | 0;
        out.errors = res.errors.length | 0;
        if (!res.passed && res.errors.length > 0 && res.summary) {
          let ok = false;
          try { ok = !!q.steer(res.summary); } catch (e) { ok = false; }
          if (ok) { g.steered = 1; out.steered = true; out.summary = res.summary; }
        }
      } finally {
        g.busy = false;
      }
    } catch (e) {
      try { const g2 = this._turnGuard.get(sessionId); if (g2) g2.busy = false; } catch (e2) { /* noop */ }
    }
    return out;
  }

  /** 生成精确到逐条的勘误证据（模型无法抵赖，且只需改数字、不动其余结论）。 */
  buildRevision(errors) {
    if (!errors || !errors.length) return '';
    const lines = [];
    for (const e of errors) {
      if (e.kind === 'arithmetic') {
        lines.push(`· 算术核验：${e.expression} 正确结果应为 ${e.expected}，你写成了 ${e.claimed}。`);
      } else if (e.kind === 'date') {
        lines.push(`· 日期核验：${e.expression} 应为${e.expected.replace('星期', '星期')}，你写成了${e.claimed}。`);
      } else if (e.kind === 'count') {
        lines.push(`· 计数核验：你声明${e.expression}，编号序列对不上，请补齐缺失项或更正数字。`);
      } else if (e.kind === 'unit') {
        lines.push(`· 单位核验：${e.expression}，你写成了 ${e.claimed}。`);
      }
    }
    return '【Think 确定性核验·本地真值判定（零概率误差）】下列结论经宿主确定性内核（非 LLM 复审）逐项核算，确认有误：\n' +
      lines.join('\n') +
      '\n请仅修正上述数值/结论（这些有唯一正确答案，必须与核验结果一致），其余完全正确的部分原样保留；不要寒暄、不要复述题目、不要提及核验过程。';
  }
}

module.exports = {
  GroundingCore,
  safeEval,
  normalizeExpression,
  cnToNumber,
  verifyArithmetic,
  verifyDates,
  verifyCounts,
  verifyUnits,
  closeByClaimed,
  stripNonVerifiable,
};
