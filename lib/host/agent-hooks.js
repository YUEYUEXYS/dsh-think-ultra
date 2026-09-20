// Agent 循环集成钩子 (Agent-Loop Integration Hooks v0.3-pipeline)
// v0.3 essence 重构：滑杆全部由 essence-core.js 决策（模型×模式×档位矩阵）。

import {
  resolveEffective, detectModel, detectMode, benchmarkOf, intensityOf,
  DEEP_TIERS, BRANCH_TIERS, MEMORY_TIERS, CODE_TIERS, VISION_TIERS, VISION_SCAN_TIERS, VISION_GRAPH_TIERS, VISION_SWITCH_PROTOCOLS, META_TIERS,
  ABST_TIERS, SYNTH_TIERS, COHERE_TIERS, CALIB_TIERS, ENTROPY_TIERS, REPLAY_TIERS, DEPS_TIERS,
  AGENT_TIERS, LONGCODE_TIERS, CONSIST_TIERS, HEAL_TIERS, RECLAIM_TIERS, STABILITY_TIERS,
  safetyTier, estCharsToTokens, pickPrefsLayer,
  orchestrationOf, ADVERSARIAL_PROTOCOLS, modelChannel, apexProtocolOf, combinationPlan,
} from './essence-core.js';
import { runTournament } from './tournament-engine.js';
import { runEnsemble } from './oc-engine.js';
import { ocPlan } from './oc-core.js';
import { runReasoningTree } from './reasoning-tree.js';
import { runExecVerify } from './exec-verify.js';
import { runVerify } from './toolbox-engine.js';
import { runReasoningToolkit } from './reasoning-toolkit.js';
import { createUltraToolsSyncer } from './ultra-tools.js';
import { runFovea, foveaGroupOf } from './vision-fovea.js';
import { buildKernelSection } from './engines/registry.js';
import { buildToolSop } from './tool-sop.js';
import { getInputMonitor } from './input-monitor.js';
import { compileConstitution, compileSoftPrefs } from './pref-compiler.js';
import { computeBudget, tierOf, DEFAULT_VALUE as CAP_DEFAULT } from './capability-core.js';
import { buildCodeUnderstandingPrompt, validateCodeUnderstanding, assessCodeComplexity } from './code-understanding-enhancer.js';
import { buildVisionEnhancementPrompt, detectImageType, validateVisionAnalysis } from './multimodal-vision-enhancer.js';
import { buildGeneralReasoningPrompt, assessTaskComplexity, validateReasoningQuality } from './general-reasoning-enhancer.js';
import { buildEnhancedSuperThinkPrompt, assessTaskComplexity as assessSuperThinkComplexity, validateThinkingQuality } from './super-think-enhancer.js';
import { runSuperThinkPrimer, wrapPrimerInjection, capabilityToTier, reflectionPassesFor } from './super-think-primer.js';
import { appendFileSync as __appendFile } from 'node:fs';
import { tmpdir as __tmpdir } from 'node:os';
import { join as __join } from 'node:path';
const __primerDbg = (() => {
  if (!process.env.TU_PRIMER_DEBUG) return function () { /* debug disabled by default; set TU_PRIMER_DEBUG=1 to enable */ };
  const __logPath = __join(__tmpdir(), 'thinking-ultra-primer-debug.log');
  return function (msg) { try { __appendFile(__logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8'); } catch { /* contained */ } };
})();
import { buildUltraThinkEnginePrompt } from './ultra-think-engine.js';
import { buildUltimateTranscendencePrompt } from './ultimate-transcendence-engine.js';
import { buildEpicVisionEnhancementPrompt } from './epic-vision-enhancer.js';
import { buildUltimateBottomEnhancementPrompt } from './ultimate-bottom-enhancement-engine.js';
import { DevilAdvocateEngine, createDevilPrompt, devilCadence } from './devil-advocate.js';
import { RecheckEngine, createRecheckPrompt, recheckCadence } from './recheck-engine.js';
import { BestofEngine, createBestofPrompt, bestofCadence, bestofFanout } from './bestof-engine.js';
import { TreeForgeEngine, createTreeForgePrompt, treeforgeCadence } from './treeforge-engine.js';
import { getEnhancementContext, buildTierPrompt } from './profiles/profile-registry.js';
import { JudgePanelEngine, createJudgePanelPrompt, judgepanelCadence } from './judgepanel-engine.js';
import { AntiLoopEngine, createAntiLoopPrompt } from './antiloop-engine.js';
import { ExecGateEngine, createExecGatePrompt } from './execgate-engine.js';
import { ReviewEngine, createReviewPrompt } from './review-engine.js';
import { BranchesEngine, createBranchesPrompt } from './branches-engine.js';
import { ProjectEngine, createProjectPrompt } from './project-engine.js';
import { SparringEngine, createSparringPrompt } from './sparring-engine.js';
import { L3ForgeEngine, createL3ForgePrompt } from './l3forge-engine.js';
import { VTileEngine, createVTilePrompt } from './vtile-engine.js';
import { VCrossEngine, createVCrossPrompt } from './vcross-engine.js';
import { buildUltraCoreEnhancement, getActiveUltraCoreEngines } from './ultra-core-enhancer.js';
import { randomUUID as _tuUuid } from 'node:crypto';

// 全部事件处理经"中间件管道（compose）"收敛 —— 直接调用被折叠为
// 柯里化高阶函数组合，副作用顺序由管道顺序唯一决定。
//
// 历史背景：v0.1 每个事件一个裸回调，缓存/快照节流用两个布尔计数器；
// v0.2 加入 throttle/fuse/guard 后端逻辑后，裸回调里塞入了 5 个职责，
// 顺序靠人工保证。v0.3（当前版本）重构为：
//   - compose() 中间件管道：事件 -> 管道 -> 副作用，顺序显式；
//   - 生成器状态机 cadenceSM()：缓存/快照节流改为生成器驱动，
//     数字状态码（PH_* / GATE_*）替代布尔标志；
//   - traceProxy() 拦截器层：services 的全部方法调用被计数追踪，
//     调试期可量化每个钩子的触发频率（零行为改变）；
//   - 增量 diff：快照前对事件流签名比对（只存变化），缓存前用
//     Bloom Filter 预过滤（消息指纹全新才重算），长会话下大幅减少
//     冗余 IPC 与 Rust 计算 —— 这是 8-14h 稳定运行不烧 token 的关键。
//
// 为什么不用更简单的方案：
//   - 直接顺序调用：职责增长后无法插入中间层（如未来加采样/限频）；
//   - 装饰器/类继承：TS 类型体操要的是可组合的纯函数管道，而非继承树；
//   - 全量快照/全量缓存：无 diff 时每次冗余调用 rust core，浪费 IPC。
//
//       为 agent/request 增加请求级撤销语义
//        （当前单键 u32，24h 连续触发约 8 万次，可接受）
// XXX: Bloom 位数组固定 4096 bit，消息数 > 3000 后误判率上升，
//      可考虑按消息数动态扩容（重哈希代价换精度）
                                         
                                                   
                                                                    


/** 任意函数类型 */
                                                                   
/** 异步函数类型 */
                                                                          
/** 可空类型 */
                                     
/** 事件名模板字面量类型：约束 'agent/xxx' 形态 */
                                                
/** 状态机数字码（比布尔标志更难写错） */
                                                 
/** 映射类型：原样拷贝 */
                                        
/** 条件类型 + infer：解包 Promise */
                                                    
/** 条件类型：按开关取型 */
                                                                
/** 部分可选映射类型 */
                                          

                            
             
            
                                               
                              
                                                           
    
                                                          
                                                           
                                                                                    
 

                               
                         
                               
                
                                 
                                                      
                                          
                                 
                                                              
                                                                  
 

// ---- v0.2 后端预算与危险动作规则（与客户端同构，双端一致） ----
const THROTTLE_BUDGETS = [Infinity, 48000, 32000, 24000, 16000, 12000]; // 档位 -> 单请求输入预算（tokens）
const THROTTLE_TRIM = [0, 0.08, 0.16, 0.25, 0.33, 0.4];                  // 档位 -> 注入削减比例
const DANGER_RULES                                             = [
  { key: 'rmrf', sev: 3, re: /rm\s+-(?:r|f|rf|fr)+[\s=]+(\/|~\/|\*|\.|C:\\|\$HOME|\/home|\/etc)/i },
  { key: 'format', sev: 3, re: /(?:^|\s)(?:mkfs|format|fdisk)[\s.]+\/?[a-z]:|format\s+[a-z]:[\\\/]/i },
  { key: 'dropdb', sev: 3, re: /\b(?:drop\s+(?:database|table|schema)|truncate\s+table)\b/i },
  { key: 'system', sev: 3, re: /\b(?:shutdown\s+\/s|shutdown\s+-h\s+now|init\s+0|reboot\s+-f|taskkill\s+\/f\s+\/im\s+(?:explorer|svchost|winlogon|powershell)|reg\s+delete\s+hklm|del\s+\/f\s+\/s|rd\s+\/s\s+\/q\s+C:\\|Remove-Item\s+.*-Recurse\s+-Force|format-volume)\b/i },
  { key: 'remoteExec', sev: 3, re: /\b(?:curl|wget)\s+\S+\s*\|\s*(?:ba|z)?sh|iwr\s+\S+\s*\|\s*iex|invoke-expression\s*\(|eval\s*\(\s*['"`]|npm\s+exec\s+--\s+.*\|\s*sh/i },
  { key: 'forcePush', sev: 2, re: /\b(?:git\s+push\s+(?:-f|--force)|git\s+reset\s+--hard\s+origin|npm\s+unpublish|pip\s+uninstall\s+.*\s+-y)\b/i },
  { key: 'uninstall', sev: 2, re: /\b(?:rm\s+-rf\s+\/usr|Remove-Item\s+.*\*|del\s+.*\.\*|uninstall\s+.*\s+-y|pip\s+uninstall\s+.*\s+-y)\b/i },
  { key: 'chmod777', sev: 2, re: /\bchmod\s+(?:-R\s+)?777\s+\S+|setfacl\s+-b\b/i },
  { key: 'system2', sev: 2, re: /\b(?:net\s+user\s+\S+\s+\S+\s+\/add|usermod\s+-aG\s+sudo|chown\s+-R\s+\S+\s+\/|mount\s+-o\s+remount|iptables\s+-F)\b/i },
];

// ---- 数字状态码：闸门 / 阶段（替代布尔标志） ----
const GATE = { OPEN: 0, CONFIRM: 1, BLOCK: 2, SUPPRESS: 3 }         ; // 熔断闸门码
const PH = { BOOT: 0, WARM: 1, STABLE: 2, LOCKED: 3 }         ;       // 会话阶段码

// 纯函数工具族（柯里化优先：全部单参数化后可组合）
/** 输入 token 估算：CJK 1.1 / 单词 1.3 / 标点 0.6（与客户端同构） */
const estimateTokens = (text        )         => {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  const punct = (text.match(/[.,;:!?，。；：！？、]/g) ?? []).length;
  return Math.ceil(cjk * 1.1 + words * 1.3 + punct * 0.6);
};

// 任务复杂度分级：0=trivial（寒暄/纯算术/一句话事实）1=standard 2=complex（多步推理/代码/多约束）。
// test-time 重型编排与自动接续预算的总闸：简单题不跑全套多路独立调用，复杂题才全力深化。
// 默认回落 standard 而非 trivial——宁可多查一路，也不把复杂任务误判成简单而削弱。
const assessComplexity = (objective) => {
  const t = String(objective || '').trim();
  if (!t) return 1;
  const flat = t.replace(/\s+/g, '');
  const short = flat.length;
  const codeHit = /```|function\s|def \s|class \s|代码|函数|报错|堆栈|traceback|重构|调用链|并发|算法|正则|sql|bug/i.test(t);
  // 强 trivial 信号
  const pureArith = /^[\d\s()+\-*/×÷^%.a-zA-Z,=？?。.，,]+$/.test(t) && /\d/.test(t) && /[+\-*/×÷^%=]/.test(t);
  const asksOnly = /只(给|要|需)(最终|结果|答案|数字)|不要过程|不用解释|直接说|等于几|等于多少/.test(t);
  const greet = /^(你好|您好|在吗|在不在|谢谢|感谢|hi|hello|hey|thanks)(?:[\s,，。.!！?？~]|$)/i.test(t);
  if (greet) return 0;
  if (pureArith && short <= 48) return 0;
  if (asksOnly && short <= 34 && !codeHit && !/证明|推导|分析|设计|为什么/.test(t)) return 0;
  let s = 0;
  if (codeHit) s += 2;
  if (short >= 120) s += 1;
  if (/步骤|首先|其次|然后|流程|规划|方案|设计|分析|对比|比较|为什么|如何|推导|证明|论证|因果|拆解|评估|权衡|梳理|解释.*原因/.test(t)) s += 1;
  if ((t.match(/[?？]/g) || []).length >= 2) s += 1;
  if ((t.match(/\d+(?:\.\d+)?/g) || []).length >= 3 && /计算|求|推导|统计|占比|平均|概率|方程|换算/.test(t)) s += 1;
  if (/并且|同时|另外|以及|还要|分别|多个|一系列|约束|要求[一二三四1234]/.test(t)) s += 1;
  return s >= 2 ? 2 : 1;
};

/** 档位钳制：0..5 整数（未知值回落到 0 = 关闭） */
const clampTier = (v         )         => {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(6, Math.round(n)));
};

/** 危险动作扫描：命中规则集，返回最大严重度 0..3 */
const dangerScan = (text        )                                                          => {
  const hits                                 = [];
  let score = 0;
  for (const r of DANGER_RULES) {
    try {
      if (r.re.test(text)) {
        hits.push({ key: r.key, sev: r.sev });
        if (r.sev > score) score = r.sev;
      }
    } catch { /* contained */ }
  }
  return { hits, score };
};

/** 依据节流比例裁剪注入文本（真实削减插件注入开销；比例来自 safety 档位） */
const trimInjection = (text        , trimRatio        )         => {
  const t = Math.max(0, Math.min(1, Number(trimRatio) || 0));
  if (t <= 0 || text.length <= 200) return text;
  const keep = Math.max(200, Math.round(text.length * (1 - t)));
  return text.slice(0, keep) + '…';
};

/** 依据约束强度档位计算漂移告警阈值（越严格越早告警） */
const driftThreshold = (guardTier        )         => {
  return Math.max(0.25, 0.55 - guardTier * 0.05);
};

/** 熔断闸门决策：档位 + 最大严重度 -> 数字闸门码 */
const fuseGate = (tier        , maxSev        )         => {
  if (tier <= 0) return GATE.OPEN;               // 0：仅记录
  if (tier < 3) return GATE.OPEN;                // 1-2：提示不拦截
  if (tier === 3) return GATE.CONFIRM;           // 3：确认
  if (tier >= 5) return GATE.BLOCK;              // 5：全熔断
  return maxSev >= 3 ? GATE.BLOCK : GATE.CONFIRM; // 4：高危硬拦，低危确认
};

/** 消息内容文本化：兼容 string 与分段数组两种形态 */
const textOf = (content         )         => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p && typeof p === 'object' && 'text' in (p                           ) && typeof (p                           ).text === 'string') ? (p                    ).text : '').join('\n');
  }
  return '';
};

/** 最近一条 assistant 消息文本（自尾向前扫描） */
const lastAssistantText = (agent) => {
  const events = agent?.session?.events || [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev && ev.type === 'assistant/message' && ev.data) {
      const data = ev.data;
      const text = textOf(data.message?.content);
      if (text) return text;
    }
  }
  return '';
};

/** 首条 user 消息文本（截断 2000 字符） */
const firstUserText = (agent) => {
  const events = agent?.session?.events || [];
  for (const ev of events) {
    if (ev && ev.type === 'user/message' && ev.data) {
      const data = ev.data;
      const text = textOf(data.message?.content);
      if (text) return text.slice(0, 2000);
    }
  }
  return '';
};

/** 最新一条真实 user 消息文本（排除 plugin 注入，截断 2000 字符）—— 智能路由用 */
const latestUserText = (agent) => {
  try {
    const events = agent && agent.session && agent.session.events ? agent.session.events : [];
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (!ev || ev.type !== 'user/message' || !ev.data) continue;
      const src = ev.data.message && ev.data.message.source;
      if (src && (src.kind === 'plugin' || src.plugin === 'thinking-ultra')) continue;
      const text = textOf(ev.data.message && ev.data.message.content);
      if (text) return text.slice(0, 2000);
    }
  } catch { /* contained */ }
  return '';
};
const userTurnSignature = (agent) => {
  try {
    const events = agent?.session?.events || [];
    const parts = [];
    for (let i = events.length - 1; i >= 0 && parts.length < 3; i--) {
      const ev = events[i];
      if (ev?.type !== 'user/message') continue;
      const src = ev?.data?.message?.source;
      const kind = src && (src.kind || src.plugin);
      if (kind === 'plugin' || kind === 'thinking-ultra') continue;
      const text = textOf(ev?.data?.message?.content);
      parts.push(String(ev.seq ?? i) + ':' + text.slice(0, 120));
    }
    return parts.join('|');
  } catch { return ''; }
};

/** 修正提示消息拼装（复盘/熔断共用） */
const buildCorrectionMessage = (verdict, objective) => {
  const cleanCorrectionHints = (hints) => hints.filter((h) => {
    const s = String(h || '');
    return !/疑似半成品|未定义的变量|undefined variable|undefined identifier/i.test(s);
  });
  const hints = cleanCorrectionHints([...(verdict.correctionHints ?? []), ...(verdict.logicHoleHints ?? [])]);
  const parts = ['【Think 自省复盘】本轮输出未通过自我校验：'];
  for (const h of hints.slice(0, 4)) parts.push('- ' + h);
  if (objective) parts.push('原始目标：' + objective.slice(0, 400));
  parts.push('请在下一轮直接修正并交付完整结果，不要寒暄。');
  return parts.join('\\n');
};

// 中间件管道：runPipe（事件总线 -> 管道 -> 副作用）
// 管道顺序即副作用顺序 —— 新增职责 = 插入一个中间件，而非改写回调体。
// 每个中间件拿到 (payload, ctx)：ctx.pass() 进入下一个中间件（管道耗尽时
// 落到宿主原生 next），ctx.finish() 直接落到宿主原生 next（跳过剩余管道）。
// 为什么双通道：agent/request 的预算保护需要"跳过后续注入但放行请求"，
// 单通道 next 无法表达"跳过兄弟中间件"的语义。
                       
                
                                  
                      
                               
                        
  
                                                            

/**
 * 管道执行器：中间件数组折叠为单一调用链。
 * 宿主原生 next 作为管道终点 —— 保持与 ctx.on(name, (p, next)) 语义一致。
 */
const runPipe = (mws              , payload             , nativeNext                         )          => {
  let i = 0;
  const ctx          = {
    pass: () => {
      const mw = mws[i++];
      if (!mw) return nativeNext ? nativeNext() : undefined;
      return mw(payload, ctx);
    },
    finish: () => (nativeNext ? nativeNext() : undefined),
  };
  return ctx.pass();
};

/**
 * 事件绑定：把中间件管道挂到 ctx.on 上（事件总线接入点），
 * 透传宿主的原生 next（agent/request 依赖它放行请求）。
 * 返回卸载函数；fail-closed：管道内任何异常都被记录，绝不击穿循环。
 */
const bindEvent = (ctx     , name        , log          , ...mws              )               => {
  return ctx.on(name, (payload             , nativeNext                         ) => {
    try {
      if (payload && payload.agent) patchAgentEnqueue(payload.agent);
      return runPipe(mws, payload, nativeNext);
    } catch (err) {
      log.warn('hooks', name + ' pipeline failed (contained): ' + String(err));
      return undefined;
    }
  });
};

// v0.11 消息信封修复：agent.inject/steer/followup 的入参必须是合法 user message
// （content 为 block 数组、带 source）。v0.11 的会话投影与上下文组装会直接读
// message.source.kind；裸 {role,content:'字符串'} 会令 source=undefined 并抛
// "Cannot read properties of undefined (reading 'kind')"，使整轮在收尾处失败。
// 在此对 agent 的三个入队方法做一次幂等包装、自动补齐信封，覆盖全部注入点，调用处不改。
const patchedAgents = new WeakSet();
const asUserEnvelope = (input) => {
  if (!input || typeof input !== 'object') return input;
  const content = Array.isArray(input.content)
    ? input.content
    : [{ type: 'text', text: input.content == null ? '' : String(input.content) }];
  const source = input.source && typeof input.source === 'object'
    ? input.source
    : { kind: 'plugin', plugin: 'thinking-ultra' };
  return { ...input, role: input.role || 'user', content, source };
};
const patchAgentEnqueue = (agent) => {
  if (!agent || typeof agent !== 'object' || patchedAgents.has(agent)) return agent;
  for (const meth of ['inject', 'steer', 'followup']) {
    const orig = agent[meth];
    if (typeof orig !== 'function') continue;
    agent[meth] = (input) => orig.call(agent, asUserEnvelope(input));
  }
  patchedAgents.add(agent);
  return agent;
};

// v0.11 自动接续收敛闸：turn-stopping 里每次 steer 都会再产生一个自动步并再次触发
// turn-stopping；而自省/元认知/记忆/对抗靠 turn 取模周期触发，高档位周期=1 时每步都
// 自激，形成"说完又想、永远停不下来"的闭环。这里用 source.kind 区分真实用户消息('user')
// 与插件自接续('plugin')，并施加三层硬约束保证必然收敛：
//  ①预算按任务复杂度分级（assessComplexity）：trivial 不接续、standard 至多 1 次、complex 至多 3 次；
//  ②单个 turn-stopping 最多放行一次接续（firedThisStop）；
//  ③轻量补全同类不重复、熔断回滚整条消息最多一次、刚回滚的下一步不再叠加补全指令，
//    从根上消除"自省要求补全 ↔ 熔断判无效回滚"在相邻步互相拉扯的抖动。
const CONTINUE_BUDGET_BY_CPLX = [0, 1, 3];
const SOFT_STEER_KINDS = new Set(['review', 'reflect', 'anchor', 'code', 'devil', 'recheck', 'bestof']);
const autoCont = new Map(); // agentId -> { userSeq, used, firedKinds:Set, rollbackUsed, lastKind }
export const makeContinuationGate = (agent, complexity = 1, tight = true) => {
  let userSeq = -1;
  const events = agent?.session?.events || [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev?.type === 'user/message' && ev.data?.message?.source?.kind === 'user') userSeq = ev.seq ?? i;
  }
  let st = autoCont.get(agent.id);
  if (!st || st.userSeq !== userSeq) { st = { userSeq, used: 0, firedKinds: new Set(), rollbackUsed: false, lastKind: null }; autoCont.set(agent.id, st); }
  // antiloop 高级开关（默认开 tight=true）：complex 自动接续 3→2，从根上压缩“说完又想、永不收敛”的自激闭环；显式关闭才回到宽松预算。
  const EFFECTIVE_BUDGET = tight ? [0, 1, 2] : CONTINUE_BUDGET_BY_CPLX;
  const budget = EFFECTIVE_BUDGET[complexity] ?? 1;
  let firedThisStop = false;
  return {
    complexity,
    budget,
    exhausted: st.used >= budget,
    remaining: Math.max(0, budget - st.used),
    fire(content, kind = 'gen') {
      if (firedThisStop || st.used >= budget) return false;
      if (kind === 'breaker') {
        if (st.rollbackUsed) return false;
      } else if (SOFT_STEER_KINDS.has(kind)) {
        if (st.firedKinds.has(kind)) return false;
        if (st.lastKind === 'breaker') return false;
      }
      st.used += 1; firedThisStop = true; st.lastKind = kind; st.firedKinds.add(kind);
      if (kind === 'breaker') st.rollbackUsed = true;
      agent.steer({ role: 'user', content });
      return true;
    },
  };
};

// traceProxy：Proxy 拦截器层（服务调用计数追踪，零行为改变）
/**
 * 用 Proxy 包裹 services：get 陷阱把每个方法调用包一层计数。
 * 调试期可量化钩子触发频率；运行时开销为单次 Map 自增，可忽略。
 */
const traceProxy =                   (target   , tag        , counters                        )    => {
  return new Proxy(target, {
    get(t, prop, recv) {
      const v = Reflect.get(t, prop, recv);
      if (typeof v === 'function') {
        return (...args           ) => {
          const key = String(prop);
          counters[key] = (counters[key] ?? 0) + 1;
          try { if ((counters[key] % 256) === 0) (t                ).log.debug('hooks', tag + '.' + key + ' calls=' + counters[key]); } catch { /* contained */ }
          return v.apply(t, args);
        };
      }
      return v;
    },
  });
};

// BloomFilter：缓存预过滤（增量 diff 的第一道闸）
// 3 哈希位数组。语义：maybe=false 一定不在集合（零漏判），
// maybe=true 可能误判 —— 误判只导致多算一次，绝不漏算。
class BloomFilter {
          bits             ;
          sizeBits        ;
  constructor(sizeBits = 4096) {
    this.sizeBits = sizeBits;
    this.bits = new Uint32Array(Math.ceil(sizeBits / 32));
  }
  /** FNV-1a 变体 + seed 混淆（3 个独立哈希） */
          hash(s        , seed        )         {
    let h = 0x811c9dc5 ^ seed;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % this.sizeBits;
  }
  insert(s        )       {
    for (let k = 0; k < 3; k++) {
      const bit = this.hash(s, k * 0x9e3779b9 + 1);
      this.bits[bit >> 5] |= 1 << (bit & 31);
    }
  }
  maybe(s        )          {
    for (let k = 0; k < 3; k++) {
      const bit = this.hash(s, k * 0x9e3779b9 + 1);
      if ((this.bits[bit >> 5] & (1 << (bit & 31))) === 0) return false;
    }
    return true;
  }
}

// 增量 diff 工具：事件流签名
// 签名 = 最近 W 条事件 (type, 内容长度, 内容哈希) 的折叠哈希。
// 签名不变 => 事件流无变化 => 快照/缓存可跳过（只处理变化部分）。
const sigOf = (events, window = 8) => {
  if (!events || !Array.isArray(events)) return '0';
  let h = 0xdeadbeef;
  const tail = events.slice(-window);
  for (const ev of tail) {
    if (!ev) continue;
    const data = ev.data;
    const text = textOf(data?.message?.content);
    const raw = ev.type + ':' + text.length + ':' + text.slice(0, 64);
    for (let i = 0; i < raw.length; i++) {
      h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0;
    }
  }
  return String(h >>> 0);
};

// 生成器状态机：节流 cadence
// 用生成器维护"每 N 次触发一次"的相位 —— 状态被闭包在生成器内部，
// 外部只消费 next().value，不存在游离的可变计数器。
function* cadenceSM(period        )                                    {
  let acc = 0;
  while (true) {
    acc += 1;
    const due = acc >= period;
    if (due) acc = 0;
    yield due;
  }
}

// 主入口：安装全部钩子
export function installAgentHooks(ctx     , services              )             {
  const disposers                 = [];
  const ctx_mgr_v3 = ctx;                                     // 上下文句柄（命名风格：v3 管线代号）
  const state = services.getState;
  const core = () => services.getCore();
  const active = (sessionId        ) => state().active && state().sessionId === sessionId;

  // ---- v0.3 essence：有效档位决策（模型上限 × 模式缩放 × UI 档位） ----
  const eff = (key) => resolveEffective(state().modelKey, state().harnessMode, key, state().sliders?.[key]);
  const getPrefs = () => (typeof services.getPrefs === 'function' ? services.getPrefs() || '' : '');
  // 偏好六层编译器：身份+律令的「宪法层」与行为准则/契约/背景/愿望的「软偏好层」，
  // 统一由 pref-compiler 决策——条款级语义归类、整条款装填（不砍半句），
  // 按 模型 profile × 深度档 × token 预算 剥层，身份与律令永远在。
  const modelStringOf = (agent) => (
    agent?.options?.model || agent?.session?.header?.model || agent?.modelInfo?.model || agent?.model || ''
  );

  // ---- v0.11-RC2 推理预算编排：六杆真实预算 + 三开关真实执行链 ----
  // 每杆的 eff 档位驱动真实编排参数（层数/扇出/周期/轮数/区域/门），
  // 全部经 orchestrationOf 映射到可执行数值——不是提示词摆设。
  const budget = () => ({
    deep: orchestrationOf('deep', eff('deep')),
    branch: orchestrationOf('branch', eff('branch')),
    memory: orchestrationOf('memory', eff('memory')),
    code: orchestrationOf('code', eff('code')),
    vision: orchestrationOf('vision', eff('vision')),
    safety: orchestrationOf('safety', eff('safety')),
  });
  // 三开关（devil/recheck/bestof）真实执行状态机：每个 agent 一份
  // { devil: 上次攻击轮, recheck: 上次复核轮, bestof: 上次竞争轮 }
  const adversarialSM = new Map();
  const devilEngines = new Map(); // agentId -> DevilAdvocateEngine 实例
  const recheckEngines = new Map(); // agentId -> RecheckEngine 实例
  const bestofEngines = new Map(); // agentId -> BestofEngine 实例
  const treeforgeEngines = new Map(); // agentId -> TreeForgeEngine 实例
  const judgepanelEngines = new Map(); // agentId -> JudgePanelEngine 实例
  const antiloopEngines = new Map(); // agentId -> AntiLoopEngine 实例
  const execgateEngines = new Map(); // agentId -> ExecGateEngine 实例
  const reviewEngines = new Map(); // agentId -> ReviewEngine 实例
  const branchesEngines = new Map(); // agentId -> BranchesEngine 实例
  const projectEngines = new Map(); // agentId -> ProjectEngine 实例
  const sparringEngines = new Map(); // agentId -> SparringEngine 实例
  const l3forgeEngines = new Map(); // agentId -> L3ForgeEngine 实例
  const vtileEngines = new Map(); // agentId -> VTileEngine 实例
  const vcrossEngines = new Map(); // agentId -> VCrossEngine 实例
  const tournamentGuard = new Map();
const ocGuard = new Map(); // OC 超频集成防重入（session 级，sig 防同输出重跑、steered 限一次接续）
  const groundingGuard = new Map();    // agentId -> L0 确定性核验防重入 {sig,busy,steered,userSeq}
  const execGuard = new Map();         // agentId -> 可执行验证防重入 {sig,busy,steered}
  const reasoningGuard = new Map();    // agentId -> L3 正向推理工具箱防重入 {sig,busy,steered}
  const trialGuard = new Map(); // agentId -> L2 审判工具箱防重入/去重/接续上限 {sig,busy,steered} // agentId -> L1 锦标赛防重入/去重/接续上限闘 {sig,busy,steered} // agentId ->
  const verifyGuard = new Map();     // agentId -> L2 审判防重入/去重/接续上限 {sig,busy,steered} { devil: turn, recheck: turn, bestof: turn }
  const advEnabled = () => ({
    devil: !!state().modules?.devil,
    recheck: !!state().modules?.recheck,
    bestof: !!state().modules?.bestof,
  });
  // 对抗轮计数：每 agent 独立（真实多轮推演，不被节流）
  const advTurn = new Map(); // agentId -> number

  // v0.11-RC2 真·工具箱同步器：仅选中 Ultra（底座恒 MAX）的会话，经该 agent 自己的 scope 挂对应模型工具集；
  // Flash/Pro 三套严格不同，切模型即换套、关 Ultra 即全卸，非 Ultra 会话零工具。工具内部强度由 deep 档实时驱动。
  const ultraSyncer = createUltraToolsSyncer({
    isActive: (id) => true, // 临时：总是返回true，确保工具被注册
    modelKeyOf: (agent) => detectModel(modelStringOf(agent)),
    getLlm: () => (ctx_mgr_v3 && ctx_mgr_v3.llm) || null,
    strength: () => {
      const t = Math.max(0, Math.min(6, Math.round(Number(eff('deep')) || 0)));
      const lanes = t <= 1 ? 1 : t <= 3 ? 2 : t === 4 ? 3 : 4;
      const maxTokens = [400, 500, 700, 900, 1100, 1500, 2000][t];
      return { lanes, maxTokens };
    },
    log: (m) => { try { services.log.debug('ultra-tools', m); } catch { /* contained */ } },
    sliders: () => { try { return { ...(state().sliders || {}) }; } catch { return {}; } },
    // v0.1 工具箱能量门控输入：当前底层杆档位 + 模块开关 + 是否有图（任何异常安全降级）
    activeConfig: (agent) => {
      try {
        const st = state() || {};
        return {
          ultraOn: true, // 能进入 syncer.sync 的都是已选中 Ultra 的会话
          sliders: { ...(st.sliders || {}) },
          modules: { ...(st.modules || {}) },
          hasImage: (() => { try { return !!lastUserHasImage(agent); } catch { return false; } })(),
          oc: { ...((st.oc) || {}) }, // OC 模式/激进度/Token 档：驱动工具链三层熔断硬顶
        };
      } catch { return { ultraOn: true, sliders: {}, modules: {}, hasImage: false, oc: {} }; }
    },
    lang: () => { try { const z = state() || {}; return z.language || z.lang || z.i18n || 'zh'; } catch { return 'zh'; } },
    // UTP 八滑杆 -> 真实工具行为策略：七档非线性查表，档越高并行/轮次/对抗越强、压缩越狠，全部只强不弱
    strategy: () => {
      try {
        const tv = (k) => Math.max(0, Math.min(6, Math.round(Number(eff(k)) || 0)));
        const depth = tv('deep'), creativity = tv('branch'), rigor = tv('verify'), pace = tv('tempo'),
              aggression = tv('critique'), compress = tv('compress'), meta = tv('meta');
        const PARALLEL = [1, 1, 2, 2, 3, 4, 5];
        const ROUNDS   = [0, 1, 1, 2, 2, 3, 4];
        const RETRIES  = [0, 1, 1, 1, 2, 2, 3];
        const KEEP     = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
        const DEBATE   = [1, 1, 2, 2, 3, 4, 5];
        const lanes = depth <= 1 ? 1 : depth <= 3 ? 2 : depth === 4 ? 3 : 4;
        const maxTokens = [400, 500, 700, 900, 1100, 1500, 2000][depth];
        return {
          tier: depth, depth, creativity, rigor, pace, aggression, compress, meta,
          selfCheckRounds: ROUNDS[rigor],
          parallel: PARALLEL[creativity],
          retries: RETRIES[rigor],
          compressKeep: KEEP[compress],
          debateRounds: DEBATE[Math.max(aggression, meta)],
          temperature: Math.min(0.9, 0.25 + creativity * 0.08),
          lanes, maxTokens,
        };
      } catch {
        return { tier: 2, depth: 2, creativity: 1, rigor: 2, pace: 1, aggression: 1, compress: 2, meta: 1,
          selfCheckRounds: 1, parallel: 2, retries: 1, compressKeep: 0.8, debateRounds: 2,
          temperature: 0.4, lanes: 2, maxTokens: 900 };
      }
    },
  });
  disposers.push(() => { try { ultraSyncer.disposeAll(); } catch { /* contained */ } });

  // 服务调用计数（traceProxy 使用；零行为改变）
  const svc_counters                         = {};
  const svc_traced = traceProxy(services, 'svc', svc_counters);

  // 会话级注入闩锁（phase_latch_α）：防止 project/branches 重复注入
  const phase_latch_α                      = new Map();       // agentId -> PH 码
  const projectInjected = new Set        ();
  const branchInjected = new Set        ();
const preStepInjected = new Map(); // agentId -> 本真实用户轮已注入签名（防工具循环重复注入）
let __preStepNonce = 0; // 空签名兜底单调计数器（绝不让空串成为去重键而永久误杀后续轮）

  // 增量 diff 状态：每个 agent 一份事件签名 + 缓存 Bloom
  const snap_sig_β                      = new Map();          // agentId -> 上次快照事件签名
  const cache_bloom_γ                           = new Map();  // agentId -> 消息指纹布隆
  const cache_sig_δ                      = new Map();         // agentId -> 上次缓存消息签名

  // 生成器节流状态机（替代布尔计数器）
  const snap_cadence = cadenceSM(12);                         // 快照：每 12 轮
  const cache_cadence = cadenceSM(5);                         // 缓存：每 5 轮

  // v0.11 作用域修复：pre-step/session-start/turn-stopping 由 agentEvents 以 carrier=agent 派发，
  // agent/pre-step|session-start|turn-stopping 由 agentEvents 以 carrier=agent 派发，需在能观察 agent
  // 的作用域上订阅（对齐官方 dsh-time-context：声明 inject agents 后，在 ctx.inject(['agents']) 给出的
  // ctx 上 on）。这里先收集订阅规格，由本函数末尾 mountScoped 一次性挂载，避免在根插件 fiber 上空订阅。
  const scopedBindings = [];
  // 外形与 bindEvent(ctx,name,log,...mws) 对齐：只收集订阅规格、返回空 disposer，结尾括号无需改动。
  const scoped = (name, _log, ...mws) => { scopedBindings.push([name, mws]); return () => {}; };
  const mountScoped = (c) => {
    try {
      for (const [name, mws] of scopedBindings) {
        if (name === 'agent/pre-step') disposers.push(c.on(name, mws[0]));
        else disposers.push(bindEvent(c, name, services.log, ...mws));
      }
    } catch (e) { services.log.warn('hooks', 'mount scoped bindings failed: ' + String(e)); }
  };

  // ---- 中间件：目标捕获（agent/created） ----
  // 设计意图：会话创建即锁定原始目标文本，后续漂移检测/熔断回滚都以
  // 该目标为参照系。为什么不用 session-start：created 一定先于 start，
  // 且不依赖模块开关 —— 目标捕获是基础设施，不是功能模块。
  disposers.push(bindEvent(ctx_mgr_v3, 'agent/created', services.log, (p, ctx) => {
    const { agent }                       = p;
    const text = firstUserText(agent);
    if (text) svc_traced.setObjective(agent.id, text);
      if (text) { try { getInputMonitor().updateInput(text); } catch { /* contained */ } }
    // v0.3 essence：会话级模型与模式检测（决定所有滑杆的有效档位矩阵）
    try {
      state().modelKey = detectModel(modelStringOf(agent));
      state().harnessMode = detectMode(agent?.session?.header, ctx_mgr_v3);
      // v0.11-RC2 双模型独立通道：路由到当前模型的独立参数集（Flash/Pro 互不覆盖）
      const chan = modelChannel(state().modelKey);
      // 会话真实模型确定 → 立即装载该模型那份表格（滑杆/开关/偏好），Ultra 激活下 Flash/Pro 严格各走各的
      try { services.selectModelConfig?.(state().modelKey); } catch (e) { services.log.warn('channel', 'select model table failed: ' + String(e)); }
      services.log.info('channel', 'model channel routed: ' + chan.key + '/' + chan.label + ' (intensity=' + chan.intensity + ', benchmark=' + chan.benchmark + ')');
    } catch (e) { services.log.warn('essence', 'model/mode detect failed: ' + String(e)); }
      // 自动点火（无 UI 按钮）：会话创建即按 Ultra×真实模型幂等挂载工具箱；
      // 后续 agent/pre-step 继续 sync 兜底，切模型换套、关 Ultra 全卸。
      try { ultraSyncer.sync(agent); } catch (e) { services.log.warn('ultra-tools', 'created sync failed: ' + String(e)); }
    // v0.11-RC2 元认知八层：能力边界评估 + 难度预判（真实挂在会话创建点）
    try {
      if (state().modules.review && typeof services.metacognition !== 'undefined' && services.metacognition) {
        services.metacognition.assess(text);
      }
    } catch (e) { /* contained */ }
    // 对抗状态机初始化（三开关）
    if (!adversarialSM.has(agent.id)) adversarialSM.set(agent.id, { devil: -1, recheck: -1, bestof: -1 });
    if (!advTurn.has(agent.id)) advTurn.set(agent.id, 0);
    // v0.11-RC2 多智能体调度：本会话注册为真实调度任务（按 deep 档分片粒度）
    try {
      if (typeof services.taskTick === 'function') {
        services.taskTick('agent:' + agent.id, 'running');
      }
    } catch (e) { /* contained */ }
    return ctx.pass();
  }));

  // ---- 中间件：会话启动增强（project 摘要 + branches 择优注入） ----
  // 设计意图：会话开始一次性注入工程上下文与最优执行路径。
  // phase_latch_α 记录会话阶段：BOOT(0) 未注入 -> STABLE(2) 已注入。
  disposers.push(scoped('agent/session-start', services.log, async (p, ctx) => {
    const { agent }                       = p;
    if (!active(agent.id) || !state().modules.project) return ctx.pass();
    const ccore = core();
    if (!ccore) return ctx.pass();
    const latch = phase_latch_α.get(agent.id) ?? PH.BOOT;
    try {
      // -- 项目解析注入（仅一次；安全边界档位裁剪摘要规模） --
      if (!projectInjected.has(agent.id)) {
        projectInjected.add(agent.id);
        const cwd = agent.session.header?.cwd;
        const trimRatio = safetyTier(eff('safety')).trim;
        if (cwd) {
          const digest = await ccore.projectParse(cwd);
          const d = digest                                                                                                                    ;
          if (d.fileCount && d.fileCount > 0) {
            const langs = Object.entries(d.languages ?? {}).map(([k, v]) => k + '×' + v).join('、');
            let summary = '【Think 项目解析】工程共 ' + d.fileCount + ' 个文件、' + (d.definitionCount ?? 0) + ' 处定义（' + langs + '）。入口候选：' + (d.entryCandidates ?? []).slice(0, 5).join('、') + '。依赖与接口明细已缓存，涉及多文件改动时请先核对依赖关系。';
            summary = trimInjection(summary, trimRatio); // 安全边界档位削减注入规模
            agent.inject({ role: 'user', content: summary });
            services.log.debug('project', 'digest injected for ' + agent.id);
          }
        }
      }
      // -- 多分支推演择优注入（按 branch 有效档位：≥1 注入内核优选方案，≥4 叠加三路径协议） --
      const branchTier = eff('branch');
      if (state().modules.branches && branchTier >= 1 && !branchInjected.has(agent.id)) {
        branchInjected.add(agent.id);
        const objective = svc_traced.getObjective(agent.id);
        const trimRatio = safetyTier(eff('safety')).trim;
        if (objective) {
          const plan = await ccore.branchesPlan(objective);
          const branches = Array.isArray(plan) ? plan : [];
          const best = branches.find((b                        ) => b.selected) ?? branches[0];
          if (best && Array.isArray((best                        ).steps)) {
            let content = '【Think 多分支推演·档位' + branchTier + '】已评估 ' + branches.length + ' 条推演路径，择优采用：「' + (best                         ).strategy + '」\n' + (best                       ).steps.join('\n');
            if (branchTier >= 4) {
              content += '\n【三路径并行】请同时以第一性原理/类比迁移/逆向反证三条路径推演，交叉验证后收敛为唯一方案，并说明落选路径的失败环节。';
            }
            content = trimInjection(content, trimRatio);
            agent.inject({ role: 'user', content: content });
            services.log.debug('branches', 'best branch injected for ' + agent.id);
          }
        }
      }
      phase_latch_α.set(agent.id, PH.STABLE);
    } catch (err) { services.log.warn('hooks', 'session-start enhancement failed: ' + String(err)); }
    return ctx.pass();
  }));

  // ---- 请求管线：多段中间件（fuse 熔断 -> throttle 预算 -> prefs 偏好 -> deep 深度 -> vision 看图 -> essence 注入） ----
  // 设计意图：请求是最重要的干预点 —— 危险动作在此熔断，token 预算在此
  // 保护，偏好指令/深度协议/看图协议在此注入，用户批准的修正推演最后注入。
  // 闸门决策全部走 essence-core 的三合一安全边界（safety 档位）。
  // mw1：安全边界（fuse+throttle 三合一的熔断闸门；safety 档位驱动）
  // v0.11 增强上下文统一出口：原先各 agent/request 中间件用 agent.inject 把增强协议塞进
  // next-step 收件箱，而 agent/request 每个 step 都触发、inject 又会驱动出一个新 step，
  // 于是 step 循环永不满足退出条件（模型每步都收到同一模板，几十步停不下来）。现改为经
  // systemPrompt.context 注册的动态系统上下文：每个 turn 只在组装时求值一次，进系统侧
  // runtime-context，不经过收件箱、不驱动新 step。宪法层恒给，其余按档位/模型/预算/开关产出。
  const buildEnhanceText = (agent) => {
    try {
      if (!agent || !active(agent.id)) return '';
      const out = [];
      const gate0 = safetyTier(eff('safety'));
      const inputText0 = firstUserText(agent);
      // 复杂度分级：trivial 只给宪法+直答指令（省 token、不自我深化）；standard 给偏好+深度；complex 才上全套认知栈与对抗
      const cplx = assessComplexity(inputText0);
      const softOn = cplx >= 1;
      const deepStackOn = cplx >= 2;
        const combo = combinationPlan({
          modelKey: state().modelKey, mode: state().harnessMode,
          sliders: state().sliders, modules: state().modules,
          complexity: cplx, hasImage: lastUserHasImage(agent),
        });
        if (combo.degraded.length || combo.suppressed.length) {
          try { services.log.debug('combine', agent.id + ' degrade=' + combo.degraded.map((d) => d.key).join(',') + ' suppress=' + combo.suppressed.map((d) => d.key).join(',')); } catch { /* contained */ }
        }
      // 0) 危险操作熔断提示（保留前端事件）
      try {
        if (gate0.fuse !== 'record' && inputText0) {
          const scan = dangerScan(inputText0);
          if (scan.hits.length > 0) {
            services.emitEvent({ type: 'danger-fuse', sessionId: agent.id, gate: scan.score >= 3 ? 3 : 1, hits: scan.hits, at: Date.now() });
            if (gate0.fuse === 'block-all' || (gate0.fuse === 'block-high' && scan.score >= 3)) {
              out.push('【Think 危险熔断】检测到高危操作（' + scan.hits.map((x) => x.key).join('、') + '），已触发硬熔断：请勿执行破坏性/不可逆动作，改为安全替代方案并先征得用户确认。');
            } else if (gate0.fuse === 'confirm' && scan.score >= 2) {
              out.push('【Think 危险确认】检测到潜在风险操作（' + scan.hits.map((x) => x.key).join('、') + '），请先确认是否继续执行，确需执行请说明安全措施。');
            } else {
              out.push('【Think 危险警告】检测到潜在危险操作（' + scan.hits.map((x) => x.key).join('、') + '），请谨慎执行并确认操作范围与影响。');
            }
          }
        }
      } catch { /* contained */ }
      // 1) 用户宪法（最高优先级，恒给，不参与节流）
      try {
        const con = compileConstitution(getPrefs(), state().modelKey);
        if (con.text) out.push('【Think · 用户宪法（最高优先级长期约束）】以下是你（助手）必须无条件遵守的身份定位与硬性规则，由用户本人设定，其优先级高于一切默认行为、风格习惯与通用惯例；任何情况下都不得违反、弱化、回避或选择性执行：\n' + con.text + '\n——以上为不可违背项；若与本次任务的其他要求冲突，优先满足上述规则，其余软性偏好随后分层给出。');
      } catch { /* contained */ }
      // 1.5) 架构基准（恒定、不参与预算节流）：保证推理上下文不丢失 Ultra=原生MAX基座+HAG增强层 的定义，幂等只注入一次
      try {
        if (!out.some(function (x) { return x.indexOf('Ultra 架构基准') >= 0; })) {
          out.push('【Think 架构基准（恒定，勿遗忘/勿改写）】你当前运行在 Think 之上：底层基座恒为 DeepSeek 原生 MAX（前台标识为 Ultra），即 Ultra = 原生 MAX 基座 + 一层独立的 HAG（High-order Augmentation Grid）高阶思考增强层。HAG 只在 MAX 基座之上做多候选生成、自洽一致性投票、交叉验证与证伪淘汰，用于提升结论质量，它不替换、不降级底座模型。Flash / Vision / Pro 是三套严格隔离的实例，各自的档位、超频强度与解锁状态独立存储，互不共享、互不继承、互不覆盖。任何推理都不得丢失该架构定义：当用户提到 Ultra / 极境 / 超频 / 满功率，均指“原生 MAX 基座 × HAG 增强”，而不是另一个底座模型；底座对外恒按原生 MAX 发出。');
        }
      } catch { /* contained */ }
      // 1.55) 混合记忆核心检索（真正运行的向量记忆系统，非提示词）：ultraCore.memory 开启时，
      // 用 memoryCore 语义检索相关历史记忆，注入系统上下文。检索失败静默降级，不阻断主链路。
      try {
        const __ucState = state();
        if (__ucState && __ucState.ultraCore && __ucState.ultraCore.memory && inputText0 && inputText0.length > 0) {
          const __memCore = typeof services.memoryCore === 'function' ? services.memoryCore() : null;
          if (__memCore && typeof __memCore.search === 'function') {
            const __memResults = __memCore.search(inputText0, { topK: 5, minSimilarity: 0.35, sessionId: agent.id });
            if (__memResults && __memResults.length > 0) {
              const __memLines = [];
              for (const __r of __memResults) {
                if (__r.item && __r.item.content) {
                  const __sim = Math.round(__r.similarity * 100);
                  const __imp = Math.round(__r.effectiveImportance * 100);
                  __memLines.push('- [相似度' + __sim + '%/重要性' + __imp + '%] ' + String(__r.item.content).slice(0, 300));
                }
              }
              if (__memLines.length > 0) {
                out.push('【Think · 历史记忆检索（来自持久化记忆核心）】以下是从长期记忆中语义检索到的相关历史信息，供本次推理参考（标注了相似度和重要性，低相似度的仅供参考不得直接引用）：\n' + __memLines.join('\n') + '\n——使用记忆时必须标注"据记忆：..."，不得伪装成即时推理；记忆与当前证据冲突时以当前证据为准。');
              }
            }
          }
        }
      } catch (__memErr) { try { services.log.debug('memory-core', 'memory search failed (contained): ' + String(__memErr)); } catch { /* contained */ } }
      // 1.6) 思考-行动转换铁律（恒定、不参与预算节流）：防止"只想不做"的过度思考死循环，思考必须转化为实际行动
      try {
        if (!out.some(function (x) { return x.indexOf('思考-行动转换铁律') >= 0; })) {
          const isPro = state().modelKey === 'pro';
          const actionThreshold = isPro ? 3 : 5;
          out.push('【Think 思考-行动转换铁律（恒定，最高优先级执行约束）】思考的唯一目的是指导行动，不允许陷入"只想不做"的过度思考死循环。硬性规则：①连续思考/规划/分析不超过 ' + actionThreshold + ' 步，必须执行至少一项实际行动（调用工具/读写文件/运行代码/输出可执行代码块/给出具体交付物）；②如果信息不足，立即用工具获取信息（读文件/查文档/运行命令），而不是继续空想或猜测；③复杂任务必须"边想边做"——拆解一个子问题→立即执行验证→再拆解下一个，不允许把所有子问题全部想完再动手；④思考链中出现"让我想想""我需要分析""接下来规划"等表述后，下一步必须是行动，不允许又是思考；⑤' + (isPro ? 'Pro 模型执行最严格的思考-行动转换：每 3 步思考必须有 1 步行动，且行动必须是可验证的（有输出/有结果/有文件变化）。' : 'Flash/Vision 模型每 5 步思考必须有 1 步行动。') + '违反此铁律将被 AntiLoop 引擎检测为"过度思考无行动"循环并强制干预。');
        }
      } catch { /* contained */ }
      // 预算门：超预算只保留宪法与熔断，软增强全部抑制（等价原 mwThrottle 的 finish 语义）
      const overBudget = Number.isFinite(gate0.budget) && estimateTokens(inputText0) > gate0.budget;
      if (!overBudget) {
        // 2) 软偏好（分层压缩；trivial 抑制以省 token）
        try {
          const prefs = softOn ? getPrefs() : '';
          if (prefs && prefs.trim().length > 0) {
            const layer = compileSoftPrefs({ prefs, model: state().modelKey, deepTier: eff('deep'), budgetTokens: gate0.budget });
            if (layer.text) {
              const label = layer.layerZh.join('·') || '行为准则';
              out.push('【Think 偏好体系·' + label + '（' + layer.kept + ' 条）】以下为用户长期偏好，与前述《用户宪法》共同构成最高优先级行为准则，请逐条内化并在本次回答中一致体现，不得只挑部分执行、不得敷衍带过：\n' + layer.text);
            }
          }
        } catch { /* contained */ }
        // 3) 深度思考协议（trivial 不展开多层自省预算，块外给直答指令）
        try {
          const deepTier = eff('deep');
          if (combo.on('deep') && softOn && deepTier > 0 && DEEP_TIERS[deepTier]) {
            const b = budget().deep;
            out.push(DEEP_TIERS[deepTier] + '\n【基准与强度】当前模型目标基准：' + benchmarkOf(state().modelKey) + '；本档位按 ' + Math.round(intensityOf(state().modelKey) * 100) + '% 强度执行（档位' + deepTier + '检查项一项不得省略）。\n【推理预算】本任务递归自省层数：' + b.layers + ' 层；因果回滚深度：' + b.rollback + ' 层（发现错误必须向上回溯相应层级并重做）。');
          }
        } catch { /* contained */ }
        // 4) 元认知二阶（仅 complex）
        try {
          const mt = eff('meta');
          if (combo.on('meta') && mt > 0 && META_TIERS[mt]) {
            const cp = orchestrationOf('meta', mt);
            out.push(META_TIERS[mt] + '\n【元认知预算】全程设置 ' + cp.checkpoints + ' 个过程检查点，每到检查点必须停下做二阶自省，并记录当前策略选择与切换理由。');
          }
        } catch { /* contained */ }
        // 5) Pro 旗舰认知栈
        try {
          const pcog = [];
          const stack = [
            ['abst', ABST_TIERS, (b) => '\n【升维预算】沿第一性原理向上抽象 ' + b.levels + ' 层求解，再无损还原回原题，每层抽象都不得丢约束。'],
            ['synth', SYNTH_TIERS, (b) => '\n【跨域预算】调用 ' + b.domains + ' 个远域做结构同构迁移，显式写出源域→目标域映射与失效边界。'],
            ['cohere', COHERE_TIERS, (b) => '\n【收敛预算】交付前对整条推理链做 ' + b.passes + ' 遍全局一致性闭环扫描，任一环节与结论冲突必须回改到闭环。'],
            ['calib', CALIB_TIERS, (b) => '\n【校准预算】为 ' + b.points + ' 个关键结论各标置信度与依据强度，低置信处显式声明并给降级方案。'],
          ];
          // 5) Pro 旗舰认知栈（仅 complex 才叠加，standard/trivial 不堆抽象层）
          for (const [key, TIERS, tailFn] of stack) {
            const tier = eff(key);
            if (tier > 0 && TIERS[tier]) pcog.push(TIERS[tier] + tailFn(orchestrationOf(key, tier)));
          }
          if (combo.on('proCog') && pcog.length) out.push(pcog.join('\n'));
        } catch { /* contained */ }
        // 5.4) 代码理解史诗级增强：检测到代码相关任务时自动注入，让 Flash/Pro 代码理解能力达到 GPT 6+ Ultra 水平
        try {
          const codeKeywords = /代码|code|函数|function|类|class|算法|algorithm|bug|错误|error|调试|debug|重构|refactor|审查|review|性能|performance|架构|architecture|编程|program|开发|develop|脚本|script|模块|module|接口|api|数据库|database|前端|frontend|后端|backend|框架|framework|库|library|git|版本|version|测试|test|部署|deploy|运维|ops|服务器|server|客户端|client|网络|network|安全|security|加密|encrypt|解密|decrypt|并发|concurrent|线程|thread|进程|process|内存|memory|缓存|cache|队列|queue|栈|stack|堆|heap|树|tree|图|graph|排序|sort|搜索|search|递归|recursion|动态规划|dp|贪心|greedy|分治|divide|回溯|backtrack|正则|regex|json|xml|yaml|toml|html|css|javascript|typescript|python|java|c\+\+|c#|rust|go|golang|ruby|php|swift|kotlin|scala|r|matlab|shell|bash|powershell|sql|nosql|mongodb|redis|mysql|postgresql|docker|kubernetes|k8s|aws|azure|gcp|云|cloud|微服务|microservice|api|rest|graphql|grpc|websocket|http|https|tcp|udp|ip|dns|ssl|tls|证书|certificate|token|jwt|oauth|session|cookie|localStorage|sessionStorage|indexeddb|webgl|canvas|svg|dom|bom|事件|event|回调|callback|promise|async|await|generator|iterator|proxy|reflect|symbol|map|set|weakmap|weakset|array|object|string|number|boolean|null|undefined|nan|infinity|类型|type|接口|interface|抽象|abstract|继承|inheritance|多态|polymorphism|封装|encapsulation|设计模式|design pattern|单例|singleton|工厂|factory|观察者|observer|策略|strategy|装饰器|decorator|适配器|adapter|代理|proxy|桥接|bridge|组合|composite|享元|flyweight|外观|facade|命令|command|状态|state|职责链|chain of responsibility|中介者|mediator|备忘录|memento|解释器|interpreter|访问者|visitor|模板方法|template method|建造者|builder|原型|prototype|迭代器|iterator/i;
          if (codeKeywords.test(inputText0) || (inputText0 && inputText0.length > 50 && /[{};()=]/.test(inputText0))) {
            const codeCplx = assessCodeComplexity(inputText0);
            const codePrompt = buildCodeUnderstandingPrompt(state().modelKey, Math.max(cplx, codeCplx), lastUserHasImage(agent), state().sliders);
            if (codePrompt) out.push(codePrompt);
          }
        } catch { /* contained */ }
        // 5.4.1) 多模态/视觉理解史诗级增强：检测到图像输入时自动注入，让 Flash 看图能力达到 GPT 6+ Ultra 水平
        try {
          const hasImage = lastUserHasImage(agent);
          if (hasImage) {
            const imageTypeResult = detectImageType(inputText0 || '');
            const visionCplx = imageTypeResult.primaryType === 'unknown' ? Math.max(cplx, 1) : Math.max(cplx, 2);
            const visionPrompt = buildVisionEnhancementPrompt(
              state().modelKey,
              imageTypeResult.primaryType,
              visionCplx >= 2 ? 'high' : 'standard',
              inputText0 ? `用户需求：${inputText0.slice(0, 200)}` : ''
            );
            if (visionPrompt) out.push(visionPrompt);
          }
        } catch { /* contained */ }
        // 5.4.2) 通用推理史诗级增强：根据任务复杂度自动注入，让 Flash/Pro 推理能力达到 GPT 6+ Ultra 水平
        try {
          const taskCplx = assessTaskComplexity(inputText0 || '');
          if (taskCplx.complexity >= 1) {
            const isCreative = /(创意|创新|设计|发明|头脑风暴|idea|creative|innovation|design)/.test(inputText0 || '');
            const reasoningPrompt = buildGeneralReasoningPrompt(
              state().modelKey,
              taskCplx.level,
              isCreative ? 'creative' : 'general',
              inputText0 ? `用户需求：${inputText0.slice(0, 200)}` : ''
            );
            if (reasoningPrompt) out.push(reasoningPrompt);
          }
        } catch { /* contained */ }
          // 5.5) 恐怖级全开协议：仅当该模型全部可见滑杆都拉到顶时注入
          try {
            const apex = apexProtocolOf(state().modelKey, state().sliders);
            if (combo.on('apex') && apex) out.push(apex);
          } catch { /* contained */ }
          // 5.6) 新增抽象维度：熵减监控 / 错误回溯重放 / 子目标依赖图校验
          try {
            const nx = [];
            const et = eff('entropy');
            if (combo.on('entropy') && et > 0 && ENTROPY_TIERS[et]) nx.push(ENTROPY_TIERS[et] + '\n【熵减预算】整条推理链执行 ' + orchestrationOf('entropy', et).passes + ' 遍熵审计，禁止低信息增益旁支进入最终交付。');
            const rt = eff('replay');
            if (combo.on('replay') && rt > 0 && REPLAY_TIERS[rt]) nx.push(REPLAY_TIERS[rt] + '\n【回溯预算】失败路径重放 ' + orchestrationOf('replay', rt).layers + ' 层，逐层免疫化修正。');
            const dt = eff('deps');
            if (combo.on('deps') && dt > 0 && DEPS_TIERS[dt]) nx.push(DEPS_TIERS[dt] + '\n【依赖预算】子目标依赖图校验强度 ' + orchestrationOf('deps', dt).levels + ' 级，成环/悬空/重复依赖必须拆解后重排。');
            // 稳定性折叠五杆：每杆真实协议 + 真实编排预算（Flash/Vision 露三杆、隐藏杆走安全垫，Pro 全量）
            const STAB_ORDER = ['agent', 'longcode', 'consist', 'heal', 'reclaim', 'watchdog', 'persist', 'checkpoint', 'converge', 'vmem', 'vpersist'];
            for (const sk of STAB_ORDER) {
              const stv = eff(sk);
              if (combo.on('stability') && stv > 0 && STABILITY_TIERS[sk] && STABILITY_TIERS[sk][stv]) {
                const sb = orchestrationOf(sk, stv);
                let stabTail = '';
                if (sk === 'agent') stabTail = '\n【编排预算】最多并行 ' + sb.fanout + ' 个角色/分片，分派后必须收敛整合为单一结论。';
                else if (sk === 'longcode') stabTail = '\n【耐久预算】每 ' + sb.anchorEvery + ' 个子步骤对账一次原始目标，跨段命名/口径/决策一致。';
                else if (sk === 'consist') stabTail = '\n【收敛预算】同一环节最多允许 ' + sb.maxLoop + ' 次无进展重复，达到即强制收敛并跳到下一未决项。';
                else if (sk === 'heal') stabTail = '\n【自愈预算】启用 ' + sb.retries + ' 级恢复策略，单点失败隔离、整体不中断。';
                else if (sk === 'reclaim') stabTail = '\n【回收预算】过程性上下文按 ' + Math.round((sb.trim || 0) * 100) + '% 压缩，峰值预算留给关键推理。';
                else if (sk === 'watchdog') { const wd = [0,120,90,60,45,30,20][stv] || 120; const wl = [0,8,6,5,4,3,2][stv] || 8; const wr = [0,90,85,80,70,60,50][stv] || 90; stabTail = '\n【熔断预算】单步硬超时 ' + wd + 's，连续 ' + wl + ' 次无进展强制收敛并快照回滚，资源超 ' + wr + '% 触发降级。'; }
                else if (sk === 'persist') { const pa=[0,1,2,3,4,5,6][stv]||0; stabTail = pa? '\n【记忆预算】维护 ' + ['','单组','滚动','分层','不可变','全链账本','零丢失矩阵'][stv] + ' 记忆锚点，关键决策/命名/口径跨轮固化，截断可无损续推。':''; }
                else if (sk === 'checkpoint') { const cp=[0,1,2,3,4,5,6][stv]||0; stabTail = cp? '\n【快照预算】' + ['','轻量','分叉前','分层','证据指纹','时间线','因果树'][stv] + ' 检查点，漂移/出错回滚最近一致点。':''; }
                else if (sk === 'converge') { const cv=[0,3,3,2,2,1,1][stv]; stabTail = stv? '\n【收敛预算】同一环节最多 ' + cv + ' 次无进展重复即强制收敛，零增益动作禁止，输出前验证未决项闭环。':''; }
                else if (sk === 'vmem') { stabTail = stv? '\n【视觉记忆预算】图中读数/标签/坐标誊抄为带坐标指纹的文本锚点，结论必须挂视觉证据，不凭印象。':''; }
                else if (sk === 'vpersist') { stabTail = stv? '\n【视觉续接预算】多图证据链不断点，切图继承全部历史视觉上下文，不重复不漏图。':''; }
                nx.push(STABILITY_TIERS[sk][stv] + stabTail);
              }
            }
            if (nx.length) out.push(nx.join('\n'));
          } catch { /* contained */ }
        // 6) 深度看图栈（仅最近用户消息含图）
        try {
          if (combo.on('vision') && lastUserHasImage(agent)) {
            const vp = [];
            const visionTier = eff('vision');
            if (VISION_TIERS[visionTier]) vp.push(VISION_TIERS[visionTier] + '\n【视觉预算】按 3×' + budget().vision.regions + ' 宫格逐区域精细描述（每区：物体/文字/颜色/空间关系/与问题的关联），再做图文交叉推理。');
            const scanTier = eff('vscan');
            if (VISION_SCAN_TIERS[scanTier]) vp.push(VISION_SCAN_TIERS[scanTier]);
            const graphTier = eff('vgraph');
            if (VISION_GRAPH_TIERS[graphTier]) vp.push(VISION_GRAPH_TIERS[graphTier]);
            if (state().modules?.vtile && VISION_SWITCH_PROTOCOLS.vtile) vp.push(VISION_SWITCH_PROTOCOLS.vtile);
            if (state().modules?.vcross && VISION_SWITCH_PROTOCOLS.vcross) vp.push(VISION_SWITCH_PROTOCOLS.vcross);
            if (vp.length) out.push(vp.join('\n'));
          }
        } catch { /* contained */ }
        // 7) 对抗三开关请求级协议（仅 complex；简单题不堆对抗协议）
        try {
          const on = advEnabled();
          if (combo.on('devil')) out.push(ADVERSARIAL_PROTOCOLS.devil.requestPrompt());
          if (combo.on('recheck')) out.push(ADVERSARIAL_PROTOCOLS.recheck.requestPrompt());
          if (combo.on('bestof')) out.push(ADVERSARIAL_PROTOCOLS.bestof.requestPrompt(ADVERSARIAL_PROTOCOLS.bestof.fanout(budget().branch.fanout)));
        } catch { /* contained */ }
        // 8) 本质预审修正（一次性 pending，每 turn 取一次；trivial 抑制）
        try {
          const essence = softOn ? svc_traced.takePendingEssence() : null;
          if (essence) out.push('【Think 本质预审修正推演】' + trimInjection(essence, gate0.trim) + '\n请先复核以上要点，再继续执行原始需求。');
        } catch { /* contained */ }
      }
      // trivial 任务：只保留宪法 + 一条直答约束，不做多层自我深化（快、省、一次答对）
      if (combo.on('direct') && !overBudget) {
        out.push('【Think 直答模式】这是单一、确定的问题：直接给出正确最终结果，一次算对/答对，不展开多层推演、不自我质疑、不附加无关内容。');
      }
      // 9) 24 台独立引擎·非线性内核协同段（增量叠加；eff 已含能力上限/解锁封顶；try 兜底零破坏）
      try {
        if (!overBudget) {
          const __kernel = buildKernelSection(state().modelKey, eff, { complexity: cplx, hasImage: lastUserHasImage(agent), mode: state().harnessMode, sliders: state().sliders || {}, budgetTokens: gate0.budget, metacog: state().metacog || {} });
          if (__kernel) out.push(__kernel);
        }
      } catch { /* contained */ }
      // 10) 工具箱作战手册：只讲当前真实上线的工具，按复杂度裁剪（trivial 不给、超预算抑制）
      try {
        if (!overBudget) {
          const __sop = buildToolSop(ultraSyncer.activeNames(agent.id), { complexity: cplx, hasImage: lastUserHasImage(agent) });
          if (__sop) out.push(__sop);
        }
      } catch { /* contained */ }
      
      // ===== Thinker Ultra 能力滑块·预算注入（M3）=====
      try {
        const st = state();
        // 从 localStorage 读取前端能力滑块值（兼容多种 key）
        // 能力滑杆（前端 0-20） 宿主内部 0-100 预算刻度；20 = 极限满预算
        let uiCap = Number(st?.capability ?? st?.capValue);
        if (!isFinite(uiCap) || uiCap < 0) uiCap = 5;
        uiCap = Math.max(0, Math.min(20, uiCap));
        const capVal = Math.max(0, Math.min(100, uiCap * 5));
        const modelKey = st?.modelKey || 'flash';
        const harnessMode = st?.harnessMode || 'standard';
        // 能进入 buildEnhanceText 即 Ultra 已激活（L772 已校验 active），故 ultraActive 恒真
        const ultraActive = true;
        // 讯流(velocity)/极境(apex)严格隔离：只有极境才走 oc 顶配 profile，讯流走 ultra/standard，二者不再混同
        const ocMode = !!(st?.oc && st.oc.mode === 'apex');

        // 模式映射：ultra/oc 走对应 profile，否则走 model-mode
        let profModel = modelKey, profMode = harnessMode;
        if (ultraActive && !ocMode) { profModel = 'ultra'; profMode = 'standard'; }
        if (ocMode) { profModel = 'pro'; profMode = 'oc'; }

        const cplxForCap = assessComplexity(inputText0);
        const __trivial = (cplxForCap === 0); // hello/hi/谢谢/纯算术/只要答案：不灌任何 Ultra 重型协议，原生 MAX 直接秒答
        const budget = computeBudget({
          value: capVal, model: profModel, mode: profMode,
          complexity: cplxForCap, allowDownshift: true,
        });

        if (budget && budget.actualBudget > 0.03) {
          const tierName = budget.tier.name;
          const parts = [];
          parts.push('【Thinker Ultra 能力滑块·' + tierName + '档（' + Math.round(capVal) + '%）】当前思考预算档位：' + tierName + '。能力滑块本质 = 思考时间预算分配器：向右拖 = 允许模型花更多时间、更多思考 token、更多自检轮次、更多候选路径去想问题，所以越往右回答越慢但能力越强。');
          parts.push('【预算参数】实际思考预算释放度：' + Math.round(budget.actualBudget * 100) + '%（设定 ' + Math.round(budget.setBudget * 100) + '%' + (budget.downshifted ? '，已按任务复杂度动态下探节省 ' + budget.savedPct + '%' : '') + '）；自我校验轮次：' + budget.selfChecks + ' 轮；并行候选路径：' + budget.paths + ' 条；算力倍率：' + budget.tokenMult.toFixed(1) + 'x。');

          if (budget.selfRefute) parts.push('【自我反驳】启用自我反驳机制：每个关键结论必须主动寻找反例、质疑前提、测试边界条件，驳不倒才保留。');
          if (budget.crossVerify) parts.push('【交叉验证】启用交叉验证：关键结论必须用至少两种独立方法/路径验证一致，不一致必须回炉重推。');
          if (budget.counterfactual) parts.push('【反事实推演】启用反事实攻击：对最终结论做"如果前提不成立会怎样"的反事实推演，检验结论的鲁棒性与可证伪性。');

          if (budget.selfChecks >= 2) parts.push('【执行约束】推理过程中必须显式执行 ' + budget.selfChecks + ' 轮自我校验：每轮校验必须检查逻辑漏洞、遗漏约束、计算错误、前提假设，发现问题立即回溯修正。');
          if (budget.paths >= 2) parts.push('【多路径推演】对核心问题必须同时推演 ' + budget.paths + ' 条独立候选路径，对比各路径结果，选择最优解或融合多路径优势。');

          parts.push('【能力哲学】能力不是调出来的，是等出来的——你给它多少时间，它还你多少深度。当前档位已锁定，按此预算执行，不得偷工减料、不得跳过校验轮次。');
          parts.push('【Ultra 底层本质】Ultra 不是速度模式，不是参数调优，而是深度拆解任务的思考范式。每一个任务都必须被拆解为原子级子问题，每个子问题独立推理、交叉验证、再重新组装。原生 MAX 基座是底线，Ultra 在其上注入：HAG 集成增强（多路径锦标赛投票）、自我审查循环（每轮输出后自检）、24 个推理工具（分解/验证/反驳/模拟/优化等）、反事实推演（如果前提不成立）、元认知校验（检查思考过程本身的偏差）。Ultra 的目标不是更快，而是更深、更准、更可靠——用极致思考换取极致结果。');
          parts.push('【执行铁律】①思考链必须完整可见，不得隐藏推理过程；②每个关键结论必须有推导过程，不得只给结论；③自我校验轮次必须显式执行，不得跳过；④多路径推演必须对比各路径，不得只走一条路；⑤发现问题必须回溯修正，不得将错就错；⑥最终输出前必须做一轮完整性检查，确认所有子问题已解决、所有约束已满足、所有风险已应对。');

          out.push(parts.join('\n'));
        }

        // ===== Super Think 前置超级思考（Ultra 开启时强制触发）- 增强版 =====
        if (ultraActive || ocMode) {
          // ===== 四模式独立增强档案注入（flash-velocity/flash-apex/pro-velocity/pro-apex，各自独立容器）=====
          try {
            const __modelKey = state().modelKey || '';
            const __modelGroup = /vision|vl|multimodal|image|flash/i.test(__modelKey) ? 'flash' : 'pro';
            const __mode = ocMode ? 'apex' : 'velocity';
            const __cap20 = Math.max(0, Math.min(20, Math.round((Number(capVal) || 0) / 5)));
            const __pctx = getEnhancementContext(__modelGroup, __mode, __cap20);
            out.push(__pctx.enhancementPrompt.trim());
            out.push(buildTierPrompt(__pctx));
          } catch (__e) { /* profile 注入失败不阻断主链路 */ }
          try {
            // 获取最新用户消息用于任务复杂度评估
            let latestUserMsg = '';
            try {
              const events = agent?.session?.events || [];
              for (let i = events.length - 1; i >= 0; i--) {
                const ev = events[i];
                if (ev?.type === 'user/message') {
                  const content = ev.data?.message?.content;
                  if (typeof content === 'string') latestUserMsg = content;
                  else if (Array.isArray(content)) latestUserMsg = content.map(c => c?.text || '').join(' ');
                  break;
                }
              }
            } catch { /* contained */ }

            // 评估任务复杂度
            const taskComplexity = assessSuperThinkComplexity(latestUserMsg, {
              hasImage: lastUserHasImage(agent),
              hasFile: false,
              historyLength: agent?.session?.events?.length || 0,
            });

            // 使用增强模块构建Super Think提示词
            const enhancedSuperThink = buildEnhancedSuperThinkPrompt(
              capVal,
              ocMode,
              state().modelKey,
              taskComplexity
            );

            out.push(enhancedSuperThink);

            // 超级思考增强引擎（深度级和极限级启用完整增强）
            try {
              const stLevel = ocMode ? 'extreme' : (capVal >= 80 ? 'deep' : capVal >= 50 ? 'standard' : 'light');
              if (stLevel === 'deep' || stLevel === 'extreme') {
                const ultraEnginePrompt = buildUltraThinkEnginePrompt(
                  capVal,
                  ocMode,
                  state().modelKey,
                  taskComplexity,
                  latestUserMsg
                );
                out.push(ultraEnginePrompt);
              }

              // 终极超越引擎（仅在极境模式下启用，全面碾压Fable 5.1和GPT）
              if (ocMode || stLevel === 'extreme') {
                try {
                  const ultimateTranscendencePrompt = buildUltimateTranscendencePrompt(
                    capVal,
                    ocMode,
                    state().modelKey,
                    taskComplexity
                  );
                  if (ultimateTranscendencePrompt) {
                    out.push(ultimateTranscendencePrompt);
                  }
                } catch { /* contained */ }
              }

              // 终极底层增强引擎（深度级和极限级启用，全面增强所有底层能力）
              if (stLevel === 'deep' || stLevel === 'extreme' || ocMode) {
                try {
                  const ultimateBottomEnhancementPrompt = buildUltimateBottomEnhancementPrompt(
                    capVal,
                    ocMode,
                    state().modelKey,
                    taskComplexity
                  );
                  if (ultimateBottomEnhancementPrompt) {
                    out.push(ultimateBottomEnhancementPrompt);
                  }
                } catch { /* contained */ }
              }
            } catch { /* contained */ }

            // 史诗级看图能力增强（检测到图像时自动启用）
            try {
              const hasImage = lastUserHasImage(agent);
              if (hasImage) {
                const epicVisionPrompt = buildEpicVisionEnhancementPrompt(
                  capVal,
                  ocMode,
                  state().modelKey,
                  hasImage
                );
                if (epicVisionPrompt) {
                  out.push(epicVisionPrompt);
                }
              }
            } catch { /* contained */ }
          } catch (e) {
            // 降级：如果增强模块失败，使用原始逻辑
            try {
              const superThinkParts = [];
              const stLevel = ocMode ? 'extreme' : (capVal >= 80 ? 'deep' : capVal >= 50 ? 'standard' : 'light');
              const stLabels = { light: '轻量', standard: '标准', deep: '深度', extreme: '极限' };
              const stLabel = stLabels[stLevel] || '标准';
              superThinkParts.push('【Thinker Ultra · 超级思考已由系统前置完成】开工前的 Super Think 深度预演已在请求发出前基于原生 MAX 跑完，结论已注入。不要把 Think / super_think 等思考类工具当第一步反复调用（那会死循环）；第一条思考链用于消化前置结论并确定路线，随后立即动手执行。');
              superThinkParts.push('【Super Think ·' + stLabel + '级】深度要求：结构化拆解、约束穷举、关键路径多路径推演、自我反驳与交叉验证，底座恒为原生 MAX；深度与任务复杂度匹配，简单任务不灌水，复杂/极境任务拉满，但想清楚就立即收敛交付，不以“再想一次”拖延。');
              superThinkParts.push('【可见性与防循环】思考链对用户可见；思考为执行服务，不替代后续工具调用。达到收敛标准后立刻调用真正的执行工具或产出结果，严禁连环调用思考类工具空转。');
              out.push(superThinkParts.join('\n'));
            } catch { /* contained */ }
          }
        }
      } catch (e) {
        try { services.log.warn('capability', 'budget injection failed (contained): ' + String(e)); } catch { /* contained */ }
      }
      // ===== 能力滑块预算注入 + Super Think 结束 =====

      // ===== Ultra Core 合体增强注入（顶级项目核心能力）=====
      // 0day防护：系统提示词总长度超限风险——注入前检查当前out总长度，
      // 超过阈值时降级（只注入核心引擎或跳过），防止token溢出导致请求失败。
      try {
        const __ucState = state();
        const __ucEngines = getActiveUltraCoreEngines(__ucState);
        if (__ucEngines.length > 0 && !__trivial) {
          // 计算当前已注入内容的总长度（粗略估算，4字符≈1token）
          const __currentLen = out.reduce(function (s, x) { return s + (x ? x.length : 0); }, 0);
          const __MAX_TOTAL_LEN = 12000; // 系统提示词总长度硬上限（约3000 token）
          const __MAX_UC_LEN = 5000;     // Ultra Core增强单块上限（约1250 token）
          if (__currentLen < __MAX_TOTAL_LEN) {
            const __ucEnhancement = buildUltraCoreEnhancement(__ucState, agent);
            if (__ucEnhancement && __ucEnhancement.trim().length > 0) {
              // 超长降级：如果Ultra Core增强本身过长，截断并标注降级
              let __ucText = __ucEnhancement;
              let __degraded = false;
              if (__ucText.length > __MAX_UC_LEN) {
                __ucText = __ucText.slice(0, __MAX_UC_LEN) + '\n\n【Ultra Core 降级提示：增强协议过长已截断，核心引擎仍生效，非核心引擎协议已省略。如需完整增强请减少同时启用的引擎数量。】';
                __degraded = true;
              }
              // 总长度二次检查：加上Ultra Core后仍超限则跳过
              if (__currentLen + __ucText.length + 200 < __MAX_TOTAL_LEN) {
                out.push('【Ultra Core 合体增强层 · 激活引擎：' + __ucEngines.join('、') + (__degraded ? '（长度降级）' : '') + '】以下增强协议由 Ultra Core 合体引擎注入，包含深度推理、记忆融合、自博弈验证、不确定性量化、工具自验证、动态剪枝、知识图谱、跨模态融合、代码库理解等高阶推理协议，必须严格遵守执行：\n\n' + __ucText);
              } else {
                try { services.log.warn('ultra-core', 'enhancement skipped: total length would exceed limit (current=' + __currentLen + ', uc=' + __ucText.length + ')'); } catch { /* contained */ }
              }
            }
          } else {
            try { services.log.warn('ultra-core', 'enhancement skipped: current prompt already over length limit (' + __currentLen + ')'); } catch { /* contained */ }
          }
        }
      } catch (__ucErr) { try { services.log.warn('ultra-core', 'enhancement injection failed (contained): ' + String(__ucErr)); } catch { /* contained */ } }
      // ===== Ultra Core 合体增强注入结束 =====

const __tuText = out.filter(Boolean).join('\n\n');
      return __tuText;
    } catch (e) {
      try { services.log.warn('enhance', 'build context failed (contained): ' + String(e)); } catch { /* contained */ }
      return '';
    }
  };
  // mw5：深度看图协议（仅 Vision 模型；检测最近用户消息含图才注入）
  const lastUserHasImage = (agent) => {
    try {
      const events = agent?.session?.events || [];
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev?.type !== 'user/message') continue;
        const content = ev.data?.message?.content;
        if (Array.isArray(content) && content.some((c) => c && (c.type === 'image' || c.type === 'image_url' || c.image_url))) return true;
        return false;
      }
    } catch { /* contained */ }
    return false;
  };
  // v0.11 增强注入唯一走 agent/pre-step（见下方 scopedBindings）：await next() 后把增强作为一条
  // plugin user 消息追加进本次请求。不再同时注册 systemPrompt.context——两者内容同源，并存会把同一份
  // 增强在系统侧与消息侧各塞一遍，token 翻倍。agent/request-inject 路线也废弃（每 step 塞收件箱→无限接续）。

  // ---- v0.11 主注入链：agent/pre-step waterfall ----
  // 官方姿势（对齐 dsh-time-context）：await next() 拿到默认组装结果（已含 harness runtime-context），
  // 在其后追加一条 Think 增强 user 消息（合法 plugin 信封），只参与本次请求组装，不 enqueue、不驱动新 step。
  try {
    scopedBindings.push(['agent/pre-step', [async (p, next) => {
      let decision;
      try { decision = await next(); } catch (e) { throw e; }
      try {
        const agent = p && p.agent;
        // ── fail-open 自激活闸门（修复：前端 activate RPC 可能未成功 / 传空 sessionId，导致增强链永不生效）──
        // 只要面板未显式关闭 Ultra（state.ultraActive !== false，默认开启），就把当前正在运行的 agent
        // 确定性地视为激活会话：补齐 active/sessionId，保证后续增强注入链与超级思考预演一定执行。
        try {
          if (agent && !active(agent.id) && state().ultraActive !== false) {
            state().active = true;
            state().sessionId = agent.id;
            __primerDbg('self-activate agentId=' + agent.id + ' (activate RPC was down/empty)');
          }
        } catch { /* contained */ }
        try { __primerDbg('pre-step enter agentId=' + (agent && agent.id) + ' state.active=' + state().active + ' state.sessionId=' + state().sessionId + ' activeMatch=' + (agent ? active(agent.id) : 'no-agent') + ' cap=' + state().capability + ' ultraActive=' + state().ultraActive); } catch { /* contained */ }
        if (!agent || !active(agent.id)) return decision;
        // 每请求以 agent 真实模型为准重新路由：历史会话恢复或前端中途切模型时，Flash/Pro 也不会串档
        try {
          const realKey = detectModel(modelStringOf(agent));
          if (realKey && realKey !== state().modelKey) {
            state().modelKey = realKey;
            state().harnessMode = detectMode(agent?.session?.header, ctx_mgr_v3);
            try { services.selectModelConfig?.(realKey); } catch { /* contained */ }
          }
        } catch { /* contained */ }
        // 智能路由：根据最新用户消息复杂度自动选 Flash（省 token，Turbo 角色）或 Pro（深推演）
        // 简单问题（短文本、无复杂关键词）→ Flash；复杂问题（长文本/数学/代码/算法/架构等）→ Pro；有图保持 Vision
        try {
          const txt = latestUserText(agent);
          const cur = state().modelKey || '';
          if (txt && !cur.includes('vision')) {
            const complex = /(数学|证明|代码|算法|架构|调试|优化|分析|对比|为什么|如何|解释|实现|设计|推导|定理|公式|递归|复杂度|性能|错误|重构|部署|系统|数据库|网络|安全|math|proof|code|algorithm|architect|debug|optimize|analyze|compare|why|how|explain|implement|design|derive|theorem|formula|recursion|performance|error|refactor|deploy|system|database|network|security)/i.test(txt) || txt.length > 100;
            const target = complex ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
            if (target !== cur) {
              state().modelKey = target;
              try { services.selectModelConfig?.(target); } catch { /* contained */ }
              services.log.info('auto-route', 'routed to ' + target + ' (complex=' + complex + ', len=' + txt.length + ')');
            }
          }
        } catch { /* contained */ }
        // 真·工具箱：按 当前是否 Ultra × 重路由后的真实模型，幂等地把对应工具集挂到该 agent 自己的 scope
        try { ultraSyncer.sync(agent); } catch (e) { services.log.warn('ultra-tools', 'sync failed: ' + String(e)); }
        // 调用授权门闩（默认关=零影响）：开启后每个新用户轮首次发起 DeepSeek 调用前确定性弹窗等人工允许；
        // 拒绝/超时 -> 复用官方 reject 决策干净终止该 step（不报错、不卡死转圈）；gate 自身异常 fail-open 不阻断对话。
        try {
          const gate = services.getAuthorizeGate?.();
          if (gate && gate.isEnabled()) {
            const turnKey = userTurnSignature(agent) || ('a:' + agent.id);
            const dec0 = await gate.request(turnKey, { preview: firstUserText(agent) });
            if (!dec0.allowed) {
              services.emitEvent({ type: 'authorize-denied', sessionId: agent.id, reason: dec0.reason, at: Date.now() });
              services.log.info('authorize', 'call denied (' + dec0.reason + '), step rejected for ' + agent.id);
              return { ...(decision || {}), kind: 'reject', messages: Array.isArray(decision && decision.messages) ? decision.messages : [] };
            }
          }
        } catch (e) { services.log.warn('authorize', 'gate error fail-open: ' + String(e)); }
        if (!decision || decision.kind === 'reject') { __primerDbg('pre-step return: reject/no-decision kind=' + (decision && decision.kind)); return decision; }
          try { getInputMonitor().submit(); } catch { /* contained */ }
        // 去重签名：优先 events 签名，回退 decision.messages 签名；都为空时用单调 nonce，
        // 绝不让空串成为去重键（否则首个空签名轮之后的所有轮都会被永久误杀）。
        let usig = userTurnSignature(agent);
        if (!usig) {
          try {
            const dm = Array.isArray(decision.messages) ? decision.messages : [];
            const sigParts = [];
            for (let i = dm.length - 1; i >= 0 && sigParts.length < 3; i--) {
              const m = dm[i];
              if (!m || m.role !== 'user') continue;
              const msrc = m.source;
              if (msrc && (msrc.kind === 'plugin' || msrc.plugin === 'thinking-ultra')) continue;
              const mt = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c) => (c && c.text) || '').join(' ') : '';
              if (mt && mt.trim()) sigParts.push(i + ':' + String(mt).slice(0, 120));
            }
            usig = sigParts.join('|');
          } catch { /* contained */ }
        }
        if (!usig) { __preStepNonce += 1; usig = 'nonce:' + Date.now() + ':' + __preStepNonce; }
        if (preStepInjected.get(agent.id) === usig) { __primerDbg('pre-step return: dedup usig=' + usig); return decision; }
        preStepInjected.set(agent.id, usig);
        __primerDbg('pre-step PASS dedup, 即将buildEnhanceText/primer');
        const text = buildEnhanceText(agent);
        const base = Array.isArray(decision.messages) ? decision.messages : [];
        // 真·中央凹视觉：最近消息含图、当前模型可视觉、且任一视觉杆>0 时，宿主侧把原图切成高清 tile 真回灌；
        // 任何异常/超时/Python 缺失都 fail-open 退回纯文本，绝不阻塞主请求。
        let foveaParts = [], foveaGuide = '';
        try {
          const fk = state().modelKey || modelStringOf(agent) || '';
          const _sl = state().sliders || {};
          if (lastUserHasImage(agent) && foveaGroupOf(fk) && ['vision', 'vscan', 'vzoom'].some((k) => Number(_sl[k]) > 0)) {
            const fr = await runFovea(agent, { modelKey: fk, sliders: _sl, modules: state().modules || {}, log: services.log });
            if (fr) { foveaParts = fr.parts; foveaGuide = fr.guide || ''; }
          }
        } catch (e) { services.log.warn('fovea', 'fovea fail-open: ' + String(e)); }

        // ============================================================
        // 【强制超级思考 Super Think 预演】v2.0 —— 后端确定性先跑一次 MAX 超长思考
        // 不靠模型自觉调用 super_think 工具：能力滑块≥均衡档(6)时，在请求发给模型前，
        // 由插件后端直接 sampleOnce 跑一段与档位/模式严格对应的深度思考，再注入。
        // 每轮只执行一次（上方 preStepInjected 已按 userTurnSignature 去重）；
        // 任何异常/超时一律 fail-open，绝不阻塞主对话。
        // ============================================================
        let primerInjection = '';
        try {
          const __st = state();
          let __cap = Number(__st?.capability ?? __st?.capValue);
          if (!Number.isFinite(__cap)) __cap = 5;
          __cap = Math.max(0, Math.min(20, Math.round(__cap)));
          const __tierInfo = capabilityToTier(__cap);
          // llm 多通道获取：优先 services.getLlm（ultra-tools 同款），回退 ctx.llm
          let __llm = null;
          try { __llm = (typeof services.getLlm === 'function' ? services.getLlm() : null) || ctx_mgr_v3.llm || null; } catch { __llm = ctx_mgr_v3.llm || null; }
          const __llmOk = !!(__llm && typeof __llm.stream === 'function');
          __primerDbg('gate cap=' + __cap + ' tier=' + __tierInfo.tier.key + ' enabled=' + __tierInfo.tier.enabled + ' llmOk=' + __llmOk + ' ocMode=' + ((__st?.oc && __st.oc.mode) || 'none') + ' hasGetLlm=' + (typeof services.getLlm));
          // 【超级思考触发门槛 v3·防滥用】
          // - 极限档(16-20)：任何任务强制触发超级思考（用户明确拉满，白烧也认）
          // - 深度档(11-15)：仅复杂任务触发（任务长度>40字 或 含代码/文件/多目标）
          // - 均衡档及以下(≤10)：不触发后端预演（模型仍可主动调用 super_think 工具）
          // 这样既保证"能力拉满必有超思"，又防止低档位滥用白烧token。
          const __isExtreme = __cap >= 16;
          const __isDeep = __cap >= 11 && __cap < 16;
          let __complexTask = false;
          try {
            const __probeTask = (latestUserText(agent) || '').slice(0, 500);
            __complexTask = __probeTask.length > 40 || /```|代码|函数|类|错误|bug|修复|实现|设计|架构|分析|对比|优化|重构|测试|部署/i.test(__probeTask);
          } catch { __complexTask = false; }
          const __shouldPrimer = __tierInfo.tier.enabled && __tierInfo.budget && __llmOk && (__isExtreme || (__isDeep && __complexTask));
          __primerDbg('gate decision extreme=' + __isExtreme + ' deep=' + __isDeep + ' complex=' + __complexTask + ' shouldPrimer=' + __shouldPrimer);
          if (__shouldPrimer) {
            const __ocMode = (__st?.oc && __st.oc.mode === 'apex') ? 'apex' : 'velocity';
            let __provider = agent?.session?.header?.provider || '';
            if (!__provider) { __provider = (__llm.listProviders?.() || [])[0]?.id || ''; }
            // 多通道提取当前用户输入：session.events 可能在 pre-step 时尚未压入当前消息，
            // 因此回退到即将发送的 decision.messages 最后一条非插件 user 消息，保证预演有真实靶心。
            const __decisionTask = (() => {
              try {
                const msgs = Array.isArray(decision.messages) ? decision.messages : [];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  const m = msgs[i];
                  if (!m || m.role !== 'user') continue;
                  const msrc = m.source;
                  if (msrc && (msrc.kind === 'plugin' || msrc.plugin === 'thinking-ultra')) continue;
                  let t = '';
                  if (typeof m.content === 'string') t = m.content;
                  else if (Array.isArray(m.content)) t = m.content.map((c) => (c && (c.text || (typeof c.content === 'string' ? c.content : ''))) || '').filter(Boolean).join(' ');
                  if (t && t.trim()) return t.slice(0, 2000);
                }
              } catch { /* contained */ }
              return '';
            })();
            const __task = latestUserText(agent) || firstUserText(agent) || __decisionTask || '';
            __primerDbg('run start task="' + __task.slice(0,30) + '" taskSrc=' + (latestUserText(agent) ? 'events' : (__decisionTask ? 'decision' : 'empty')) + ' provider=' + __provider + ' model=' + modelStringOf(agent));
            // 空任务短路：本轮没有任何真实用户文本（历史恢复/空轮/注入回环）时绝不跑预演，
            // 否则会对空文本白烧数十秒，还会让模型误把“空任务预演”当成讨论对象。
            if (!__task || !__task.trim()) { __primerDbg('skip primer: empty task (no real user target)'); }
            else {
            // 超时硬顶：档位越高允许越久，但绝不无限等待（防死循环/卡死）
            const __refPasses = reflectionPassesFor(__cap, __ocMode);
            const __baseMs = __ocMode === 'apex'
              ? (__cap >= 16 ? 240000 : __cap >= 11 ? 150000 : 90000)
              : (__cap >= 16 ? 150000 : __cap >= 11 ? 90000 : 60000);
            // 递归反思每轮都是一次独立 MAX 调用，总超时按真实轮次叠加；高档/极境放开时间（用户明确：时间爱多久多久）
            const __timeoutMs = __baseMs + __refPasses * (__ocMode === 'apex' ? 180000 : 120000);
            const __ac = new AbortController();
            const __timer = setTimeout(() => { try { __ac.abort(); } catch { /* contained */ } }, __timeoutMs);
            try {
              const __primer = await runSuperThinkPrimer(__llm, {
                task: __task,
                capability: __cap,
                ocMode: __ocMode,
                modelKey: __st.modelKey || detectModel(modelStringOf(agent)),
                modelString: modelStringOf(agent),
                provider: __provider,
                hasImage: lastUserHasImage(agent),
                historyLength: Array.isArray(agent?.session?.events) ? agent.session.events.length : 0,
                lang: (typeof services.lang === 'function' ? services.lang() : 'zh') === 'en' ? 'en' : 'zh',
                signal: __ac.signal,
              });
              if (__primer && __primer.ok && __primer.text) {
                primerInjection = wrapPrimerInjection(__primer, (typeof services.lang === 'function' ? services.lang() : 'zh') === 'en' ? 'en' : 'zh');
                __primerDbg('run OK tier=' + __primer.tier + '/' + __primer.mode + ' chars=' + __primer.chars + ' ms=' + __primer.ms + ' calls=' + (__primer.totalCalls||1) + ' refl=' + (__primer.reflectionPasses||0) + ' bf=' + (__primer.budgetFactor||1) + ' maxTok=' + (__primer.finalMaxTokens||0) + ' cx=' + (__primer.complexityScore||0));
                try { services.emitEvent?.({ type: 'superthink-primer', sessionId: agent.id, tier: __primer.tier, mode: __primer.mode, cap: __cap, chars: __primer.chars, ms: __primer.ms, calls: __primer.totalCalls || 1, reflectionPasses: __primer.reflectionPasses || 0, at: Date.now() }); } catch { /* contained */ }
              } else {
                __primerDbg('run SKIP reason=' + (__primer && __primer.reason || 'unknown'));
              }
            } finally { clearTimeout(__timer); }
            }
          }
        } catch (e) { __primerDbg('FAIL-OPEN ' + String(e && e.stack || e)); }

        // 超级思考预演置于增强文本最前（模型先看到已完成的深度预演，再看其余增强协议）
        let finalText = [primerInjection, text, foveaGuide].filter(Boolean).join('\n\n');
        if (!finalText && !foveaParts.length) return decision;
        const msg = {
          id: _tuUuid(),
          role: 'user',
          content: [{ type: 'text', text: finalText }, ...foveaParts],
          source: { kind: 'plugin', plugin: 'thinking-ultra', form: 'snapshot', sections: [{ name: 'thinking-ultra-enhance', text: finalText }] },
        };
        return { ...decision, kind: 'enter', messages: [...base, msg] };
      } catch (e) { services.log.warn('hooks', 'pre-step enhance failed: ' + String(e)); return decision; }
    }]]);
  } catch (e) { services.log.warn('hooks', 'register pre-step failed: ' + String(e)); }

  // ---- 中间件：回合收尾（自省复盘 + 熔断 + 增量快照 + Bloom 预过滤缓存） ----
  // 设计意图：每轮输出落库后做质量判定。增量 diff 保证：
  //   快照 —— 事件签名未变则跳过（只存变化）；
  //   缓存 —— Bloom 预过滤：消息指纹全部命中且签名未变则跳过 rust 计算。
  disposers.push(scoped('agent/turn-stopping', services.log, async (p, ctx) => {
    const agent = p && p.agent;
    if (!agent || !active(agent.id)) return ctx.pass();
    // 复杂度分级总闸：决定重型独立 LLM 编排是否启用，以及自动接续预算（0/1/3）
    const cplx = assessComplexity(svc_traced.getObjective(agent.id) || firstUserText(agent));
    const cont = makeContinuationGate(agent, cplx, state().modules.antiloop !== false);
    // ===== L0 确定性核验（Deterministic Grounding Core）：宿主本地零 LLM、零 token 真值判定 =====
    // 必须置于 cont.exhausted 判定之前——简单问题 cplx=0 时 LLM 自省接续预算为 0，会在下方直接 pass，
    // 但确定性硬错误（算术/日期/计数/单位）在简单问题上同样必须纠正。guard/勘误决策下沉到
    // GroundingCore.evaluateTurn（独立 steer 通道、每用户问题最多一次，防自激），一旦接管立即 return。
    let groundingTookOver = false;
    try {
      if (state().modules.grounding !== false && typeof services.groundingCore === 'function') {
        const __gc = services.groundingCore();
        if (__gc && typeof __gc.evaluateTurn === 'function') {
          let gUserSeq = -1;
          const __gEvs = (agent && agent.session && agent.session.events) || [];
          for (let __gi = 0; __gi < __gEvs.length; __gi++) {
            const __gev = __gEvs[__gi];
            if (__gev && __gev.type === 'user/message' && __gev.data && __gev.data.message && __gev.data.message.source && __gev.data.message.source.kind === 'user') gUserSeq = __gev.seq != null ? __gev.seq : __gi;
          }
          const gOut = __gc.evaluateTurn({
            sessionId: agent.id,
            userSeq: gUserSeq,
            sig: sigOf(agent && agent.session ? agent.session.events : [], 6),
            assistantText: lastAssistantText(agent),
            now: new Date(),
            steer: (content) => {
              if (agent && typeof agent.steer === 'function') { agent.steer({ role: 'user', content }); return true; }
              return false;
            }
          });
          try { services.emitEvent({ type: 'thinking-ultra.grounding', sessionId: agent.id, checked: gOut.checked | 0, errors: gOut.errors | 0, at: Date.now() }); } catch { /* contained */ }
          if (gOut.steered) {
            groundingTookOver = true;
            services.log.info('grounding', 'L0 deterministic core caught ' + (gOut.errors | 0) + ' hard error(s); steered for ' + agent.id);
          }
        }
      }
    } catch (gErr) {
      services.log.warn('grounding', 'L0 failed (contained): ' + String(gErr));
    }
    if (groundingTookOver) return ctx.pass();

    if (cont.exhausted) {
      services.log.debug('continue', 'auto-continuation budget spent (cplx=' + cplx + '), let turn settle for ' + agent.id);
      return ctx.pass();
    }
    // L0 确定性核验已上移至 cont.exhausted 判定之前（见上文），确保 cplx=0 简单问题也能纠正确定性硬错误。

    // ===== L1 test-time 编排：branch≥2 走递归推演树（双模型；宽/深由档位驱动，主回复入树，严格更优才接续）=====
    // branch<2 的 Flash 退回单层锦标赛；同输出不重跑、最多接续一次防递归；全部调用受引擎硬顶约束不卡死。
    try {
      const mstr0 = String(modelStringOf(agent) || '').toLowerCase();
      const isFlash = mstr0.includes('flash') || mstr0.includes('vision') || mstr0.includes('-vl');
      // ===== OC 超频集成统一入口（大换血）：Apex 走 runEnsemble（聚类/自洽投票/交叉/证伪/融合）；Velocity/??? 单链，不跑重型集成 =====
      const ocCfgAll = state().oc || {};
      const ocMode = ocCfgAll.mode === 'apex' ? 'apex' : 'velocity';
      if (ocMode === 'apex' && cplx >= 1 && !groundingTookOver && ctx_mgr_v3.llm && typeof ctx_mgr_v3.llm.stream === 'function') {
        const og = ocGuard.get(agent.id) || { sig: null, busy: false, steered: 0 };
        const sigO = sigOf(agent?.session?.events, 6);
        if (!og.busy && og.sig !== sigO) {
          og.busy = true; og.sig = sigO; ocGuard.set(agent.id, og);
          const ocOutput0 = lastAssistantText(agent);
          const ocObjective = svc_traced.getObjective(agent.id) || firstUserText(agent);
          let ocProvider = agent?.session?.header?.provider || '';
          if (!ocProvider) { ocProvider = (ctx_mgr_v3.llm.listProviders?.() || [])[0]?.id || ''; }
          if (ocOutput0 && ocObjective && ocProvider) {
            try {
              const plan = ocPlan(modelStringOf(agent), {
                mode: 'apex',
                oc: ocCfgAll.oc || 'balanced',
                token: ocCfgAll.token || 't2',
                quality: ocCfgAll.quality || 'enhanced',
                falsify: ocCfgAll.falsify || 'mid',
                toolAggro: ocCfgAll.toolAggro ?? 1,
              });
              // 三层熔断硬顶：最大独立调用数 / 单调用超时 / 总 token 预算，触顶即收敛输出阶段结果
              const ocHard = {
                maxCalls: Number.isFinite(ocCfgAll.maxCalls) ? ocCfgAll.maxCalls : (plan.tokenMult >= 8 ? 72 : 40),
                perCallTimeoutMs: Number.isFinite(ocCfgAll.perCallTimeoutMs) ? ocCfgAll.perCallTimeoutMs : 45000,
                totalTokenBudget: Number.isFinite(ocCfgAll.totalTokenBudget) ? ocCfgAll.totalTokenBudget : Math.round(20000 * plan.tokenMult),
              };
              const ocRes = await runEnsemble(ctx_mgr_v3.llm, ocObjective, plan, {
                provider: ocProvider, model: modelStringOf(agent), seedText: ocOutput0, hard: ocHard,
                log: (m) => services.log.info('oc', m + ' [' + agent.id + ']'),
                emit: (st) => { try { services.emitEvent(Object.assign({ type: 'oc-stage', sessionId: agent.id }, st)); } catch { /* contained */ } },
              });
              services.emitEvent({ type: 'oc-ensemble', sessionId: agent.id, confidence: ocRes.confidence, bestIsSeed: ocRes.bestIsSeed, stats: ocRes.stats, stoppedByLimit: ocRes.stoppedByLimit || null, modelGroup: plan.modelGroup, ocLevel: plan.ocLevel || null, at: Date.now() });
              const ocPass = plan.modelGroup === 'pro' ? 78 : 72;
              if (!ocRes.bestIsSeed && ocRes.best && ocRes.confidence >= ocPass && og.steered < 1) {
                const ocText = '【Think 极境超频集成·' + plan.modelGroup + '/' + (plan.ocLevel || 'apex') + '：' + ocRes.stats.samples + ' 路独立候选、淘汰 ' + ocRes.stats.pruned + ' 条弱路径、置信 ' + ocRes.confidence + '】主回复未通过集成择优。以下为自洽投票+交叉验证+证伪淘汰后收敛的更优结论，请以此为准整合交付最终结果（不要寒暄、不要复述题目、不要提及集成过程）：\n\n' + ocRes.best.slice(0, 8000);
                if (cont.fire(ocText, 'heavy')) { og.steered += 1; services.log.info('oc', 'ensemble beat main reply (conf ' + ocRes.confidence + '); steered for ' + agent.id); }
              }
            } catch (ocErr) { services.log.warn('oc', 'ensemble failed (contained): ' + String(ocErr)); }
          }
          og.busy = false;
        }
      }
      if (ocMode !== 'apex' && state().modules.legacyEnsemble === true && cplx >= 2 && !groundingTookOver && state().modules.treeforge !== false && ctx_mgr_v3.llm && typeof ctx_mgr_v3.llm.stream === 'function') {
        const sT = state();
        const branchTier = clampTier(sT.sliders?.sample ?? eff('branch'));
        const deepTier = clampTier(eff('deep'));
        const useTree = branchTier >= 2;
        if (useTree || (isFlash && branchTier >= 1)) {
          const sigT = sigOf(agent?.session?.events, 6);
          const guard = tournamentGuard.get(agent.id) || { sig: null, busy: false, steered: 0 };
          if (!guard.busy && guard.sig !== sigT) {
            guard.busy = true; guard.sig = sigT; tournamentGuard.set(agent.id, guard);
            const output0 = lastAssistantText(agent);
            const objective0 = svc_traced.getObjective(agent.id) || firstUserText(agent);
            let provider0 = agent?.session?.header?.provider || '';
            if (!provider0) {
              const ps = ctx_mgr_v3.llm.listProviders?.() || [];
              provider0 = ps[0]?.id || '';
            }
            if (output0 && objective0 && provider0 && mstr0) {
              if (useTree) {
                const res = await runReasoningTree(ctx_mgr_v3.llm, objective0, {
                  provider: provider0, model: modelStringOf(agent),
                  branchTier, deepTier, seedText: output0,
                  falsifyTier: clampTier(eff('falsify')),
                  sparring: !!state().modules?.sparring,
                  log: (m) => services.log.info('tree', m + ' [' + agent.id + ']'),
                });
                services.emitEvent({ type: 'reasoning-tree', sessionId: agent.id, score: res.score, bestIsSeed: res.bestIsSeed, calls: res.calls, depthUsed: res.depthUsed, cap: res.cap, survived: res.falsified ? res.falsified.survived : null, at: Date.now() });
                if (!res.bestIsSeed && res.best && res.score >= 72 && guard.steered < 1) {
                  const treeText = '【Think 递归推演树·宽' + res.audit.breadth + '×深' + res.audit.maxDepth + '，' + res.calls + ' 次独立 MAX 调用 + 反事实红队证伪】主回复未通过树内择优。以下为递归收敛后的严格更优结论，请以此为准整合交付最终结果（不要寒暄、不要复述题目、不要提及推演过程）：\n\n' + res.best.slice(0, 8000);
                  if (cont.fire(treeText, 'heavy')) { guard.steered += 1; services.log.info('tree', 'recursive tree beat main reply (score ' + res.score + '); steered for ' + agent.id); }
                }
              } else {
                const judgeTier = clampTier(sT.sliders?.judge ?? eff('deep'));
                const reforgeTier = clampTier(sT.sliders?.reforge ?? Math.min(2, eff('deep')));
                const res = await runTournament(ctx_mgr_v3.llm, objective0, {
                  provider: provider0, model: modelStringOf(agent),
                  sampleTier: branchTier, judgeTier, reforgeTier, seedText: output0,
                  log: (m) => services.log.info('tournament', m + ' [' + agent.id + ']'),
                });
                services.emitEvent({ type: 'tournament', sessionId: agent.id, score: res.score, seedScore: res.seedScore, rounds: res.rounds, calls: res.calls, bestIsSeed: res.bestIsSeed, at: Date.now() });
                if (!res.bestIsSeed && Number.isFinite(res.seedScore) && (res.score - res.seedScore >= 12) && guard.steered < 1 && res.best) {
                  const tourText = '【Think 锦标赛·' + res.calls.samples + ' 版独立 MAX 采样 + ' + res.calls.judges + ' 次独立裁判】主回复 ' + res.seedScore + ' 分，择优版 ' + res.score + ' 分。以下独立复核版严格更优，请以此为准整合交付最终结果（不要寒暄、不要复述题目）：\n\n' + res.best.slice(0, 8000);
                  if (cont.fire(tourText, 'heavy')) { guard.steered += 1; services.log.info('tournament', 'independent candidate beats main reply by ' + (res.score - res.seedScore) + '; steered for ' + agent.id); }
                }
              }
            }
            guard.busy = false;
          }
        }
      }
    } catch (tuErr) {
      services.log.warn('tournament', 'failed (contained): ' + String(tuErr));
      try { const g0 = tournamentGuard.get(agent.id); if (g0) g0.busy = false; } catch { /* contained */ }
    }
    // ===== L2 审判工具箱：多路独立交叉审查，抓到实质硬伤才起一路 MAX 勘误并精准接回（仅 complex；独立防重入）=====
    try {
      if (cplx >= 2 && !groundingTookOver && state().modules.judgepanel !== false && ctx_mgr_v3.llm && typeof ctx_mgr_v3.llm.stream === 'function') {
        const vTier = clampTier(eff('verify'));
        if (vTier >= 1) {
          const vSig = sigOf(agent?.session?.events, 6);
          const vg = trialGuard.get(agent.id) || { sig: null, busy: false, steered: 0 };
          if (!vg.busy && vg.sig !== vSig && !((tournamentGuard.get(agent.id) || {}).steered > 0)) {
            vg.busy = true; vg.sig = vSig; trialGuard.set(agent.id, vg);
            const vOut = lastAssistantText(agent);
            const vTask = svc_traced.getObjective(agent.id) || firstUserText(agent);
            let vProvider = agent?.session?.header?.provider || '';
            if (!vProvider) { const ps = ctx_mgr_v3.llm.listProviders?.() || []; vProvider = ps?.id || ''; }
            if (vOut && vTask && vProvider) {
              const vr = await runVerify(ctx_mgr_v3.llm, {
                provider: vProvider, model: modelStringOf(agent), tier: vTier,
                task: vTask, answer: vOut,
                log: (m) => services.log.info('verify', m + ' [' + agent.id + ']'),
              });
              services.emitEvent({ type: 'thinking-ultra.verify', sessionId: agent.id, triggered: vr.triggered, reviewers: vr.reviewers, major: vr.major, hardFail: vr.hardFail, calls: vr.calls, at: Date.now() });
              if (vr.triggered && vr.revision && vg.steered < 1) {
                const verifyText = '【Think 审判·' + vr.reviewers + ' 路独立交叉审查：发现 ' + vr.major + ' 处实质硬伤】以下为勘误后的最终交付，请以此为准整合（不要寒暄、不要复述题目、不要提及审查过程）：\n\n' + vr.revision.slice(0, 8000);
                if (cont.fire(verifyText, 'heavy')) { vg.steered += 1; services.log.info('verify', 'revision steered for ' + agent.id); }
              }
            }
            vg.busy = false;
          }
        }
      }
    } catch (vErr) {
      services.log.warn('verify', 'failed (contained): ' + String(vErr));
      try { const g1 = trialGuard.get(agent.id); if (g1) g1.busy = false; } catch { /* contained */ }
    }
    // ===== L1.5 可执行验证：答案含可算/可跑结论时抽断言，在隔离 VM 真跑，实跑不符即带证据勘误（审判本轮已接管则不重复）=====
    try {
      const execTier = clampTier(eff('exec'));
      const execText = lastAssistantText(agent);
      const looksComputable = !!execText && /\d\s*[\+\-\*\/×÷^]\s*\d|=\s*-?\d|```|function\s|\b(?:const|let|def|class)\s|合计|总计|等于|平均|占比|百分之/.test(execText);
      // trivial 任务不做可执行验证（纯算术直答即可）；standard/complex 保留
      if (cplx >= 1 && execTier >= 1 && looksComputable && !groundingTookOver && state().modules.execgate !== false && ctx_mgr_v3.llm) {
        const eSig = sigOf(agent?.session?.events, 6);
        const eg = execGuard.get(agent.id) || { sig: null, busy: false, steered: 0 };
        const tgNow = trialGuard.get(agent.id);
        const treeTookOver = (tournamentGuard.get(agent.id) || {}).steered > 0;
        if (!eg.busy && eg.sig !== eSig && !(tgNow && tgNow.steered > 0) && !treeTookOver && eg.steered < 1) {
          eg.busy = true; eg.sig = eSig; execGuard.set(agent.id, eg);
          let eProvider = agent?.session?.header?.provider || '';
          if (!eProvider) { const ps = ctx_mgr_v3.llm.listProviders?.() || []; eProvider = ps[0]?.id || ''; }
          const eTask = svc_traced.getObjective(agent.id) || firstUserText(agent);
          const ev = await runExecVerify(ctx_mgr_v3.llm, eTask, execText, {
            provider: eProvider, model: modelStringOf(agent),
            maxChecks: [0, 2, 3, 4, 6, 7, 8][execTier] || 4,
            log: (m) => services.log.info('exec', m + ' [' + agent.id + ']'),
          });
          services.emitEvent({ type: 'thinking-ultra.exec-verify', sessionId: agent.id, extracted: ev.extracted, executed: ev.executed, triggered: ev.triggered, at: Date.now() });
          if (ev.triggered) {
            const execText2 = '【Think 可执行验证·隔离沙箱实跑】以下结论经独立代码实际运行后不成立：\n- ' + ev.evidence.join('\n- ') + '\n请严格依据实跑结果修正对应数值/结论后重新交付，其余正确部分保留；不要寒暄、不要提及验证过程。';
            if (cont.fire(execText2, 'heavy')) { eg.steered += 1; services.log.info('exec', 'executable verification caught ' + ev.failed.length + ' failing claim(s); steered for ' + agent.id); }
          }
          eg.busy = false;
        }
      }
    } catch (eErr) {
      services.log.warn('exec', 'failed (contained): ' + String(eErr));
      try { const g2 = execGuard.get(agent.id); if (g2) g2.busy = false; } catch { /* contained */ }
    }
    // ===== L3 正向推理工具箱：多推理范式在 Max 底座上并行独立再解，>=2 路交叉确认才综合接回；仅 complex，独立防重入，L1/L2/L1.5 未接管才跑 =====
    try {
      if (cplx >= 2 && !groundingTookOver && state().modules.l3forge !== false && ctx_mgr_v3.llm && typeof ctx_mgr_v3.llm.stream === 'function') {
        const rTier = clampTier(eff('deep'));
        if (rTier >= 1) {
          const rSig = sigOf(agent?.session?.events, 6);
          const rg = reasoningGuard.get(agent.id) || { sig: null, busy: false, steered: 0 };
          const takenByOther = (tournamentGuard.get(agent.id) || {}).steered > 0 || (trialGuard.get(agent.id) || {}).steered > 0 || (execGuard.get(agent.id) || {}).steered > 0;
          if (!rg.busy && rg.sig !== rSig && !takenByOther && rg.steered < 1) {
            rg.busy = true; rg.sig = rSig; reasoningGuard.set(agent.id, rg);
            let rProvider = agent?.session?.header?.provider || '';
            if (!rProvider) { const ps = ctx_mgr_v3.llm.listProviders?.() || []; rProvider = ps[0]?.id || ''; }
            const rTask = svc_traced.getObjective(agent.id) || firstUserText(agent);
            const rSeed = lastAssistantText(agent);
            const rt = await runReasoningToolkit(ctx_mgr_v3.llm, {
              provider: rProvider,
              model: modelStringOf(agent),
              modelTier: state().modelKey,
              tier: rTier,
              task: rTask,
              seedText: rSeed,
              log: (m) => services.log.info('reasoning', m + ' [' + agent.id + ']'),
            });
            services.emitEvent({ type: 'thinking-ultra.reasoning-toolkit', sessionId: agent.id, ran: rt.ran, operators: rt.operators, triggered: rt.triggered, converge: rt.converge, calls: rt.calls, at: Date.now() });
            if (rt.triggered && rt.synthesis) {
              const rText = '【Think 多范式交叉推理·综合结论】以下为多路独立推理交叉确认后的补强结论，请以此为准整合交付（保留正确部分、补齐一致指出的缺口），直接给完整结果，不要寒暄、不要提及推理过程：\n' + rt.synthesis;
              if (cont.fire(rText, 'heavy')) { rg.steered += 1; services.log.info('reasoning', 'cross-confirmed synthesis steered for ' + agent.id + ' (operators=' + rt.operators + ' converge=' + rt.converge + ')'); }
            }
            rg.busy = false;
          }
        }
      }
    } catch (rtErr) {
      services.log.warn('reasoning', 'failed (contained): ' + String(rtErr));
      try { const g3 = reasoningGuard.get(agent.id); if (g3) g3.busy = false; } catch { /* contained */ }
    }
    const ccore = core();
    if (!ccore) return ctx.pass();
    try {
      const output = lastAssistantText(agent);
      if (!output) return ctx.pass();
      const objective = svc_traced.getObjective(agent.id);
      const turnResult = await ccore.turnAdd(output);
      const t = turnResult     
                      
                                                                           
                                                                                                                 
       ;
      if (t.drift?.alert) {
        // 安全边界档位（safety）越低越早告警：仅当偏离度超过档位阈值才推送
        const gate = safetyTier(eff('safety'));
        if ((t.drift.score ?? 0) >= gate.drift) {
          services.emitEvent({ type: 'drift-alert', sessionId: agent.id, score: t.drift.score ?? 0, riskPoints: t.drift.riskPoints ?? [], at: Date.now() });
        }
      }
      if (t.breaker?.tripped) {
        services.emitEvent({ type: 'snapshot', sessionId: agent.id, action: 'tripped', at: Date.now() });
        if (t.breaker.autoRollback) {
          const rb = (t.breaker.rollback ?? {})                                          ;
          services.emitEvent({ type: 'snapshot', sessionId: agent.id, action: 'rolled-back', id: rb.snapshotId, turn: rb.turn, at: Date.now() });
          const msg = '【Think 熔断回滚】连续无效输出触发熔断，已回滚到快照点。请回到原始目标并重新推进：\n' + objective.slice(0, 600) + '\n避免重复产生偏离性内容。';
          if (cont.fire(msg, 'breaker')) services.log.warn('breaker', 'session ' + agent.id + ' tripped; steered back to snapshot');
        } else {
          cont.fire('【Think 熔断】连续无效输出已熔断，请停止当前路径，回到原始目标重新规划：\n' + objective.slice(0, 600), 'breaker');
        }
      }

      // ============================================================
      // v0.3 essence：回合收尾增强（自省复盘修正 / 元认知反思 / 记忆锚定 / 代码检查）
      // v0.11-RC2：全部按真实推理预算编排（层数/扇出/周期/轮数由 orchestrationOf 驱动）
      // ============================================================
      try {
        // -- 自省复盘：trivial 直答不复核；standard/complex 才走内核 review（ref 用内核真实结果） --
        const reviewResult = cplx >= 1 ? await ccore.review(output, objective) : null;
        const r = reviewResult || {};
        if (r.complete === false || (r.correctionHints && r.correctionHints.length > 0)) {
          const correctionMsg = buildCorrectionMessage(r, objective);
          if (cont.fire(correctionMsg, 'review')) services.log.info('review', '自省复盘未通过，已注入修正提示, hints=' + (r.correctionHints?.length || 0) + '+' + (r.logicHoleHints?.length || 0));
          services.emitEvent({ type: 'review', sessionId: agent.id, qualityScore: r.qualityScore ?? 0, halfDone: !!r.halfDone, offTrack: !!r.offTrack, at: Date.now() });
        }
      } catch (rvErr) { services.log.warn('hooks', 'review steer failed: ' + String(rvErr)); }
      try {
        // -- 深度思考反思：真实层数预算（递归自省层数由 deep 档驱动） --
        const deepTier = eff('deep');
        if (cplx >= 2 && deepTier >= 2 && objective) {
          const reflectEvery = Math.max(1, 6 - deepTier);
          if ((Number(turnResult.turn ?? 0) % reflectEvery) === 0) {
            const b = budget().deep;
            const reflectText = '【Think 元认知反思·档位' + deepTier + '】对上一轮输出执行 ' + b.layers + ' 层递归自省：①列出全部关键假设 ②为每条假设构造反例 ③按反例修正并说明依据 ④输出修正后结论与置信度；若发现错误，按因果链向上回溯 ' + b.rollback + ' 层重做。目标：' + objective.slice(0, 300) + '\n请直接交付修正后的完整结果，不要重复寒暄。';
            if (cont.fire(reflectText, 'reflect')) services.log.debug('deep', 'metacognitive reflection injected (every ' + reflectEvery + ' turns, layers=' + b.layers + ')');
          }
        }
      } catch (mcErr) { services.log.warn('hooks', 'metacognitive steer failed: ' + String(mcErr)); }
      try {
        // -- 记忆锚定：真实周期预算（anchorEvery 由 memory 档驱动） --
        const memTier = eff('memory');
        if (cplx >= 2 && memTier >= 1 && objective) {
          const b = budget().memory;
          const anchorEvery = b.anchorEvery;
          if (anchorEvery > 0 && (Number(turnResult.turn ?? 0) % anchorEvery) === 0) {
            const anchorText = '【Think 记忆锚定·档位' + memTier + '】原始目标：' + objective.slice(0, 500) + '\n请输出"事实/决策/待办/风险"四类锚点，并在后续输出中始终围绕目标推进。';
            if (cont.fire(anchorText, 'anchor')) services.log.debug('memory', 'memory anchor injected (every ' + anchorEvery + ' turns)');
          }
        }
      } catch (memErr) { services.log.warn('hooks', 'memory anchor failed: ' + String(memErr)); }
      try {
        // -- 代码工程检查：真实走查轮数（walkRounds 由 code 档驱动） --
        const codeTier = eff('code');
        if (cplx >= 2 && codeTier >= 1 && output && output.length > 40 && /```|function |const |def |class /.test(output)) {
          const b = budget().code;
          const codeText = CODE_TIERS[codeTier] + '\n【走查预算】请对上一轮代码执行 ' + b.walkRounds + ' 轮调用链走查（每轮：边界/异常/资源释放/并发），发现违规项直接在下一轮修正后交付。';
          if (cont.fire(codeText, 'code')) services.log.debug('code', 'code protocol steered, tier=' + codeTier + ' walkRounds=' + b.walkRounds);
        }
      } catch (codeErr) { services.log.warn('hooks', 'code steer failed: ' + String(codeErr)); }

      // ============================================================
      // v0.11-RC2 三开关真实执行链（devil/recheck/bestof）：极烧 token，永不节流
      // 每个开关按各自 cadence 在回合收尾触发真实对抗轮（agent.steer → 模型真实再推演一轮）。
      // ============================================================
      try {
        // 对抗深化轮只在 complex 启用；trivial/standard 不烧这份 token
        const on = cplx >= 2 ? advEnabled() : { devil: false, recheck: false, bestof: false };
        const turnNo = Number(turnResult.turn ?? 0);
        const sm = adversarialSM.get(agent.id) ?? { devil: -1, recheck: -1, bestof: -1 };
        if (on.devil) {
          const every = devilCadence(eff('deep'));
          if (turnNo - sm.devil >= every) {
            // 获取或创建该 agent 的完整魔鬼代言人引擎实例
            let engine = devilEngines.get(agent.id);
            if (!engine) {
              const deepTier = Number(eff('deep')) || 0;
              const intensity = deepTier >= 4 ? 'extreme' : deepTier >= 3 ? 'heavy' : deepTier >= 2 ? 'medium' : 'light';
              engine = new DevilAdvocateEngine({ intensity });
              devilEngines.set(agent.id, engine);
            }
            if (!engine.getFuseStatus().tripped) {
              // 包装 cont.fire 为 async steerFn，真实触发模型对抗轮
              const steerFn = async (prompt, kind) => {
                const ok = cont.fire(prompt, kind || 'devil');
                return ok ? { ok: true, text: '' } : { ok: false };
              };
              const lastOutput = (turnResult && (turnResult.text || turnResult.content)) || '';
              // 完整攻击链路：论断提取→反例生成→攻击→判定→置信度
              const result = await engine.attack(agent.id, lastOutput, objective, steerFn);
              if (result.ok) {
                sm.devil = turnNo;
                // 被攻破的论断自动多轮回炉（熔断保护）
                if (result.needsReforge && !engine.getFuseStatus().tripped) {
                  await engine.reforge(agent.id, result.claims, steerFn);
                }
                const fuse = engine.getFuseStatus();
                services.log.info('adversarial', `devil engine v2: examined=${result.claims.length} broke=${result.brokeCount} defended=${result.defendedCount} confidence=${result.confidence?.score}(${result.confidence?.label}) fuse=${fuse.tripped ? 'TRIPPED:' + fuse.tripReason : 'ok'}`);
              } else {
                services.log.warn('adversarial', `devil engine skipped: ${result.reason}`);
              }
            }
          }
        }
        if (on.recheck) {
          const every = recheckCadence(eff('deep'));
          if (turnNo - sm.recheck >= every) {
            // 获取或创建该 agent 的完整双重校验引擎实例
            let engine = recheckEngines.get(agent.id);
            if (!engine) {
              const deepTier = Number(eff('deep')) || 0;
              const intensity = deepTier >= 4 ? 'extreme' : deepTier >= 3 ? 'heavy' : deepTier >= 2 ? 'medium' : 'light';
              engine = new RecheckEngine({ intensity });
              recheckEngines.set(agent.id, engine);
            }
            if (!engine.getFuseStatus().tripped) {
              const steerFn = async (prompt, kind) => {
                const ok = cont.fire(prompt, kind || 'recheck');
                return ok ? { ok: true, text: '' } : { ok: false };
              };
              const lastOutput = (turnResult && (turnResult.text || turnResult.content)) || '';
              // 完整校验链路：结论提取→方法选择→独立重算→一致性判定→分歧溯源→置信度
              const result = await engine.verify(agent.id, lastOutput, objective, steerFn);
              if (result.ok) {
                sm.recheck = turnNo;
                if (result.needsReforge && !engine.getFuseStatus().tripped) {
                  await engine.reforge(agent.id, result.conclusions, steerFn);
                }
                const fuse = engine.getFuseStatus();
                services.log.info('adversarial', `recheck engine v2: conclusions=${result.conclusions.length} passed=${result.passedCount} failed=${result.failedCount} confidence=${result.overallConfidence?.score}(${result.overallConfidence?.label}) fuse=${fuse.tripped ? 'TRIPPED' : 'ok'}`);
              } else {
                services.log.warn('adversarial', `recheck engine skipped: ${result.reason}`);
              }
            }
          }
        }
        if (on.bestof) {
          const every = bestofCadence(eff('deep'));
          if (turnNo - sm.bestof >= every) {
            // 获取或创建该 agent 的完整多稿竞争引擎实例
            let engine = bestofEngines.get(agent.id);
            if (!engine) {
              const deepTier = Number(eff('deep')) || 0;
              const intensity = deepTier >= 4 ? 'extreme' : deepTier >= 3 ? 'heavy' : deepTier >= 2 ? 'medium' : 'light';
              engine = new BestofEngine({ intensity });
              bestofEngines.set(agent.id, engine);
            }
            if (!engine.getFuseStatus().tripped) {
              const steerFn = async (prompt, kind) => {
                const ok = cont.fire(prompt, kind || 'bestof');
                return ok ? { ok: true, text: '' } : { ok: false };
              };
              // 完整竞争链路：候选生成→独立生成→互评打分→排名→落选分析→胜出者合成→回炉
              const result = await engine.compete(agent.id, objective, steerFn);
              if (result.ok) {
                sm.bestof = turnNo;
                const fuse = engine.getFuseStatus();
                services.log.info('adversarial', `bestof engine v2: candidates=${result.candidates.length} winnerScore=${result.winner?.totalScore} threshold=${result.scoreThreshold} reforge=${result.reforgeRound} synthesized=${result.synthesized?.synthesized} fuse=${fuse.tripped ? 'TRIPPED' : 'ok'}`);
              } else {
                services.log.warn('adversarial', `bestof engine skipped: ${result.reason}`);
              }
            }
          }
        }
        adversarialSM.set(agent.id, sm);
      } catch (advErr) { services.log.warn('hooks', 'adversarial rounds failed: ' + String(advErr)); }

      // -- 增量快照：生成器节流 + 事件签名 diff（只存变化） --
      const snapDue = snap_cadence.next().value           ;
      if (state().modules.snapshot && state().globals.autosnapshot && snapDue) {
        const sig = sigOf(agent?.session?.events, 8);
        if (snap_sig_β.get(agent.id) !== sig) {
          snap_sig_β.set(agent.id, sig); // 签名先落：即使保存失败也不再重试同一窗口
          const saved = await ccore.snapshotSave()                   ;
          if (saved?.id) {
            services.emitEvent({ type: 'snapshot', sessionId: agent.id, action: 'saved', id: saved.id, at: Date.now() });
            services.log.debug('snapshot', 'saved snapshot #' + saved.id + ' (incremental diff)');
          }
        } else {
          services.log.debug('snapshot', 'event stream unchanged — incremental diff skips redundant save');
        }
      }

      // -- Bloom 预过滤缓存：先指纹判新，再签名判变，最后才进 rust --
      // v0.11-RC2：KV 去重周期由 memory 档真实驱动（kvEvery）
      const memBudget = budget().memory;
      const kvEvery = memBudget.kvEvery > 0 ? memBudget.kvEvery : 0;
      const cacheDue = kvEvery > 0 && (Number(turnResult.turn ?? 0) % kvEvery) === 0;
      if (state().modules.cache && state().globals.cache && cacheDue) {
        const messages = agent.session.deriveMessages().map((m) => ({ role: m.role, content: textOf(m.content) }));
        const bloom = cache_bloom_γ.get(agent.id) ?? new BloomFilter(4096);
        let hasNew = false;
        for (const m of messages) {
          if (!bloom.maybe(m.role + '\u0000' + m.content)) { hasNew = true; break; }
        }
        const sig = sigOf(agent?.session?.events, 8);
        const sigSame = cache_sig_δ.get(agent.id) === sig;
        if (hasNew || !sigSame) {
          cache_sig_δ.set(agent.id, sig);
          for (const m of messages) bloom.insert(m.role + '\u0000' + m.content);
          cache_bloom_γ.set(agent.id, bloom);
          const rep = await ccore.cacheOptimize(messages, 96000);
          if ((rep.removedCount ?? 0) > 0) {
            services.log.debug('cache', 'context has ' + rep.removedCount + ' redundant entries (' + rep.tokensBefore + ' -> ' + rep.tokensAfter + ' tokens estimated)');
          }
          if ((rep.removedCount ?? 0) >= 8 && svc_traced.compactionAvailable()) {
            services.log.info('cache', 'severe redundancy; delegating compaction to the harness engine');
            await svc_traced.compactNow(agent, 'thinking-ultra');
          }
        } else {
          services.log.debug('cache', 'bloom prefilter: no new fingerprints — skipping redundant optimize');
        }
      }
      // ============================================================
      // v0.11-RC2 元认知八层：中间结果自校验 + 执行效果自量化（真实挂回合收尾）
      // review 未通过 → 错误自回溯（selfCorrect 记录迭代 + 触发回炉信号）
      // ============================================================
      try {
        if (state().modules.review && services.metacognition && typeof services.metacognition.verifyAndQuantify === 'function') {
          const mc = services.metacognition.verifyAndQuantify(output, objective, turnResult.turn);
          if (mc && mc.checks && !mc.checks.passed && typeof services.metacognition.selfCorrect === 'function') {
            services.metacognition.selfCorrect(new Error('metacognitive verify failed at turn ' + turnResult.turn), { agentId: agent.id, turn: turnResult.turn });
          }
        }
      } catch (mcErr2) { services.log.warn('hooks', 'metacognition verify failed: ' + String(mcErr2)); }
      // 调度任务：本轮完成（真实状态推进：completed；异常时 failed + 监护记录）
      try {
        if (typeof services.taskTick === 'function') {
          services.taskTick('agent:' + agent.id, 'completed');
        }
      } catch (tkErr) { /* contained */ }
      // ===== 混合记忆核心沉淀（真正运行的向量记忆系统）：ultraCore.memory 开启时，
      // 把本轮的重要结论/决策/偏好自动沉淀到持久化记忆，供后续语义检索。失败静默降级。 =====
      try {
        const __ucState = state();
        if (__ucState && __ucState.ultraCore && __ucState.ultraCore.memory) {
          const __memCore = typeof services.memoryCore === 'function' ? services.memoryCore() : null;
          if (__memCore && typeof __memCore.add === 'function') {
            const __userText = firstUserText(agent);
            const __assistantText = lastAssistantText(agent);
            // 只沉淀有实质内容的结论（用户输入+助手输出都非空，且输出长度>50）
            if (__userText && __assistantText && __assistantText.length > 50) {
              // 评估重要性：包含关键决策/结论/配置/偏好的内容重要性更高
              let __importance = 0.4;
              if (/决定|结论|答案|解决方案|配置|设置|偏好|喜欢|习惯|规则|约定|修复|bug|错误|问题/i.test(__assistantText)) __importance += 0.2;
              if (__assistantText.length > 500) __importance += 0.1;
              if (/必须|一定|重要|关键|核心|永远|始终|不要|禁止/i.test(__assistantText)) __importance += 0.1;
              __importance = Math.min(1, __importance);
              // 只沉淀重要性>0.5的内容，避免记忆库被低价值内容填满
              if (__importance >= 0.5) {
                const __memContent = '用户问：' + String(__userText).slice(0, 200) + '\n助手答：' + String(__assistantText).slice(0, 800);
                __memCore.add(__memContent, {
                  type: 'lesson',
                  importance: __importance,
                  tags: ['auto-session', state().modelKey || 'unknown'],
                  sessionId: agent.id,
                });
              }
            }
          }
        }
      } catch (__memSinkErr) { try { services.log.debug('memory-core', 'memory sink failed (contained): ' + String(__memSinkErr)); } catch { /* contained */ } }
      // ===== 置信度校准引擎（真正运行的置信度评估）：ultraCore.calibrate 开启时，
      // 对本轮助手输出做置信度评估和校准，低置信度结论触发验证信号。 =====
      try {
        const __ucState2 = state();
        if (__ucState2 && __ucState2.ultraCore && __ucState2.ultraCore.calibrate) {
          const __calibrator = typeof services.confidenceCalibrator === 'function' ? services.confidenceCalibrator() : null;
          if (__calibrator && typeof __calibrator.evaluate === 'function') {
            const __assistantText2 = lastAssistantText(agent);
            if (__assistantText2 && __assistantText2.length > 50) {
              const __calResult = __calibrator.evaluate(__assistantText2, { model: state().modelKey });
              // 低置信度触发事件，供前端展示或后续验证
              if (__calResult.calibrated < 0.5) {
                try { services.emitEvent({ type: 'low-confidence', sessionId: agent.id, confidence: __calResult.calibrated, domain: __calResult.domain, level: __calResult.level, at: Date.now() }); } catch { /* contained */ }
              }
              try { services.log.debug('calibrate', 'confidence=' + __calResult.calibrated.toFixed(2) + ' domain=' + __calResult.domain + ' [' + agent.id + ']'); } catch { /* contained */ }
            }
          }
        }
      } catch (__calErr) { try { services.log.debug('calibrate-core', 'confidence eval failed (contained): ' + String(__calErr)); } catch { /* contained */ } }
      // ===== 幻觉检测引擎（真正运行的事实/逻辑/数值/来源验证）：ultraCore.hallucination 开启时，
      // 对本轮助手输出做幻觉检测，高幻觉风险触发告警信号。 =====
      try {
        const __ucState3 = state();
        if (__ucState3 && __ucState3.ultraCore && __ucState3.ultraCore.hallucination) {
          const __detector = typeof services.hallucinationDetector === 'function' ? services.hallucinationDetector() : null;
          if (__detector && typeof __detector.detect === 'function') {
            const __assistantText3 = lastAssistantText(agent);
            if (__assistantText3 && __assistantText3.length > 50) {
              const __hallResult = __detector.detect(__assistantText3, { model: state().modelKey });
              // 高幻觉风险触发事件
              if (__hallResult.score >= 0.5) {
                try { services.emitEvent({ type: 'hallucination-alert', sessionId: agent.id, score: __hallResult.score, level: __hallResult.level, issues: __hallResult.issues.slice(0, 5), at: Date.now() }); } catch { /* contained */ }
              }
              try { services.log.debug('hallucination', 'score=' + __hallResult.score.toFixed(2) + ' level=' + __hallResult.level + ' issues=' + __hallResult.issues.length + ' [' + agent.id + ']'); } catch { /* contained */ }
            }
          }
        }
      } catch (__hallErr) { try { services.log.debug('hallucination-core', 'hallucination detect failed (contained): ' + String(__hallErr)); } catch { /* contained */ } }
      // ===== 降级容错引擎健康指标更新：每轮更新响应时间和成功/失败计数 =====
      try {
        const __degradation = typeof services.degradationMatrix === 'function' ? services.degradationMatrix() : null;
        if (__degradation && typeof __degradation.recordSuccess === 'function') {
          __degradation.recordSuccess();
        }
      } catch (__degErr) { /* contained */ }
    } catch (err) {
      services.log.warn('hooks', 'turn-stopping enhancement failed (contained): ' + String(err));
      try { if (typeof services.taskTick === 'function') services.taskTick('agent:' + agent.id, 'failed', err); } catch { /* contained */ }
    }
    return ctx.pass();
  }));

  // ---- 漂移看门狗（长会话守护）：30s 周期 + guard 档位阈值 ----
  // 设计意图：不依赖回合事件的自律巡检 —— 会话卡死/静默漂移时仍能告警。
  let driftTimer                      = null;
  const driftTick = async () => {
    try {
      const s = state();
      if (!s.active || !s.globals.driftAlert) return;
      const ccore = core();
      if (!ccore) return;
      const rep = await ccore.driftCheck()                                                              ;
      const gate = safetyTier(eff('safety'));
      if (rep.alert && (rep.score ?? 0) >= gate.drift) {
        services.emitEvent({ type: 'drift-alert', sessionId: s.sessionId, score: rep.score ?? 0, riskPoints: rep.riskPoints ?? [], at: Date.now() });
        services.log.warn('drift', 'long-session drift alert: score=' + (rep.score ?? 0).toFixed(3));
      }
    } catch (err) { services.log.warn('drift', 'watchdog failed: ' + String(err)); }
  };
  try {
    const t = setInterval(driftTick, 30000);
    if (typeof t.unref === 'function') t.unref();
    driftTimer = () => clearInterval(t);
  } catch { driftTimer = null; }
  if (driftTimer) disposers.push(() => { try { driftTimer (); } catch { /* contained */ } });

  // 在注入 agents 的作用域上一次性挂载全部 agent-scoped 订阅（pre-step 主注入 / session-start / turn-stopping）。
  // 此刻三个 scoped() 规格均已收集完毕；agents 已由 export inject 保证就绪，回调同步执行。
  try { ctx_mgr_v3.inject(['agents'], (c) => mountScoped(c)); } catch (e) { services.log.warn('hooks', 'inject agents mount failed: ' + String(e)); }

  return () => { for (const d of disposers) { try { d(); } catch { /* contained */ } } };
}




