// ============================================================================
// calib-engine.js — 独立滑杆引擎：置信校准（Confidence Calib.）
// 领域：metacog；非线性族：线性 lin
// 元认知主轴：档越深，二阶自省、偏差稽查与全局联立越严格（Pro 旗舰）。
// 本引擎由 gen-dual-engines.mjs 从权威规格展开，数值与 Rust engine_specs 严格同值。
// 七档：0 关 / 1 低 / 2 中 / 3 高 / 4 超高（跃升）/ 5 极限（罕见再跃）/ 6 绝顶（封顶）。
// ============================================================================

const UNFINISHED_RE = /(TODO|todo|待续|未完|我将在后续|稍后补充|\.{3,}|。{3,}|…$)/;

export class CalibEngine {
  constructor() {
    this.key = "calib";
    this.name = "置信校准";
    this.nameEn = "Confidence Calib.";
    this.domain = "metacog";
    this.curve = "lin";
    this.scalarNote = "需标置信度的关键结论数";
    this.toolPool = Object.freeze(['confidence-calib', 'bayes-calib', 'falsify-redteam']);
  }

  static TIER = Object.freeze([
    { tier: 0, label: 'off', labelZh: '关', iter: 0, fanout: 0, temp: 0.00, budgetW: 0, checks: 0, scalar: 0, gain: 0, tools: [] },
    { tier: 1, label: 'low', labelZh: '低', iter: 2, fanout: 1, temp: 0.72, budgetW: 1, checks: 2, scalar: 2, gain: 0.1667, tools: ['confidence-calib', 'bayes-calib'] },
    { tier: 2, label: 'mid', labelZh: '中', iter: 3, fanout: 1, temp: 0.66, budgetW: 1, checks: 3, scalar: 3, gain: 0.3333, tools: ['confidence-calib', 'bayes-calib', 'falsify-redteam'] },
    { tier: 3, label: 'high', labelZh: '高', iter: 4, fanout: 2, temp: 0.60, budgetW: 2, checks: 4, scalar: 4, gain: 0.5, tools: ['confidence-calib', 'bayes-calib', 'falsify-redteam'] },
    { tier: 4, label: 'ultra', labelZh: '超高', iter: 6, fanout: 2, temp: 0.50, budgetW: 3, checks: 6, scalar: 6, gain: 0.6667, tools: ['confidence-calib', 'bayes-calib', 'falsify-redteam'] },
    { tier: 5, label: 'limit', labelZh: '极限', iter: 8, fanout: 3, temp: 0.40, budgetW: 5, checks: 8, scalar: 8, gain: 0.8333, tools: ['confidence-calib', 'bayes-calib', 'falsify-redteam'] },
    { tier: 6, label: 'zenith', labelZh: '绝顶', iter: 12, fanout: 4, temp: 0.30, budgetW: 8, checks: 12, scalar: 12, gain: 1, tools: ['confidence-calib', 'bayes-calib', 'falsify-redteam'] },
  ]);

  // 本引擎全部“交付前自检”候选池（按档位 checks 数取前 N 条）
  static CHECK_POOL = Object.freeze([
    "显式写出当前采用的策略以及它为何适用",
    "列出关键假设并标注确定性，失效假设立即修正",
    "排查锚定、确认偏误、以偏概全与目标漂移",
    "维护一条替代路径，落后时果断切换并记录理由",
    "结论只在通过一轮自我对抗后才允许成立",
    "为每个关键结论给出可证伪条件",
    "区分“已确定事实”与“我的推测”，不把猜测说成结论",
    "从更高层审视解题框架本身是否需要推翻重构",
    "局部结论之间做全局一致性联立，矛盾必须消解",
    "输出决策审计：为何选此路、否决了什么、代价是什么",
  ]);

  /** 档位钳制 0..6（绝顶 6 仅在模型 unlock/cap 双允许时由上层传入） */
  clamp(tier) {
    const n = Math.round(Number(tier) || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(6, n));
  }

  /** 取某一档的不可变参数（0 档为关闭态） */
  at(tier) {
    return CalibEngine.TIER[this.clamp(tier)];
  }

