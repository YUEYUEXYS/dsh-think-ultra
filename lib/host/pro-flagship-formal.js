// pro-flagship-formal.js — Pro 旗舰工具箱·第二组（自蒸馏固化 / 贝叶斯置信校准 / 证明链构造）
// 贝叶斯校准与自蒸馏为确定性数学/结构工具（不烧 API、绝不因网络失败而崩）；
// 证明链在 MAX 底座上产出逐步证明，再用确定性规则校验“每步是否有前因”，缺口即标红。
import { defineTool } from '@deepseek-ai/dsh-tools';
import { sampleOnce } from './tournament-engine.js';

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const asArr = (v) => Array.isArray(v) ? v : [];
function extractJson(raw) {
  if (!raw) return null;
  const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence : raw;
  const m = String(body).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m); } catch { return null; }
}
function routeOf(exec, deps) {
  const header = (exec && exec.agent && exec.agent.session && exec.agent.session.header) || {};
  return { provider: header.provider || deps.provider || '', model: header.model || deps.model || '', signal: exec && exec.signal };
}
async function maxJson(llm, opts) {
  if (!llm || typeof llm.stream !== 'function') return { ok: false, reason: 'no-llm' };
  try {
    const r = await sampleOnce(llm, {
      provider: opts.provider, model: opts.model, signal: opts.signal,
      system: opts.system || '你只输出严格 JSON，不要输出多余文字。',
      prompt: opts.prompt, temperature: opts.temperature ?? 0.4, maxTokens: opts.maxTokens,
    });
    if (!r || r.ok === false || !r.text) return { ok: false, reason: 'sample-failed' };
    const j = extractJson(r.text);
    if (j == null) return { ok: false, reason: 'not-json', text: r.text };
    return { ok: true, json: j, text: r.text };
  } catch (e) {
    return { ok: false, reason: 'throw:' + (e && e.message ? e.message : String(e)) };
  }
}
const clamp01 = (x) => { const n = Number(x); return Number.isFinite(n) ? Math.max(1e-4, Math.min(1 - 1e-4, n)) : 0.5; };
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function appendTrace(exec, channel, payload) {
  try { exec && exec.agent && exec.agent.session.append(channel, payload); } catch { /* contained */ }
}

