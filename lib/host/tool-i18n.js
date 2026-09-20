// tool-i18n.js — Ultra 工具箱双语本地化（机制层）
// 设计：工具的中文 title/description 是默认值；英文模式下按名字查表替换。
//   - 时间线标题（presentCall，用户可见）与工具描述（模型可见）都走这里；
//   - 查不到翻译时优雅回退中文，绝不因缺一条翻译而报错或漏注册（可增量补全）；
//   - 只做纯函数映射，不碰 execute/render 逻辑，零行为回归。
//
// 约定：TOOL_LOCALE[name] = { t: 英文短标题（时间线/卡片用）, d: 英文描述（何时调用，给模型） }

export const TOOL_LOCALE = {
  // —— Pro 第五批（样板，后续工具按此增量补齐）——
  ultra_axiom_unwind: {
    t: 'Axiom Unwind · Multi-foundation',
    d: 'Pro only. Drill a claim down to its irreducible axioms, label each as fact/definition/replaceable assumption/value stance, then re-derive the claim under 2-3 mutually exclusive axiom systems to show where swapping a foundation changes the result.',
  },
  ultra_modal_worlds: {
    t: 'Modal Possible Worlds',
    d: 'Pro only. Decide whether a claim is necessary / possible / contingent / impossible by testing it across several counterfactual possible worlds (including the worst case), and list the conditions under which the claim collapses.',
  },
  ultra_recursion_fixpoint: {
    t: 'Recursive Fixpoint',
    d: 'Pro only. Repeatedly ask "on what ground?" for every supporting reason until reaching a self-evident fixpoint, empirical evidence, circular reasoning, infinite regress, or an external assumption; expose circular chains and the minimal self-consistent belief core.',
  },
  ultra_strange_loop: {
    t: 'Strange-Loop Dissolution',
    d: 'Pro only (advanced). When a problem is self-referential (this statement, a system describing itself, observer = observed), separate benign self-reference from vicious paradox and dissolve the loop via object/meta level stratification, returning a non-self-referential rewrite and any residual undecidable term.',
  },
  ultra_ontic_collapse: {
    t: 'Ontic Collapse · Occam',
    d: 'Pro only. For competing explanations, count the unobservable entities each must commit to, collapse to the most parsimonious one that loses no explanatory power, and keep the indispensable plural explanations that cover evidence others cannot.',
  },
  ultra_observer_relativity: {
    t: 'Observer Relativity Matrix',
    d: 'Pro only. Evaluate a supposedly objective claim separately for different observers (roles, stakes, time scales, information sets), produce a relativity matrix, strip out stances disguised as objective, and state the truly observer-invariant core if one exists.',
  },
};

/**
 * 按语言本地化一个已成型的工具对象（纯函数、幂等、就地轻改并返回）。
 * 仅 lang==='en' 且查得到词条时替换；其它情况原样返回，保证零回归。
 */
export function localizeTool(tool, lang) {
  try {
    if (!tool || lang !== 'en') return tool;
    const L = TOOL_LOCALE[tool.name];
    if (!L) return tool;
    if (L.d) tool.description = L.d;
    if (L.t) {
      const origPresentCall = typeof tool.presentCall === 'function' ? tool.presentCall.bind(tool) : null;
      // 只换标题，保留原 presentCall 的 card/kind/rawInput，时间线图标与参数摘要不变
      tool.presentCall = (args) => {
        let base = null;
        try { base = origPresentCall ? origPresentCall(args) : null; } catch { base = null; }
        return { card: (base && base.card) || 'generic', title: L.t, kind: (base && base.kind) || 'execute', rawInput: (base && base.rawInput) || '' };
      };
      tool.__localizedTitle = L.t;
    }
    return tool;
  } catch {
    return tool; // 本地化任何意外都不影响工具本身
  }
}

export function localizeList(list, lang) {
  try { return (Array.isArray(list) ? list : []).map((t) => localizeTool(t, lang)); } catch { return list; }
}

export default { TOOL_LOCALE, localizeTool, localizeList };