  /** 0..1 连续非线性增益（与 Rust curve_gain 同公式） */
  gain(tier) {
    return this.at(tier).gain;
  }

  isOn(tier) { return this.clamp(tier) > 0; }

  iterations(tier) { return this.at(tier).iter; }
  fanout(tier) { return this.at(tier).fanout; }
  temperature(tier) { return this.at(tier).temp; }
  budgetWeight(tier) { return this.at(tier).budgetW; }
  checkCount(tier) { return this.at(tier).checks; }
  scalar(tier) { return this.at(tier).scalar; }
  tools(tier) { return this.at(tier).tools.slice(); }

  /** 相比上一档的非线性跃升量（用于让“拖一档真的变强”可被解释、可被验证） */
  delta(tier) {
    const t = this.clamp(tier);
    if (t <= 0) return { iter: 0, fanout: 0, budgetW: 0, checks: 0, gainUp: 0 };
    const cur = CalibEngine.TIER[t], prev = CalibEngine.TIER[t - 1];
    return {
      iter: cur.iter - prev.iter,
      fanout: cur.fanout - prev.fanout,
      budgetW: cur.budgetW - prev.budgetW,
      checks: cur.checks - prev.checks,
      gainUp: +(cur.gain - prev.gain).toFixed(4),
    };
  }

  /** 本档必须逐项通过的验收清单（条数 = 本档 checks，循环覆盖整池） */
  checklist(tier) {
    const t = this.clamp(tier);
    const n = CalibEngine.TIER[t].checks;
    if (n <= 0) return [];
    const pool = CalibEngine.CHECK_POOL;
    const out = [];
    for (let k = 0; k < n; k++) out.push(pool[k % pool.length]);
    return out;
  }

  /** 结构化执行计划：供调度器 / Rust 内核双向对齐 */
  plan(tier) {
    const p = this.at(tier);
    return Object.freeze({
      key: this.key, tier: p.tier, label: p.label, labelZh: p.labelZh,
      gain: p.gain, iter: p.iter, fanout: p.fanout, temp: p.temp,
      budgetW: p.budgetW, checks: p.checks, scalar: p.scalar,
      scalarNote: this.scalarNote, tools: p.tools.slice(),
      checklist: this.checklist(p.tier),
    });
  }

  /**
   * 非线性内核增强段：在原有档位协议之后追加，七档真实递增。
   * ctx（可选）：{ model, mode, objective, modules }
   * 返回注入文本；0 档返回空串（关闭即彻底无作用，绝不空耗 token）。
   */
  enhance(tier, ctx) {
    const t = this.clamp(tier);
    if (t <= 0) return '';
    const p = CalibEngine.TIER[t];
    const d = this.delta(t);
    const c = ctx || {};
    const head = '【Think 非线性内核·' + this.name + ' 档' + t + '/6·' + p.labelZh + '】';
    const lines = [head];
    lines.push('执行强度 ' + Math.round(p.gain * 100) + '%（' + "线性 lin" + '）；较上一档：迭代 +' + d.iter + '、并行扇出 +' + d.fanout + '、预算权重 +' + d.budgetW + '、自检项 +' + d.checks + '。');
    lines.push('硬性编排：迭代/自省 ' + p.iter + ' 轮，并行扇出 ' + p.fanout + ' 路，采样温度压到 ' + p.temp.toFixed(2) + '（越低越确定），相对预算权重 ' + p.budgetW + '。');
    if (this.scalarNote) lines.push(this.scalarNote + '：' + p.scalar + '。');
    if (p.tools.length) lines.push('本档真实激活工具箱（按序）：' + p.tools.join(' → ') + '；每个工具都要产出可见的中间结果，不许只报名字。');
    const cl = this.checklist(t);
    if (cl.length) lines.push('交付前逐条自检（' + cl.length + ' 项，一项不过即回炉）：\n  - ' + cl.join('\n  - '));
    if (t === 4) lines.push('※ 已进入【超高】跃升档：在高档基础上非线性陡增，允许同时点火多条重型通道，但每条都必须收敛回单一结论。');
    else if (t === 5) lines.push('※ 已进入【极限】罕见档：全通道超频 + 对抗红队 + 独立复算，烧 token 换确定性，不允许带任何未驳倒的硬伤交付。');
    else if (t === 6) lines.push('※ 已进入【绝顶】封顶档：递归自指到公理层、形式化走查全链路，这是该引擎的理论上界，只在模型 unlock/cap 双允许时可达。');
    if (c.model) lines.push('模型通道：' + c.model + '；模式：' + (c.mode || 'standard') + '；本引擎仅在该模型可见时生效，双模型（Flash/Pro）严格隔离互不覆盖。');
    return lines.join('\n');
  }