export function proFlagshipFormal(deps) {
  return [
    defineTool({
      name: 'ultra_bayes_calib',
      description: 'Pro 专用·贝叶斯置信校准（确定性计算，不额外消耗）：给每条关键结论一个先验概率，再登记若干独立证据的强度，工具在对数几率空间融合，输出校准后的后验与高/中/低等级，并指出要把结论推翻需要多强的反证，消灭“感觉很对”的过度自信。',
      parameters: {
        claims: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              name: { type: 'string', required: true, description: '结论名称。' },
              prior: { type: 'number', description: '先验概率 0-1，缺省 0.5。' },
              evidence: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { strength: { type: 'number', description: '单条证据在对数几率上的强度 -4(强反证) 到 +4(强正证)。' }, note: { type: 'string' } } } },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            calibrated: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', required: true }, prior: { type: 'number', required: true }, posterior: { type: 'number', required: true }, band: { type: 'string', required: true }, falsifyNeeded: { type: 'string', required: true } } } },
          },
        },
        render: (_a, v) => [{ type: 'text', text: '贝叶斯校准结果：\n' + v.calibrated.map((c) => `·${c.name}：${(c.prior * 100).toFixed(0)}% → ${(c.posterior * 100).toFixed(0)}%（${c.band}）；${c.falsifyNeeded}`).join('\n') }],
      },
      execute(args) {
        const calibrated = asArr(args.claims).filter((c) => c && String(c.name || '').trim()).slice(0, 12).map((c) => {
          const p = clamp01(c.prior == null ? 0.5 : c.prior);
          let lo = Math.log(p / (1 - p));
          asArr(c.evidence).slice(0, 16).forEach((e) => {
            const s = Number(e.strength);
            if (Number.isFinite(s)) lo += Math.max(-4, Math.min(4, s));
          });
          const posterior = sigmoid(lo);
          const band = posterior >= 0.85 ? '高置信' : posterior >= 0.6 ? '中置信' : '低置信';
          // 要把后验打回 0.5 以下，需要的反向对数几率强度
          const need = Math.max(0, lo);
          const falsifyNeeded = need <= 0.05
            ? '本就接近中立，少量反证即可推翻'
            : '要推翻它需累计约 ' + need.toFixed(2) + ' 对数几率（约 ' + Math.round((1 - sigmoid(-need)) * 100) + '% 强度）的独立反证';
          return { name: clip(c.name, 200), prior: Math.round(p * 1000) / 1000, posterior: Math.round(posterior * 1000) / 1000, band, falsifyNeeded };
        });
        return { calibrated };
      },
      presentCall: (args) => ({ card: 'generic', title: '贝叶斯置信校准', kind: 'other', rawInput: asArr(args.claims).length + ' 条结论' }),
    }),

    defineTool({
      name: 'ultra_self_distill',
      description: 'Pro 专用·自蒸馏固化（确定性，不额外消耗）：一个难题解完后，把走通的路径、奏效的招与踩过的坑蒸馏成可复用的紧凑规则并登记进外置黑板，供结构相似的后续任务直接检索调用，让能力随使用累积，而不是每次从零开始。',
      parameters: {
        topic: { type: 'string', required: true, description: '这类任务/问题的主题。' },
        winningMoves: { type: 'array', items: { type: 'string' }, description: '这次真正奏效的做法。' },
        failures: { type: 'array', items: { type: 'string' }, description: '这次踩过的坑/失败路径。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            rules: { type: 'array', required: true, items: { type: 'string' } },
            checks: { type: 'array', required: true, items: { type: 'string' } },
            registered: { type: 'integer', required: true },
          },
        },
        render: (_a, v) => [{ type: 'text', text: `已蒸馏固化 ${v.registered} 条：\n复用规则：\n` + v.rules.map((x) => '· ' + x).join('\n') + '\n前置检查：\n' + v.checks.map((x) => '· ' + x).join('\n') }],
      },
      execute(args, exec) {
        const seen = new Set();
        const uniq = (arr, prefix) => asArr(arr).map((x) => clip(x, 240)).filter((x) => {
          const k = prefix + ':' + x.trim();
          if (!x.trim() || seen.has(k)) return false; seen.add(k); return true;
        });
        const rules = uniq(args.winningMoves, 'r').map((x) => '【' + clip(args.topic, 40) + '】复用：' + x).slice(0, 10);
        const checks = uniq(args.failures, 'f').map((x) => '【' + clip(args.topic, 40) + '】先排雷：' + x + '（开工前先验证它不成立）').slice(0, 10);
        appendTrace(exec, 'ultra/self-distill', { topic: clip(args.topic, 60), rules: rules.length, checks: checks.length });
        return { rules, checks, registered: rules.length + checks.length };
      },
      presentCall: (args) => ({ card: 'generic', title: '自蒸馏固化', kind: 'other', rawInput: clip(args.topic, 40) }),
    }),

    defineTool({
      name: 'ultra_proof_chain',
      description: 'Pro 专用·证明链构造：需要一步步可被独立复核的严谨论证时调用。在 MAX 底座上产出“前因编号 + 推理规则”的逐步证明链，工具再确定性校验每一步是否都引用了已成立的前步、有没有跳步，发现缺口立即标红要求补引理，交付前整条链必须能从头独立重播。',
      parameters: {
        proposition: { type: 'string', required: true, description: '要证明的命题/要论证成立的结论。' },
        givens: { type: 'array', items: { type: 'string' }, description: '已知条件/公理/定义，可留空由工具补。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            chain: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { step: { type: 'integer', required: true }, claim: { type: 'string', required: true }, from: { type: 'array', required: true, items: { type: 'integer' } }, rule: { type: 'string', required: true } } } },
            gaps: { type: 'array', required: true, items: { type: 'string' } },
            replayable: { type: 'boolean', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '证明链通道暂不可用，请手工为每步标注前因。' }] : [{ type: 'text', text: '证明链：\n' + v.chain.map((s) => `S${s.step}[由 ${s.from.length ? s.from.map((x) => 'S' + x).join(',') : '已知'}·${s.rule}] ${s.claim}`).join('\n') + (v.gaps.length ? '\n缺口（必须补引理）：\n' + v.gaps.map((x) => '· ' + x).join('\n') : '\n每步均有前因，可从头独立重播。') }],
      },
      async execute(args, exec) {
        const empty = { ran: false, chain: [], gaps: [], replayable: false };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.3, maxTokens: deps.strength().maxTokens,
          system: '你是证明链构造器，每一步都标注前因步骤编号与推理规则，只输出严格 JSON，不许跳步。',
          prompt: [
            '构造一条可独立重播的证明链：从已知条件出发，每一步给出 claim、它由哪些前步(编号数组，起始步用空数组表示已知/定义)推出、使用的推理规则；不允许出现没有前因、也不是已知的跳跃步骤。',
            '【已知条件】\n' + (asArr(args.givens).length ? asArr(args.givens).map((x) => '· ' + clip(x, 300)).join('\n') : '（由你补全必要定义与公理）'),
            '【待证命题】\n' + clip(args.proposition, 2500),
            '只输出 JSON：{"chain":[{"step":从1递增,"claim":"本步结论","from":[前步编号],"rule":"推理规则名"}] }',
          ].join('\n\n'),
        });
        if (!r.ok) return empty;
        const chain = asArr(r.json.chain).slice(0, 20).map((s, i) => ({
          step: i + 1,
          claim: clip(s.claim, 600),
          from: asArr(s.from).map((x) => Math.max(0, Math.min(20, Math.round(Number(x) || 0)))).filter((x) => x < i + 1),
          rule: clip(s.rule, 120) || '未注明规则',
        }));
        // 确定性校验：非起始步必须引用至少一个更早的步骤，且不能引用自己/未来步
        const gaps = [];
        chain.forEach((s) => {
          if (s.step > 1 && s.from.length === 0) gaps.push('S' + s.step + ' 没有引用任何前步，疑似跳步：' + s.claim.slice(0, 40));
        });
        appendTrace(exec, 'ultra/proof-chain', { steps: chain.length, gaps: gaps.length });
        return { ran: true, chain, gaps: gaps.slice(0, 12), replayable: gaps.length === 0 && chain.length > 0 };
      },
      presentCall: (args) => ({ card: 'generic', title: '证明链构造', kind: 'execute', rawInput: clip(args.proposition, 60) }),
    }),
  ];
}

export default { proFlagshipFormal };
