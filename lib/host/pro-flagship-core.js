// pro-flagship-core.js — Pro 旗舰工具箱·第一组（元锦标赛 / 全局约束求解 / 终极红队）
// 独立模块：自带精简的内部 MAX 调用辅助，全部走 ctx.llm 真实独立调用（reasoningEffort 恒 max），
// 任何 API 失败都收敛为空结果而不抛进 agent loop。仅在选中 Ultra 且模型为 Pro 时挂载。
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
function appendTrace(exec, channel, payload) {
  try { exec && exec.agent && exec.agent.session.append(channel, payload); } catch { /* contained */ }
}

export function proFlagshipCore(deps) {
  return [
    defineTool({
      name: 'ultra_meta_tournament',
      description: 'Pro 专用·元锦标赛：当普通多稿择优仍不放心时调用。把各路分支/锦标赛的胜出者当作参赛选手，在 MAX 底座上再跑一层独立淘汰，每轮写明败者死因与可复活条件，直到出现唯一稳定胜者，避免“一次采样碰巧赢”。',
      parameters: {
        problem: { type: 'string', required: true, description: '要决出唯一稳定答案的原始问题。' },
        contenders: { type: 'array', required: true, items: { type: 'string' }, description: '上一层各分支/锦标赛的候选结论。' },
        rounds: { type: 'integer', enum: [2, 3], description: '再淘汰层数，缺省 2。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            rounds: { type: 'integer', required: true },
            eliminations: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { loser: { type: 'string', required: true }, fatal: { type: 'string', required: true }, revivable: { type: 'string' } } } },
            champion: { type: 'string', required: true },
            stability: { type: 'string', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '元锦标赛通道暂不可用，退回单层择优。' }] : [{ type: 'text', text: `元锦标赛（${v.rounds} 层）淘汰 ${v.eliminations.length} 路：\n` + v.eliminations.map((e) => `·淘汰 ${e.loser}：${e.fatal}`).join('\n') + '\n唯一稳定胜者：' + v.champion + '\n稳定性：' + v.stability }],
      },
      async execute(args, exec) {
        const empty = { ran: false, rounds: 0, eliminations: [], champion: '', stability: '' };
        const contenders = asArr(args.contenders).map((x) => clip(x, 1200)).filter(Boolean).slice(0, 8);
        if (contenders.length < 2) return { ...empty, stability: '候选不足两路，无需元锦标赛' };
        const rounds = Number(args.rounds) === 3 ? 3 : 2;
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.45, maxTokens: deps.strength().maxTokens,
          system: '你是元锦标赛裁判长，只输出严格 JSON，两两淘汰时必须给出具体死因，不许和稀泥。',
          prompt: [
            '把下列候选当作上一层锦标赛的胜出者，再做 ' + rounds + ' 层独立淘汰：每层两两比较，沿正确性/证据强度/完备性/可执行性淘汰较弱者，写清败者的致命缺陷与在什么新证据下可复活；直到唯一稳定胜者。',
            '【原始问题】\n' + clip(args.problem, 2500),
            '【参赛候选】\n' + contenders.map((c, i) => (i + 1) + '. ' + c).join('\n'),
            '只输出 JSON：{"eliminations":[{"loser":"被淘汰候选","fatal":"具体致命缺陷","revivable":"可复活条件"}],"champion":"唯一稳定胜者","stability":"为何它在多层淘汰后仍稳定"}',
          ].join('\n\n'),
        });
        if (!r.ok) return empty;
        appendTrace(exec, 'ultra/meta-tournament', { in: contenders.length, rounds });
        return {
          ran: true, rounds,
          eliminations: asArr(r.json.eliminations).slice(0, 8).map((e) => ({ loser: clip(e.loser, 400), fatal: clip(e.fatal, 500), revivable: clip(e.revivable, 300) })),
          champion: clip(r.json.champion, 1800), stability: clip(r.json.stability, 600),
        };
      },
      presentCall: (args) => ({ card: 'generic', title: '元锦标赛·胜者再淘汰', kind: 'execute', rawInput: asArr(args.contenders).length + ' 路候选' }),
    }),

    defineTool({
      name: 'ultra_global_constraints',
      description: 'Pro 专用·全局约束求解：当多个局部结论互相牵扯、单独看都对、合起来却打架时调用。在 MAX 底座上把每条局部结论当成一个约束，联立求解、定位矛盾并把任何一处修正反向传播到整张结论网，只有整张网自洽才输出。',
      parameters: {
        situation: { type: 'string', required: true, description: '问题背景与目标。' },
        conclusions: { type: 'array', required: true, items: { type: 'string' }, description: '当前各条局部结论/设计决定。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            contradictions: { type: 'array', required: true, items: { type: 'string' } },
            propagations: { type: 'array', required: true, items: { type: 'string' } },
            consistent: { type: 'boolean', required: true },
            resolved: { type: 'string', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '全局约束求解通道暂不可用，请逐条手工核对一致性。' }] : [{ type: 'text', text: (v.contradictions.length ? '联立发现矛盾：\n' + v.contradictions.map((x) => '· ' + x).join('\n') + '\n反向传播修正：\n' + v.propagations.map((x) => '· ' + x).join('\n') : '整张结论网自洽，无矛盾。') + '\n' + (v.consistent ? '已全局一致。' : '仍有残余冲突。') + '\n' + v.resolved }],
      },
      async execute(args, exec) {
        const empty = { ran: false, contradictions: [], propagations: [], consistent: false, resolved: '' };
        const conclusions = asArr(args.conclusions).map((x) => clip(x, 800)).filter(Boolean).slice(0, 16);
        if (!conclusions.length) return { ...empty, resolved: '没有可联立的局部结论' };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.35, maxTokens: deps.strength().maxTokens,
          system: '你是全局约束求解器，把局部结论当约束联立，只输出严格 JSON，不放过任何隐藏矛盾。',
          prompt: [
            '把每条局部结论视为一个约束，放入同一个系统联立：①找出任意两条/多条合起来才暴露的矛盾（单独看都对、合起来冲突）；②对每处矛盾给出修正，并说明该修正会反向影响结论网中的哪些其它结论；③迭代到整张网自洽。',
            '【背景目标】\n' + clip(args.situation, 2000),
            '【局部结论】\n' + conclusions.map((c, i) => 'C' + (i + 1) + '：' + c).join('\n'),
            '只输出 JSON：{"contradictions":["矛盾点，注明涉及哪几条 C"],"propagations":["修正及其反向传播影响"],"consistent":布尔,"resolved":"联立求解后的全局一致结论"}',
          ].join('\n\n'),
        });
        if (!r.ok) return empty;
        appendTrace(exec, 'ultra/global-constraints', { n: conclusions.length, bad: asArr(r.json.contradictions).length });
        return {
          ran: true,
          contradictions: asArr(r.json.contradictions).map((x) => clip(x, 500)).slice(0, 12),
          propagations: asArr(r.json.propagations).map((x) => clip(x, 500)).slice(0, 12),
          consistent: !!r.json.consistent,
          resolved: clip(r.json.resolved, 2000),
        };
      },
      presentCall: (args) => ({ card: 'generic', title: '全局约束联立求解', kind: 'execute', rawInput: asArr(args.conclusions).length + ' 条约束' }),
    }),

    defineTool({
      name: 'ultra_adversarial_redteam',
      description: 'Pro 专用·终极红队：高风险/不能错的结论在交付前调用。在 MAX 底座上从前提、逻辑、边界反例、统计、表述框架五个方向同时施加最强攻击，替对手把能打的牌全打完，被攻破就带击杀理由回炉，直到核心结论在最大压力下存活并给出残余风险。',
      parameters: {
        claim: { type: 'string', required: true, description: '要被极限攻击的结论/方案。' },
        context: { type: 'string', description: '结论成立所依赖的背景与前提，可留空。' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ran: { type: 'boolean', required: true },
            attacks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { front: { type: 'string', required: true }, strike: { type: 'string', required: true }, lethal: { type: 'boolean', required: true } } } },
            reforged: { type: 'string', required: true },
            residualRisk: { type: 'string', required: true },
            survives: { type: 'boolean', required: true },
          },
        },
        render: (_a, v) => !v.ran ? [{ type: 'text', text: '终极红队通道暂不可用，请自行从反例方向攻击一遍。' }] : [{ type: 'text', text: '五维极限攻击：\n' + v.attacks.map((a) => `·[${a.front}${a.lethal ? '·致命' : ''}] ${a.strike}`).join('\n') + '\n' + (v.survives ? '核心结论在最大压力下存活。' : '核心结论曾被攻破，已回炉。') + '\n回炉后：' + v.reforged + '\n残余风险：' + v.residualRisk }],
      },
      async execute(args, exec) {
        const empty = { ran: false, attacks: [], reforged: '', residualRisk: '', survives: false };
        const r = await maxJson(deps.getLlm(), {
          ...routeOf(exec, deps), temperature: 0.5, maxTokens: deps.strength().maxTokens,
          system: '你是结论的终极红队，目标是尽力击杀而非安慰，只输出严格 JSON，攻击必须具体、可证伪。',
          prompt: [
            '从五个方向同时对下面结论施加最强攻击：前提（关键前提是否成立/有无隐藏假设）、逻辑（推理链是否断裂/偷换）、边界反例（找一个就能推翻的输入）、统计（样本/基线/相关因果/幸存者偏差）、框架（是否被提问方式与措辞带偏）。每条攻击判断是否致命；若存在致命攻击，给出回炉后能存活的重述。',
            '【背景前提】\n' + clip(args.context, 1500),
            '【待击杀结论】\n' + clip(args.claim, 3000),
            '只输出 JSON：{"attacks":[{"front":"攻击方向","strike":"具体攻击","lethal":布尔}],"reforged":"回炉后结论","residualRisk":"仍存在的残余风险","survives":核心结论回炉后是否在五维下存活}',
          ].filter(Boolean).join('\n\n'),
        });
        if (!r.ok) return empty;
        appendTrace(exec, 'ultra/adversarial-redteam', { lethal: asArr(r.json.attacks).filter((a) => a && a.lethal).length });
        return {
          ran: true,
          attacks: asArr(r.json.attacks).slice(0, 10).map((a) => ({ front: clip(a.front, 40), strike: clip(a.strike, 500), lethal: !!a.lethal })),
          reforged: clip(r.json.reforged, 2000), residualRisk: clip(r.json.residualRisk, 600), survives: !!r.json.survives,
        };
      },
      presentCall: (args) => ({ card: 'generic', title: '终极红队·五维极限攻击', kind: 'execute', rawInput: clip(args.claim, 60) }),
    }),
  ];
}

export default { proFlagshipCore };