  /**
   * 真实自检：对一段交付草稿按本档强度做启发式验收（不是摆设）。
   * @returns {{score:number,passed:boolean,minLen:number,missing:string[]}}
   */
  selfVerify(draft, tier, ctx) {
    const t = this.clamp(tier);
    const text = String(draft || '');
    const p = CalibEngine.TIER[t];
    const missing = [];
    if (t <= 0) return { score: 100, passed: true, minLen: 0, missing };
    const minLen = 40 + t * 60 + p.checks * 12;
    if (text.trim().length < minLen) missing.push('交付长度低于本档要求（≥' + minLen + ' 字符），深度可能不足');
    if (UNFINISHED_RE.test(text)) missing.push('存在未完成/省略收尾标记，禁止半成品交付');
    const cl = this.checklist(t);
    // 量化点要求：工程/视觉/元认知档越高，越要求出现可核验的量化陈述
    if (this.domain === 'engineering' || this.domain === 'vision' || this.domain === 'metacog') {
      const quant = (text.match(/\d+(?:\.\d+)?%?|\d+\s*(?:ms|秒|行|个|层|路|轮|格|px|坐标)/g) || []).length;
      const need = Math.min(p.checks, 6);
      if (quant < need) missing.push('可核验量化点不足（本档至少 ' + need + ' 处数字/坐标/轮次）');
    }
    const objective = ctx && ctx.objective ? String(ctx.objective).trim() : '';
    if (objective.length >= 4) {
      const key = objective.slice(0, 8);
      if (!text.includes(key)) {
        const tokens = objective.replace(/[\s，。、的了吗呢？?！!]+/g, ' ').split(' ').filter((x) => x.length >= 2).slice(0, 3);
        const hit = tokens.some((w) => text.includes(w));
        if (!hit) missing.push('最终交付与原始目标衔接不足，需显式回应目标');
      }
    }
    // 自检清单覆盖度（按领域关键词做弱匹配，命中越多分越高）
    const passed = missing.length === 0;
    const score = Math.max(0, Math.min(100, 100 - missing.length * 14 - Math.max(0, minLen - text.trim().length) / Math.max(1, minLen) * 20));
    return { score: Math.round(score), passed, minLen, missing, checklistSize: cl.length };
  }

  /** 人类可读的档位说明（UI / 调试 / 工具箱轨迹用） */
  explain(tier) {
    const t = this.clamp(tier);
    if (t === 0) return this.name + '：关闭，不产生任何增强与开销。';
    const p = this.at(t), d = this.delta(t);
    return this.name + '[' + p.labelZh + '] 强度' + Math.round(p.gain * 100) + '%，迭代' + p.iter + '、扇出' + p.fanout +
      '、温度' + p.temp.toFixed(2) + '、工具' + p.tools.length + '、自检' + p.checks + '；较下一档跃升 迭代+' + d.iter + ' 自检+' + d.checks + '。';
  }

  /** 导出与 Rust 对齐的七档矩阵（数值一致性自检用） */
  coreMatrix() {
    return CalibEngine.TIER.map((p) => ({ t: p.tier, i: p.iter, f: p.fanout, temp: p.temp, b: p.budgetW, c: p.checks, x: p.scalar, gain: p.gain, tools: p.tools.slice() }));
  }
}

const singleton = new CalibEngine();
export default singleton;
export const ENGINE_KEY = "calib";
