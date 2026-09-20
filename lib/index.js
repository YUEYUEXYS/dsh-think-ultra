// Think host-plane plugin entry (node half).
// One cordis row, two faces: this ESM module runs on the host; the built
// browser half lives at lib/client.js. See README §Architecture.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const __require = createRequire(import.meta.url);
const { MemoryCore } = __require('./host/memory-core.cjs');
const { ConfidenceCalibrator } = __require('./host/calibrate-core.cjs');
const { HallucinationDetector } = __require('./host/hallucination-core.cjs');
const { DegradationMatrix } = __require('./host/degradation-core.cjs');
const { DAGOrchestrator } = __require('./host/dag-core.cjs');
const { GroundingCore } = __require('./host/grounding-core.cjs');
import { DebugLog } from './host/log.js';
import { loadLocalConfig, mergeConfig, saveLocalConfig, configHome } from './host/config.js';
import { CoreBridge } from './host/core-bridge.js';
import { UltraAdapterInstaller } from './host/ultra-adapter.js';
import { installAgentHooks } from './host/agent-hooks.js';
import { installHttp, publishEvent } from './host/http.js';
import { AuthorizeGate } from './host/authorize-gate.js';
import { assessHostCompat, compatLine } from './host/host-compat.js';
// v0.3 essence：滑杆本质引擎（模型×模式×档位矩阵 + 新旧键归一 + 内核键映射）
import { mergeLegacySliders, mapToKernelSliders, resolveEffective } from './host/essence-core.js';

// v0.11-RC2 内核层模块（10个新内核模块，全部静默运行，不触碰前端可视层）
import { setActiveModel, listModels, getCapabilityScore, getSliderDefaults, getInferenceParams } from './host/model-capability-registry.js';
import { getMetacognitionEngine, startMetacognition, stopMetacognition } from './host/metacognition-engine.js';
import { directMetacog } from './host/metacog-director.js';
import { getMultiAgentScheduler, startScheduler, stopScheduler, registerMonitoredTask, registerTaskPriority, unregisterMonitoredTask } from './host/multi-agent-scheduler.js';
import { getTaskGuardian, startGuardian, stopGuardian, registerBoundaryCheck } from './host/task-guardian.js';
import { getInputMonitor, startInputMonitor, stopInputMonitor } from './host/input-monitor.js';
import { getRenderScheduler, startRenderScheduler, stopRenderScheduler } from './host/render-scheduler.js';
import { getPluginLoader, startLoadTimer, markLoadStart, markLoaded, endLoadTimer, getLoadOrder } from './host/plugin-loader.js';
import { getResourceController, startResourceController, stopResourceController } from './host/resource-controller.js';
import { getStabilityGuard, startStabilityGuard, stopStabilityGuard } from './host/stability-guard.js';
import { getControlFlowObfuscator, startAntiDebug, stopAntiDebug } from './host/control-flow-obfuscator.js';
                                                                                                           
import { DEFAULT_GLOBALS, DEFAULT_MODULES, DEFAULT_SLIDERS } from './shared/protocol.js';
import { PLUGIN_NAME, PLUGIN_VERSION } from './shared/constants.js';
import Schema from 'schemastery'; // CJS 包（module.exports = Schema）：必须默认导入，命名导入在原生 ESM 下不可用

// 宿主侧全局异常捕获：崩溃时输出错误堆栈
process.on('uncaughtException', (err) => { const dump = (e, d) => { if (!e || d > 5) return; try { console.error('[tu-d' + d + ']', e && e.stack ? e.stack : String(e)); } catch { /* contained */ } try { if (Array.isArray(e.errors)) e.errors.forEach((x) => dump(x, d + 1)); } catch { /* contained */ } try { if (e.cause) dump(e.cause, d + 1); } catch { /* contained */ } }; dump(err, 0); });
process.on('unhandledRejection', (reason) => { console.error('[thinking-ultra] unhandledRejection:', reason && reason.stack ? reason.stack : String(reason)); });

// 清除可能干扰 API 的代理变量（全离线设计：宿主侧请求也不应被代理劫持）
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) {
  try { delete process.env[k]; } catch (e) { /* contained */ }
}

export const name = PLUGIN_NAME;
export const inject = ['llm', 'systemPrompt', 'agents', 'tools'];

function detectHarnessVersion() {
  const readVer = (p) => { try { if (existsSync(p)) { const j = JSON.parse(readFileSync(p, 'utf8')); if (j && typeof j.version === 'string') return j.version; } } catch { /* ignore */ } return null; };
  // (1) 运行宿主主入口最权威：bin.js 位于 @deepseek-ai/dsh/lib 下，逐级向上找该包 package.json（穿透 junction/Protected 部署）
  try {
    const main = process.argv[1];
    if (main) {
      let d = dirname(main);
      for (let k = 0; k < 8; k++) {
        const v = readVer(join(d, 'package.json'));
        let name = null; try { name = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).name; } catch { /* ignore */ }
        if (v && name === '@deepseek-ai/dsh') return v;
        const up = dirname(d); if (up === d) break; d = up;
      }
    }
  } catch { /* ignore */ }
  // (2) home 共享 fallback 链接（~/.dsh/profiles/node_modules）
  try {
    const home = process.env.USERPROFILE || process.env.HOME;
    if (home) { const v = readVer(join(home, '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'package.json')); if (v) return v; }
  } catch { /* ignore */ }
  // (3) 相对当前模块（非 junction 的直接部署）
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const v = readVer(join(here, '..', '..', '@deepseek-ai', 'dsh', 'package.json')); if (v) return v;
  } catch { /* ignore */ }
  return 'unknown';
}


// v0.12-alpha.2 compat shim: the official @deepseek-ai/dsh-client-ui-deliverables calls
// ctx.systemPrompt.getSectionOrder(KEY) at boot, an API removed in alpha.2. Its own package has
// no guard and throws TypeError, taking the whole plugin tree (and the Ultra settings entry) down.
// Think does not rely on that API; we only attach a deterministic numeric fallback onto
// the shared systemPrompt service so the official section() registration survives. Idempotent:
// never overrides a real implementation; falls back to the prototype if the instance is read-only.
function installSectionOrderShim(ctx) {
  try {
    const sp = ctx && ctx.systemPrompt;
    if (!sp || typeof sp.getSectionOrder === 'function') return;
    const FALLBACK_ORDER = { DELIVERABLE_FILE_REFERENCES: 520 };
    const shimFn = function getSectionOrderShim(key) {
      const n = Number(FALLBACK_ORDER[key]);
      return Number.isFinite(n) ? n : 500;
    };
    try { sp.getSectionOrder = shimFn; }
    catch {
      const proto = Object.getPrototypeOf(sp);
      if (proto && typeof proto.getSectionOrder !== 'function') proto.getSectionOrder = shimFn;
    }
  } catch { /* compat shim must never block our own activation */ }
}

export function apply(ctx     , config                         ) {
  installSectionOrderShim(ctx);
  const log = new DebugLog();
  const cfgOutcome = loadLocalConfig();
  const merged = mergeConfig(cfgOutcome.config, {
    modules: { ...DEFAULT_MODULES },
    globals: { ...DEFAULT_GLOBALS },
    sliders: { ...DEFAULT_SLIDERS },
  });
  const harnessVersion = detectHarnessVersion();
  const hostCompat = assessHostCompat(harnessVersion);
  try { console.log(compatLine(harnessVersion)); } catch { /* never block on logging */ }

  // v0.10 元认知核心舱 host 侧默认与规范化（与 ui-state.cjs / constants.cjs 严格同构）
  const cloneMetacog = () => ({ level: 1, red: { cf: false, prov: false, para: false }, black: { doubt: false, sandbox: false, blind: false, fractal: false, selfkill: false, multiconc: false }, lab: { pfield: false, infinite: false, decon: false, counterint: false }, devUnlocked: false });
  const normalizeMetacog = (raw) => {
    const d = cloneMetacog();
    if (!raw || typeof raw !== 'object') return d;
    const n = Number(raw.level);
    d.level = Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 1;
    const grp = (name, fall) => { if (raw[name] && typeof raw[name] === 'object') for (const k of Object.keys(fall)) if (typeof raw[name][k] === 'boolean') fall[k] = raw[name][k]; };
    grp('red', d.red); grp('black', d.black); grp('lab', d.lab);
    d.devUnlocked = typeof raw.devUnlocked === 'boolean' ? raw.devUnlocked : false;
    // L4 以下不允许黑色档残留、L2 以下不允许红色档残留（与前端 sanitize 双保险）
    if (d.level < 4) Object.keys(d.black).forEach((k) => { d.black[k] = false; });
    if (d.level < 2) Object.keys(d.red).forEach((k) => { d.red[k] = false; });
    if (!d.devUnlocked) Object.keys(d.lab).forEach((k) => { d.lab[k] = false; });
    return d;
  };
  // v0.10 实验级总控面板 host 侧默认与规范化（与 ui-state.cjs 严格同构；未解锁强制安全默认）
  const cloneLabConfig = () => ({
    unlocked: false,
    metaRules: { isolation: 0, counterIntuitive: false, undecidable: false, infiniteConcepts: false, selfReference: false, truthStandard: 'consistency' },
    topology: { selfRefLevel: 0, fractalDepth: 0, infoBarriers: false },
    convergence: { semanticEntropy: 0.85, contradictionTolerance: 0.2, recursionHard: 6, selfWrapLayers: 3, tokenRate: 2.5, snapshotRollback: true },
    memory: { snapshotGranularity: 1, depGraph: true, cascadeInvalidate: true, replay: false, exportTrace: false },
    guard: { antiDebug: 0, memObf: 0, decoys: false },
    modality: { visibility: 1, metaComments: false, showPruned: false, rawBare: false },
    crossModel: { enabled: false, trust: 0.5, barriers: false },
    blackbox: { infinite: false, deconstruct: false, counterIntuitive: false },
  });
  const normalizeLabConfig = (raw) => {
    const d = cloneLabConfig();
    if (!raw || typeof raw !== 'object') return d;
    d.unlocked = typeof raw.unlocked === 'boolean' ? raw.unlocked : false;
    const num = (sec, key, lo, hi, intg) => { const r = raw[sec]; if (!r || typeof r !== 'object') return; let v = Number(r[key]); if (!Number.isFinite(v)) return; v = Math.max(lo, Math.min(hi, v)); d[sec][key] = intg ? Math.round(v) : Math.round(v * 1000) / 1000; };
    const bool = (sec, key) => { const r = raw[sec]; if (r && typeof r === 'object' && typeof r[key] === 'boolean') d[sec][key] = r[key]; };
    num('metaRules', 'isolation', 0, 3, 1); bool('metaRules', 'counterIntuitive'); bool('metaRules', 'undecidable'); bool('metaRules', 'infiniteConcepts'); bool('metaRules', 'selfReference');
    const TRUTH = ['consistency', 'factual', 'noncontradiction', 'falsifiable', 'pragmatic', 'none'];
    if (raw.metaRules && TRUTH.includes(raw.metaRules.truthStandard)) d.metaRules.truthStandard = raw.metaRules.truthStandard;
    num('topology', 'selfRefLevel', 0, 4, 1); num('topology', 'fractalDepth', 0, 4, 1); bool('topology', 'infoBarriers');
    num('convergence', 'semanticEntropy', 0.5, 0.99, false); num('convergence', 'contradictionTolerance', 0, 1, false); num('convergence', 'recursionHard', 2, 16, 1); num('convergence', 'selfWrapLayers', 1, 12, 1); num('convergence', 'tokenRate', 1, 6, false); bool('convergence', 'snapshotRollback');
    num('memory', 'snapshotGranularity', 0, 3, 1); bool('memory', 'depGraph'); bool('memory', 'cascadeInvalidate'); bool('memory', 'replay'); bool('memory', 'exportTrace');
    num('guard', 'antiDebug', 0, 5, 1); num('guard', 'memObf', 0, 3, 1); bool('guard', 'decoys');
    num('modality', 'visibility', 0, 5, 1); bool('modality', 'metaComments'); bool('modality', 'showPruned'); bool('modality', 'rawBare');
    bool('crossModel', 'enabled'); num('crossModel', 'trust', 0, 1, false); bool('crossModel', 'barriers');
    bool('blackbox', 'infinite'); bool('blackbox', 'deconstruct'); bool('blackbox', 'counterIntuitive');
    if (!d.unlocked) return cloneLabConfig();
    return d;
  };

  // OC 超频集成模式（与 oc-core.js 同构）：velocity 迅流=单链零集成；apex 极境=多候选集成；locked 仅前端灰显占位，host 按单链处理
  const cloneOc = () => ({ mode: 'velocity', oc: 'off', token: 't1', quality: 'standard', falsify: 'off', toolAggro: 1 });
  const OC_LEVELS_S = ['off', 'balanced', 'swarm', 'crush'];
  const OC_TOKENS_S = ['t1', 't2', 't4', 'max'];
  const OC_QUALITY_S = ['standard', 'enhanced', 'zenith', 'transcend', 'ultimate'];
  const OC_FALSIFY_S = ['off', 'mid', 'strong'];
  const normalizeOc = (raw) => {
    const d = cloneOc();
    if (!raw || typeof raw !== 'object') return d;
    d.mode = raw.mode === 'apex' ? 'apex' : (raw.mode === 'locked' ? 'locked' : 'velocity');
    if (OC_LEVELS_S.includes(raw.oc)) d.oc = raw.oc;
    if (OC_TOKENS_S.includes(raw.token)) d.token = raw.token;
    if (OC_QUALITY_S.includes(raw.quality)) d.quality = raw.quality;
    if (OC_FALSIFY_S.includes(raw.falsify)) d.falsify = raw.falsify;
    const ta = Number(raw.toolAggro);
    d.toolAggro = Number.isFinite(ta) ? Math.max(0, Math.min(4, Math.round(ta))) : 1;
    return d;
  };
  let state             = {
    active: false,
    mode: 'max',
    sessionId: '',
    modules: merged.modules               ,
    globals: merged.globals               ,
    sliders: merged.sliders               ,
    extreme: cfgOutcome.extremeUnlocked,
    extremeUnlocked: cfgOutcome.extremeUnlocked,
    // v0.3 essence：模型/模式矩阵状态 + 偏好指令（Pro≤40000 / Flash·Vision≤16000 字）
    modelKey: null,
    harnessMode: 'standard',
    prefs: '',
    metacog: cloneMetacog(),
    labConfig: cloneLabConfig(),
    oc: cloneOc(), // OC 超频集成模式状态
    authorizeCalls: false, // DeepSeek 调用授权硬开关（默认关=直接调用；开=每轮首次调用前按概率弹允许/拒绝）
    authorizeProbability: 0.35, // 开启 Ultra 后弹窗概率 0~1（1=每轮必弹，0=永不弹）
    // Ultra Core 合体引擎：16引擎开关，深度推理协议集
    ultraCore: { tot: true, selfPlay: true, metacog: true, dag: false, memory: true, calibrate: true, hallucination: true, degradation: true, crossModal: false, video: false, audio: false, rag: false, codebase: false, sandbox: false, selfExtend: false, composer: false },
  };

  // ---- 5个核心引擎（懒加载：只在第一次使用时才初始化，避免插件加载时阻塞）----
  // 每个引擎都是真正运行的后端代码，不是提示词。
  let __memoryCoreInstance = null;
  let __confidenceCalibratorInstance = null;
  let __hallucinationDetectorInstance = null;
  let __degradationMatrixInstance = null;
  let __dagOrchestratorInstance = null;
  const getMemoryCore = () => {
    if (!__memoryCoreInstance) {
      try { __memoryCoreInstance = new MemoryCore({ storagePath: join(configHome(), 'thinking-ultra.memory.json'), maxMemories: 5000, dim: 256 }); }
      catch (e) { log.warn('core', 'memoryCore init failed (contained): ' + String(e)); __memoryCoreInstance = null; }
    }
    return __memoryCoreInstance;
  };
  const getConfidenceCalibrator = () => {
    if (!__confidenceCalibratorInstance) {
      try { __confidenceCalibratorInstance = new ConfidenceCalibrator({ maxHistory: 500 }); }
      catch (e) { log.warn('core', 'confidenceCalibrator init failed (contained): ' + String(e)); __confidenceCalibratorInstance = null; }
    }
    return __confidenceCalibratorInstance;
  };
  const getHallucinationDetector = () => {
    if (!__hallucinationDetectorInstance) {
      try { __hallucinationDetectorInstance = new HallucinationDetector({ maxHistory: 200 }); }
      catch (e) { log.warn('core', 'hallucinationDetector init failed (contained): ' + String(e)); __hallucinationDetectorInstance = null; }
    }
    return __hallucinationDetectorInstance;
  };
  const getDegradationMatrix = () => {
    if (!__degradationMatrixInstance) {
      try { __degradationMatrixInstance = new DegradationMatrix({ maxHistory: 100 }); }
      catch (e) { log.warn('core', 'degradationMatrix init failed (contained): ' + String(e)); __degradationMatrixInstance = null; }
    }
    return __degradationMatrixInstance;
  };
  const getDagOrchestrator = () => {
    if (!__dagOrchestratorInstance) {
      try { __dagOrchestratorInstance = new DAGOrchestrator({ maxRetries: 3, maxParallel: 5 }); }
      catch (e) { log.warn('core', 'dagOrchestrator init failed (contained): ' + String(e)); __dagOrchestratorInstance = null; }
    }
    return __dagOrchestratorInstance;
  };
  // L0 确定性核验内核（纯本地、零网络、零 token）；初始化失败安全降级为 null
  let __groundingCoreInstance = null;
  const getGroundingCore = () => {
    if (!__groundingCoreInstance) {
      try { __groundingCoreInstance = new GroundingCore({ enabled: true }); }
      catch (e) { log.warn('core', 'groundingCore init failed (contained): ' + String(e)); __groundingCoreInstance = null; }
    }
    return __groundingCoreInstance;
  };

  // ---- 面板状态宿主持久化（v0.2）：写入插件自身配置文件，不依赖 settings 服务 ----
  // panelState 字段存于 <DSH_HOME>/thinking-ultra.config.json：
  // 页面刷新/关闭/服务重启后完整恢复，双保险（客户端另有 localStorage）。
                     
                                   
                                   
                                   
                           
                          
                      
    
  const rawPanel = (cfgOutcome.config                                                         ).panelState;
  const panel             = rawPanel && typeof rawPanel === 'object' ? rawPanel : {};
  if (panel.sliders && typeof panel.sliders === 'object') state.sliders = { ...DEFAULT_SLIDERS, ...panel.sliders }               ;
  // v0.3 essence：面板持久化的滑杆可能是旧键（code/flow/memory/guard/...）→ 归一为 6 本质键
  state.sliders = mergeLegacySliders(state.sliders);
  if (panel.modules && typeof panel.modules === 'object') state.modules = { ...DEFAULT_MODULES, ...panel.modules }               ;
  if (panel.globals && typeof panel.globals === 'object') state.globals = { ...DEFAULT_GLOBALS, ...panel.globals }               ;
  if (panel.metacog) state.metacog = normalizeMetacog(panel.metacog);
  if (panel.labConfig) state.labConfig = normalizeLabConfig(panel.labConfig);
  if (panel.oc) { state.oc = normalizeOc(panel.oc); panel.oc = state.oc; }
  if (typeof panel.authorizeCalls === 'boolean') state.authorizeCalls = panel.authorizeCalls;
  if (typeof panel.authorizeProbability === 'number') state.authorizeProbability = AuthorizeGate.clampProb(panel.authorizeProbability);
  if (panel.ultraCore && typeof panel.ultraCore === 'object') {
    const uc = {};
    ['tot','selfPlay','metacog','dag','memory','calibrate','hallucination','degradation','crossModal','video','audio','rag','codebase','sandbox','selfExtend','composer'].forEach(function (k) {
      if (typeof panel.ultraCore[k] === 'boolean') uc[k] = panel.ultraCore[k];
    });
    state.ultraCore = Object.assign({}, state.ultraCore, uc);
  }
  if (typeof panel.capability === 'number') state.capability = Math.max(0, Math.min(20, Math.round(Number(panel.capability))));
  // fail-open：面板 Ultra 开关状态同步进 state（默认开启）。pre-step 自激活闸门据此判断，不再依赖易失败的 activate RPC。
  state.ultraActive = panel.ultraActive !== false;
  const prefCapOf = (s) => ((s || state.activeModelShort) === 'pro' ? 40000 : 16000);
  if (typeof panel.prefs === 'string') state.prefs = panel.prefs.slice(0, prefCapOf());
  let guardEnabled = panel.guardEnabled !== false;
  // DeepSeek 调用授权门闩：默认关闭（直接调用、零影响）；开启后每轮首次发起模型调用前需前端允许，拒绝即终止，确定性触发
  const authorizeGate = new AuthorizeGate({ emit: (e) => publishEvent(e), probability: state.authorizeProbability });
  authorizeGate.setEnabled(!!state.authorizeCalls);
  const panelLanguage = panel.language === 'en' || panel.language === 'zh' ? panel.language : 'zh';
  void panelLanguage; // 语言以 panel.language 为准（settingsSync 回传）

  function persistPanel() {
    try {
      const cur = loadLocalConfig();
      const nextCfg = { ...cur.config, panelState: { ...panel, sliders: { ...panel.sliders }, modules: { ...panel.modules }, globals: { ...panel.globals }, metacog: panel.metacog, labConfig: panel.labConfig, ultraCore: panel.ultraCore || state.ultraCore } };
      const out = saveLocalConfig(nextCfg);
      if (out.error) log.warn('settings', 'panel persist failed: ' + out.error);
    } catch (e) { log.warn('settings', 'panel persist failed: ' + String(e)); }
  }

  log.debug('core', 'loaded config from ' + cfgOutcome.path + (cfgOutcome.loaded ? '' : ' (defaults)') + ', extreme=' + cfgOutcome.extremeUnlocked);
  if (cfgOutcome.error) log.warn('config', cfgOutcome.error);

  const objectives = new Map                ();
  let core                    = null;
  let coreVersion                = null;
  let compatReport          = null;
  let activeSnapshotDir = merged.snapshotDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'snapshots');

  const getState = () => state;
  // v0.11-RC2 三模型表格路由：按真实会话模型（或面板选中模型）装载对应那份滑杆/开关/偏好。
  // 三份独立存档由前端 modelSlots 整包上报；会话创建检测到模型后立即切换，缺槽保持现状，绝不串档。
  const modelShortOf = (k) => {
    const m = String(k || '').toLowerCase();
    if (m.includes('vision') || m.includes('-vl') || m.includes('multimodal')) return 'flash';
    if (m.includes('flash')) return 'flash';
    return 'pro';
  };
  // 稳定性折叠杆 → 后台引擎真实运行参数（并行分片度/熔断阈值/无感重试/长链超时），纯数值幂等，不向前端回写、不走提示词
  const STAB_PARALLEL = [2, 2, 3, 3, 4, 4, 4];
  const STAB_RETRIES = [2, 2, 3, 3, 4, 5, 6];
  const STAB_FUSE = [3, 4, 4, 5, 5, 6, 7];
  const STAB_LONGMS = [600000, 600000, 900000, 900000, 1200000, 1500000, 1800000];
  // reclaim 资源回收杆：档越高闲置释放越积极、内存/CPU 峰值上限压得越紧（真接 resource-controller 运行参数）
  const STAB_RELEASE_MS = [60000, 45000, 30000, 22000, 15000, 10000, 6000];
  const STAB_MEM_CAP = [768, 700, 640, 576, 512, 420, 320];
  const STAB_CPU_CAP = [95, 90, 85, 80, 75, 68, 60];
  function applyStabilityTuning() {
    try {
      const eff = (k) => resolveEffective(state.modelKey, state.harnessMode, k, state.sliders?.[k]);
      getMultiAgentScheduler().maxParallelAgents = STAB_PARALLEL[eff('agent')] ?? 2;
      getTaskGuardian().maxRetries = STAB_RETRIES[eff('heal')] ?? 2;
      getTaskGuardian().failureThreshold = STAB_FUSE[eff('consist')] ?? 3;
      state.longTaskMs = STAB_LONGMS[eff('longcode')] ?? 600000;
      const rc = getResourceController();
      rc.releaseThreshold = STAB_RELEASE_MS[eff('reclaim')] ?? 30000;
      rc.memoryLimit = STAB_MEM_CAP[eff('reclaim')] ?? 640;
      rc.cpuLimit = STAB_CPU_CAP[eff('reclaim')] ?? 85;
    } catch (e) { log.warn('stability', 'applyStabilityTuning failed: ' + String(e)); }
  }
  function selectModelConfig(modelKey) {
    try {
      const short = modelShortOf(modelKey);
      const slots = (state.modelSlots && state.modelSlots[short]) || (panel.modelSlots && panel.modelSlots[short]) || null;
      if (slots) {
        if (slots.sliders && typeof slots.sliders === 'object') {
          state.sliders = mergeLegacySliders({ ...DEFAULT_SLIDERS, ...slots.sliders });
        }
        if (slots.modules && typeof slots.modules === 'object') state.modules = { ...DEFAULT_MODULES, ...slots.modules };
        if (typeof slots.prefs === 'string') state.prefs = slots.prefs.slice(0, prefCapOf(short));
        // v0.1 严格隔离：OC / 元认知(含开发者解锁) / 实验总控(含 unlocked) 也按真实会话模型整槽换入，缺槽回默认，绝不沿用上一模型
        if (slots.oc && typeof slots.oc === 'object') { const ocv = normalizeOc(slots.oc); state.oc = ocv; panel.oc = ocv; }
        if (slots.metacog && typeof slots.metacog === 'object') { const mcv = normalizeMetacog(slots.metacog); state.metacog = mcv; panel.metacog = mcv; }
        if (slots.labConfig && typeof slots.labConfig === 'object') { const lcv = normalizeLabConfig(slots.labConfig); state.labConfig = lcv; panel.labConfig = lcv; }
        log.info('model-route', 'active table loaded: ' + short + ' (from ' + String(modelKey) + ')');
      }
      state.activeModelShort = short;
      applyStabilityTuning();
      return short;
    } catch (e) { log.warn('model-route', 'selectModelConfig failed: ' + String(e)); return null; }
  }
  const getCore = () => core;
  const setObjective = (id        , text        ) => { objectives.set(id, text); };
  const getObjective = (id        ) => objectives.get(id) ?? '';

  async function ensureCore() {
    if (core && core.running()) return core;
    // Optional native accelerator: if the binary is missing/blocked, degrade
    // gracefully to the built-in JS engine instead of failing activation.
    try {
      const bridge = new CoreBridge(log);
      await bridge.start();
      const ping = await bridge.call('ping');
      core = bridge;
      coreVersion = ping?.version ?? null;
      if (cfgOutcome.loaded) {
        await core.call('config.load', { path: cfgOutcome.path });
        log.debug('config', 'mirrored local config into core: ' + cfgOutcome.path);
      }
      return core;
    } catch (e) {
      core = null;
      coreVersion = null;
      log.warn('core', 'native core unavailable, running on built-in JS engine: ' + String(e instanceof Error ? e.message : e));
      return null;
    }
  }

  async function syncToCore() {
    applyStabilityTuning();
    const c = core;
    if (!c) return;
    // v0.3 essence：内核只认 code/flow/memory 三键——映射后再同步
    const kernelState = { ...state, sliders: mapToKernelSliders(state.sliders) };
    await c.syncState(
      kernelState,
      getObjective(state.sessionId),
      harnessVersion,
      activeSnapshotDir,
      merged.kvBudgetTokens,
      merged.branchCount,
    );
    // v0.10 元认知核心舱：按当前 L1-L5/红黑实验状态归约出内核调用清单并异步深算。
    // fire-and-forget：不阻塞配置热同步主路径，每个 Rust 内核在 runMetacog 内单点隔离。
    try {
      const __directed = directMetacog(state.metacog, state.modelKey || state.activeModelShort || 'pro');
      if (__directed.activeKernels.length && typeof c.runMetacog === 'function') {
        c.runMetacog(__directed, { model: state.modelKey || state.activeModelShort || 'pro', labConfig: state.labConfig || cloneLabConfig() }).catch(() => { /* contained */ });
      }
    } catch { /* metacog director must never break core sync */ }
  }

  let pendingEssence                = null;
  let settingsScope      = null; // ctx.settings.register 返回的 scope（悬浮面板与设置面板共用的状态源）

  const services = {
    getState,
    getCore,
    log,
    memoryCore: () => getMemoryCore(),
    confidenceCalibrator: () => getConfidenceCalibrator(),
    hallucinationDetector: () => getHallucinationDetector(),
    degradationMatrix: () => getDegradationMatrix(),
    dagOrchestrator: () => getDagOrchestrator(),
    groundingCore: () => getGroundingCore(),
    hostCompat: () => hostCompat,
    panelState: () => ({ ...panel, guardEnabled, language: panel.language ?? 'zh', prefs: state.prefs || panel.prefs || '' }),
    essenceApprove: async (body                                                          ) => {
      if (body?.accepted && body.text && body.text.length > 0) {
        pendingEssence = String(body.text).slice(0, 400);
        log.info('essence', '修正推演已批准，等待下一次请求注入');
        return { ok: true, injected: false };
      }
      pendingEssence = null;
      log.info('essence', '用户拒绝本次修正推演');
      return { ok: true, injected: false };
    },
    takePendingEssence: () => {
      const v = pendingEssence;
      pendingEssence = null; // 一次性消费
      return v;
    },
    settingsSync: async (body   
                                                                                                  
                                                                                                     
     ) => {
      try {
        // 1) 写入插件自身配置文件（独立于 settings 服务，任何环境都可用）
        if (body?.language === 'zh' || body?.language === 'en') panel.language = body.language;
        if (typeof body?.ultraActive === 'boolean') { panel.ultraActive = body.ultraActive; state.ultraActive = body.ultraActive; }
        if (typeof body?.guardEnabled === 'boolean') { panel.guardEnabled = body.guardEnabled; guardEnabled = body.guardEnabled; }
        if (typeof body?.extremeUnlocked === 'boolean') panel.extremeUnlocked = body.extremeUnlocked;
        if (body?.sliders && typeof body.sliders === 'object') {
          // v0.3 essence：客户端滑杆键归一到本质 6 键后写入（旧键自动合并迁移）
          const mergedSliders = mergeLegacySliders({ ...(panel.sliders ?? {}), ...body.sliders });
          panel.sliders = mergedSliders;
          state.sliders = mergedSliders; applyStabilityTuning(); // 立即作用于运行中的内核与宿主管线，并联动稳定性后台参数
        }
        if (typeof body?.prefs === 'string') {
          const p = body.prefs.slice(0, prefCapOf());
          panel.prefs = p;
          state.prefs = p;                             // 立即注入下一次请求（mwPrefs）
        }
        if (body?.modules && typeof body.modules === 'object') {
          panel.modules = { ...(panel.modules ?? {}), ...body.modules };
          state.modules = { ...state.modules, ...body.modules }               ;
        }
        if (body?.globals && typeof body.globals === 'object') {
          panel.globals = { ...(panel.globals ?? {}), ...body.globals };
          state.globals = { ...state.globals, ...body.globals }               ;
        }
        if (body?.metacog && typeof body.metacog === 'object') {
          // 元认知核心舱：规范化后同时落盘与实时状态，立即作用于下一次注入与 Rust 内核
          const mc = normalizeMetacog(body.metacog);
          panel.metacog = mc; state.metacog = mc;
        }
        if (body?.labConfig && typeof body.labConfig === 'object') {
          const lc = normalizeLabConfig(body.labConfig);
          panel.labConfig = lc; state.labConfig = lc;
        }
        // OC 模式独立通道（修正：此前误嵌套在 labConfig 块内，单独下发 oc 时不落盘）
        if (body?.oc && typeof body.oc === 'object') { const ocv = normalizeOc(body.oc); panel.oc = ocv; state.oc = ocv; }
        if (typeof body?.capability === 'number' && isFinite(body.capability)) { const capv = Math.max(0, Math.min(20, Math.round(Number(body.capability)))); panel.capability = capv; state.capability = capv; }
        // 调用授权硬开关：确定性门闩，开/关即时作用于运行中的 gate
        if (typeof body?.authorizeCalls === 'boolean') { panel.authorizeCalls = body.authorizeCalls; state.authorizeCalls = body.authorizeCalls; try { authorizeGate.setEnabled(body.authorizeCalls); } catch { /* contained */ } }
        if (typeof body?.authorizeProbability === 'number') { const pp = AuthorizeGate.clampProb(body.authorizeProbability); panel.authorizeProbability = pp; state.authorizeProbability = pp; try { authorizeGate.setProbability(pp); } catch { /* contained */ } }
        // Ultra Core 合体引擎：16引擎开关状态，顶级项目思路整合（Mem0记忆/AceSearcher自博弈/Aegis防漂移/PHANTASM不确定性/NVIDIA工具循环）
        if (body?.ultraCore && typeof body.ultraCore === 'object') {
          const uc = {};
          ['tot','selfPlay','metacog','dag','memory','calibrate','hallucination','degradation','crossModal','video','audio','rag','codebase','sandbox','selfExtend','composer'].forEach(function (k) {
            if (typeof body.ultraCore[k] === 'boolean') uc[k] = body.ultraCore[k];
          });
          panel.ultraCore = uc;
          state.ultraCore = uc;
        }
        // v0.11-RC2 三模型独立配置槽通道（可插拔静默预留）：
        // 前端槽位已随 sliders 下发；若未来直接下发 modelSlots 整包，此处原样落盘
        // 并按当前模型通道路由（state.modelKey 由 agent/created 实时检测）。
        if (body?.modelSlots && typeof body.modelSlots === 'object') {
          panel.modelSlots = body.modelSlots;
          state.modelSlots = body.modelSlots;
        }
        // selectedModel 只是前端正在编辑的模型 tab，不能覆盖真实会话模型。
        // 真实路由永远以 agent/created 检测到的 state.modelKey 为准。
        if (body?.selectedModel && !state.modelKey) selectModelConfig(body.selectedModel);
        persistPanel();
        // 2) 内核热同步：滑杆/开关变更立即对 review/branches/cache/… 生效
        try { if (core && core.running()) await syncToCore(); } catch { /* contained */ }
        // 3) settings 服务可用时同步一份（增益路径）
        try {
          if (settingsScope && typeof settingsScope.get === 'function') {
            const cur = (settingsScope.get() ?? {})                           ;
            const next                          = { ...cur };
            if (body?.language === 'zh' || body?.language === 'en') next.language = body.language;
            if (typeof body?.ultraActive === 'boolean') next.ultraActive = body.ultraActive;
            if (typeof body?.guardEnabled === 'boolean') next.guardEnabled = body.guardEnabled;
            if (typeof body?.extremeUnlocked === 'boolean') next.extremeUnlocked = body.extremeUnlocked;
            if (body?.sliders && typeof body.sliders === 'object') next.sliders = { ...(cur.sliders           ?? {}), ...body.sliders };
            if (body?.modules && typeof body.modules === 'object') next.modules = { ...(cur.modules           ?? {}), ...body.modules };
            if (body?.globals && typeof body.globals === 'object') next.globals = { ...(cur.globals           ?? {}), ...body.globals };
            if (typeof settingsScope.set === 'function') settingsScope.set(next);
          }
        } catch { /* contained */ }
        // 4) 回传合并后的完整状态（客户端据此恢复；配合客户端 localStorage 双保险）
        return {
          ok: true, saved: true,
          language: panel.language ?? 'zh',
          ultraActive: !!panel.ultraActive,
          guardEnabled,
          sliders: { ...DEFAULT_SLIDERS, ...(panel.sliders ?? {}) },
          modules: { ...DEFAULT_MODULES, ...(panel.modules ?? {}) },
          globals: { ...DEFAULT_GLOBALS, ...(panel.globals ?? {}) },
          metacog: state.metacog || cloneMetacog(),
          labConfig: state.labConfig || cloneLabConfig(),
          oc: state.oc || cloneOc(),
          authorizeCalls: !!state.authorizeCalls,
          authorizeProbability: state.authorizeProbability,
          ultraCore: state.ultraCore || panel.ultraCore || {},
          prefs: state.prefs || panel.prefs || '',
          capability: (typeof state.capability === 'number' ? state.capability : (typeof panel.capability === 'number' ? panel.capability : 5)),
        };
      } catch (e) { log.warn('settings', 'settingsSync failed: ' + String(e)); return { ok: false }; }
    },
    emitEvent: (e            ) => publishEvent(e),
    // 授权弹窗决定回执：前端点允许/拒绝 -> 放行/终止挂起的模型调用请求
    authorizeDecide: async (body) => {
      const hit = authorizeGate.decide(String(body?.reqId ?? ''), body?.allowed === true);
      log.info('authorize', 'call decide allowed=' + (body?.allowed === true) + ' hit=' + hit);
      return { ok: true, hit };
    },
    getAuthorizeGate: () => authorizeGate,
    setObjective,
    getObjective,
    // v0.3 essence：偏好指令访问（agent-hooks mwPrefs 消费）
    getPrefs: () => state.prefs || panel.prefs || '',
    selectModelConfig: (k) => selectModelConfig(k),
    getModelSlots: () => state.modelSlots || panel.modelSlots || null,
    compactionAvailable: () => typeof ctx.get === 'function' && ctx.get('compaction') !== undefined,
    compactNow: async (agent     , source        ) => {
      const compaction = ctx.get('compaction');
      if (!compaction || typeof compaction.compactNow !== 'function') return;
      await agent.runMaintenance((signal                      ) => compaction.compactNow(agent, signal, source));
    },
    activate: async (req   
                                                       
                                                                                                  
                           
     ) => {
      try {
        state.active = true;
        try { if (settingsScope && typeof settingsScope.get === 'function' && typeof settingsScope.set === 'function') { const cur = (settingsScope.get() ?? {})                           ; if (cur.ultraActive !== true) settingsScope.set({ ...cur, ultraActive: true }); } } catch { /* contained */ }
        const incomingSession = String(req.sessionId ?? "");
        if (incomingSession && incomingSession !== state.sessionId) state.modelKey = null; // 新会话等待 agent/created 用真实模型重路由
        state.sessionId = incomingSession;
        if (typeof req.snapshotDir === 'string' && req.snapshotDir.length > 0) activeSnapshotDir = req.snapshotDir;
        state.mode = String(req.mode ?? 'ultra');
        state.modules = { ...DEFAULT_MODULES, ...(req.modules ?? {}) }               ;
        state.globals = { ...DEFAULT_GLOBALS, ...(req.globals ?? {}) }               ;
        state.sliders = mergeLegacySliders({ ...DEFAULT_SLIDERS, ...(req.sliders ?? {}) })               ; // v0.3 essence：旧键归一
        if (req?.modelSlots && typeof req.modelSlots === 'object') { panel.modelSlots = req.modelSlots; state.modelSlots = req.modelSlots; }
        // 真实会话模型优先；仅当模型尚未被 agent/created 检测到时，才用前端编辑 tab 临时兜底
        const tuRouteKey = state.modelKey || req?.selectedModel || null;
        log.debug('global', 'modules/globals/sliders synced to Rust core');
        await ensureCore();
        await syncToCore();
        if (!compatReport) {
          try { compatReport = await core .compatCheck(harnessVersion); } catch (e) { compatReport = { error: String(e) }; }
          log.debug('compat', 'harness ' + harnessVersion + ': ' + JSON.stringify(compatReport));
        }
        publishEvent({ type: 'core-status', sessionId: state.sessionId, status: 'up', at: Date.now() });
        log.info('core', 'Ultra activated for session ' + state.sessionId + ' (mode=' + state.mode + ')');
        return { ok: true, extremeUnlocked: cfgOutcome.extremeUnlocked, coreVersion };
      } catch (err) {
        state.active = false;
        log.error('core', 'activation failed: ' + String(err instanceof Error ? err.message : err));
        return { ok: false, extremeUnlocked: cfgOutcome.extremeUnlocked, coreVersion, error: String(err instanceof Error ? err.message : err) };
      }
    },
    deactivate: async () => {
      const wasActive = state.active;
      state.active = false;
      try { if (settingsScope && typeof settingsScope.get === 'function' && typeof settingsScope.set === 'function') { const cur = (settingsScope.get() ?? {})                           ; if (cur.ultraActive !== false) settingsScope.set({ ...cur, ultraActive: false }); } } catch { /* contained */ }
      if (core) {
        const c = core;
        core = null;
        coreVersion = null;
        await c.stop();
      }
      if (wasActive) {
        publishEvent({ type: 'core-status', sessionId: state.sessionId, status: 'down', at: Date.now() });
        log.info('core', 'Ultra deactivated: core stopped, resources released');
      }
    },
    extremeUnlocked: () => cfgOutcome.extremeUnlocked,
    // ---- v0.11-RC2 内核层桥：元认知八层 / 多智能体调度 / Task 监护（真实数据流，非摆设） ----
    metacognition: {
      // 能力边界评估 + 难度预判（agent/created 时调用；真实输入输出）
      assess: (taskText) => {
        try {
          const engine = getMetacognitionEngine();
          const assessment = engine.assessCapability(String(taskText || '').slice(0, 2000));
          const plan = engine.planExecution(String(taskText || '').slice(0, 2000));
          log.debug('metacognition', 'assessed complexity=' + assessment.complexity + ' confidence=' + assessment.confidence + ' steps=' + plan.steps.length);
          return { assessment, plan };
        } catch (e) { log.warn('metacognition', 'assess failed: ' + String(e)); return null; }
      },
      // 中间结果自校验 + 执行效果自量化（agent/turn-stopping 时调用）
      verifyAndQuantify: (output, objective, turn) => {
        try {
          const engine = getMetacognitionEngine();
          const checks = engine.verifyIntermediateResult(String(output || '').slice(0, 4000), Number(turn) || 0);
          const metrics = engine.quantifyExecution(String(output || '').slice(0, 4000), String(objective || '').slice(0, 400));
          log.debug('metacognition', 'turn ' + turn + ' verify=' + (checks.passed ? 'pass' : 'fail') + ' quality=' + metrics.qualityScore + ' overall=' + metrics.overallScore);
          return { checks, metrics };
        } catch (e) { log.warn('metacognition', 'verify failed: ' + String(e)); return null; }
      },
      // 错误自回溯（review 未通过时调用，真实失败路径）
      selfCorrect: (error, context) => {
        try {
          const engine = getMetacognitionEngine();
          const res = engine.selfCorrect(error || new Error('review failed'), context);
          log.debug('metacognition', 'selfCorrect iteration=' + res.iteration + ' retry=' + res.shouldRetry);
          return res;
        } catch (e) { log.warn('metacognition', 'selfCorrect failed: ' + String(e)); return { shouldRetry: false }; }
      },
    },
    // 调度任务状态推进（agent 请求 = 真实调度任务：pending→running→completed/failed）
    taskTick: (taskId, status, error) => {
      try {
        const scheduler = getMultiAgentScheduler();
        const guardian = getTaskGuardian();
        const resources = getResourceController();
        // 未注册的 agent 任务自动注册（长任务：10 分钟超时、high 优先级、死锁检测兜底）
        if (!scheduler.getTaskStatus(taskId)) {
          scheduler.registerTask(taskId, { name: taskId, priority: 'high', timeoutMs: state.longTaskMs || 600000, maxRetries: 3, resourceRequirements: { cpu: 15, memory: 15, io: 5 } });
        }
        // v0.11-RC2 资源侧：agent 任务登记到资源控制器（真实 CPU/内存/IO 占用与闲置释放）
        if (!resources.resourceTasks.has(taskId)) {
          resources.registerTask(taskId, { priority: 'high', cpuRequirement: 15, memoryRequirement: 50, ioRequirement: 5 });
        }
        if (status === 'running') {
          scheduler.updateTaskState(taskId, 'running');
          resources.updateTaskActivity(taskId);
        } else if (status === 'completed') {
          scheduler.updateTaskState(taskId, 'completed', { ok: true });
          resources.unregisterTask(taskId);
          guardian.recordSuccess(taskId);
        } else if (status === 'failed') {
          scheduler.updateTaskState(taskId, 'failed', null, error || new Error('unknown'));
          resources.unregisterTask(taskId);
          // v0.11-RC2 字符串加密：失败详情经混淆器编码后入监护日志（防内部结构泄露；诊断时解码）
          let guardedError = error || new Error('unknown');
          try {
            const obf = getControlFlowObfuscator();
            const raw = String((error || {}).message || 'unknown');
            const encoded = obf.obfuscateString(raw);
            guardedError = new Error(encoded);
            const roundtrip = obf._decodeString(encoded);
            if (roundtrip !== raw) log.warn('obfuscator', 'string roundtrip mismatch (contained)');
          } catch (e) { /* contained */ }
          guardian.recordFailure(taskId, guardedError);
          const diagnosis = guardian.diagnoseFailure(error || new Error('unknown'));
          if (diagnosis.diagnoses.some((d) => d.severity === 'high')) {
            log.warn('guardian', 'task ' + taskId + ' failed: ' + diagnosis.message);
          }
        }
      } catch (e) { log.warn('kernel', 'taskTick failed: ' + String(e)); }
    },
    adapterReport: () => ({ ...adapterReport }),
    runBench: async () => {
      await ensureCore();
      if (!core) return { composite: 0, multipleVsNativeMax: 0, inTargetRange: false, degraded: true, reason: 'native-core-unavailable' };
      await syncToCore();
      const report = await core .bench();
      publishEvent({
        type: 'bench', sessionId: state.sessionId, at: Date.now(),
        composite: Number((report                          ).composite ?? 0),
        multiple: Number((report                                    ).multipleVsNativeMax ?? 0),
        inTargetRange: Boolean((report                               ).inTargetRange),
      });
      return report;
    },
    runStress: async (hours        ) => {
      await ensureCore();
      if (!core) return { turns: 0, health: 1, memoryStable: true, elapsedMs: 0, degraded: true, reason: 'native-core-unavailable' };
      await syncToCore();
      const report = await core .stress(hours);
      publishEvent({
        type: 'stress', sessionId: state.sessionId, at: Date.now(),
        turns: Number((report                      ).turns ?? 0),
        health: Number((report                       ).health ?? 0),
        memoryStable: Boolean((report                              ).memoryStable),
        elapsedMs: Number((report                          ).elapsedMs ?? 0),
      });
      return report;
    },
    parseProjectIntoAgent: async (sessionId        ) => {
      try {
        const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
        if (!agents || typeof agents.get !== 'function') return { ok: false, injected: false, error: 'agent registry unavailable' };
        const agent = agents.get(sessionId);
        if (!agent) return { ok: false, injected: false, error: 'agent not found' };
        const cwd = agent.session?.header?.cwd;
        if (!cwd) return { ok: false, injected: false, error: 'agent has no cwd' };
        await ensureCore();
        const digest = await core .projectParse(cwd)                                                                                ;
        if (!digest.fileCount) return { ok: true, injected: false, error: 'no parseable files' };
        agent.inject({ role: 'user', content: '【Think 项目解析】当前工程 ' + digest.fileCount + ' 个文件、' + (digest.definitionCount ?? 0) + ' 处定义；入口候选：' + (digest.entryCandidates ?? []).slice(0, 5).join('、') });
        return { ok: true, injected: true };
      } catch (err) {
        return { ok: false, injected: false, error: String(err instanceof Error ? err.message : err) };
      }
    },
    reloadConfig: async () => {
      const next = loadLocalConfig();
      const nextMerged = mergeConfig(next.config, {
        modules: { ...DEFAULT_MODULES },
        globals: { ...DEFAULT_GLOBALS },
        sliders: { ...DEFAULT_SLIDERS },
      });
      state.extreme = next.extremeUnlocked;
      state.extremeUnlocked = next.extremeUnlocked;
      if (!state.active) {
        state.modules = { ...DEFAULT_MODULES, ...(nextMerged.modules ?? {}) }               ;
        state.globals = { ...DEFAULT_GLOBALS, ...(nextMerged.globals ?? {}) }               ;
        state.sliders = { ...DEFAULT_SLIDERS, ...(nextMerged.sliders ?? {}) }               ;
      }
      if (core) await syncToCore();
      return { ok: true, extremeUnlocked: next.extremeUnlocked, error: next.error };
    },
  };

  // ---- Ultra effort injection (native model/effort selector) ----
  // alpha.5(0.1.2-alpha.5) 起原生推理档回退为 Off/Low/High/Max（移除了 alpha.3/alpha.4 的原生 Ultra），
  // 因此默认启用透明 adapter 包装，给 resolveModel 的 efforts 补回 Ultra 行，并在 wire 层把 ultra→max。
  // 包装幂等（原生已含 ultra 不重复加），且 Proxy 对未改写方法统一 bind 回原始 adapter、不碰其私有字段，
  // 所以在 alpha.3（原生含 Ultra）下同样安全、不会让模型选择器消失。
  // 仅当显式 DSH_BYPASS_ULTRA_ADAPTER=1 时旁路（旧策略逃生开关）。
  const BYPASS_ADAPTER = (() => { try { return String(process.env.DSH_BYPASS_ULTRA_ADAPTER || '') === '1'; } catch { return false; } })();
  const INJECT_ULTRA = !BYPASS_ADAPTER;
  log.info('ultra-adapter', 'effort strategy: harness=' + harnessVersion + ' injectUltra=' + INJECT_ULTRA + (BYPASS_ADAPTER ? ' (adapter bypassed)' : ' (transparent adapter wrap)'));
  const installer = new UltraAdapterInstaller(ctx.llm, log);
  let adapterReport = { wrapped: 0, failed: [] };
  const mergeReport = (r) => { adapterReport = { wrapped: adapterReport.wrapped + (r.wrapped || 0), failed: [...adapterReport.failed, ...(r.failed || [])].slice(0, 20), ...(r.native ? { native: true } : {}) }; };
  const safeTimeout = (fn, ms) => { const t2 = setTimeout(fn, ms); return () => clearTimeout(t2); };
  const rewrap = () => { if (!INJECT_ULTRA) return; try { mergeReport(installer.install()); } catch (e) { log.warn('ultra-adapter', 'rewrap failed: ' + String(e)); } };
  let offUpdated = () => {};
  let timers = [];
  if (INJECT_ULTRA) {
    mergeReport(installer.install());
    log.info('ultra-adapter', 'initial wrap: ' + JSON.stringify(adapterReport));
    offUpdated = ctx.on('llm/adapters-updated', () => rewrap());
    // 官方 adapter 多为异步注册，前几次启动时逐步补包，保证不漏 wrap。
    timers = [400, 1200, 3000, 8000, 16000].map((ms) => safeTimeout(rewrap, ms));
  } else {
    adapterReport = { wrapped: 0, failed: [], native: true };
    log.info('ultra-adapter', 'ultra adapter injection bypassed by DSH_BYPASS_ULTRA_ADAPTER (harness ' + harnessVersion + ')');
  }

  // ---- Harness 设置面板集成（公开 API：ctx.settings.register，schemastery schema）----
  ctx.inject(['settings'], (sctx     ) => {
    try {
      settingsScope = sctx.settings.register('thinkingUltra', Schema.object({
        language: Schema.union(['zh', 'en']).default('zh').description('Language / 语言（界面语言）'),
        ultraActive: Schema.boolean().default(false).description('Ultra Thinking / Ultra思考（开启即弹出调节面板）'),
        guardEnabled: Schema.boolean().default(true).description('Essence pre-review guard / 常驻本质预审守护'),
        extremeUnlocked: Schema.boolean().default(false).description('Extreme tier unlock / 极高内核解锁'),
        sliders: Schema.dict(Schema.number().min(0).max(6).step(1)).default({}).description('Essence sliders / 本质滑杆（六条：deep/branch/memory/code/vision/safety）'),
        modules: Schema.dict(Schema.boolean()).default({}).description('Core modules / 核心功能模块'),
        globals: Schema.dict(Schema.boolean()).default({}).description('Global switches / 全局总开关'),
        prefs: Schema.string().max(40000).default('').description('Preference directives / 偏好指令（Pro≤40000字，Flash/Vision≤16000字，自动保存并注入每次回答）'),
      }), { base: {} });
      settingsScope.watch(() => {
        try {
          const v = settingsScope.get()                                                ;
          publishEvent({ type: 'settings', sessionId: state.sessionId, language: v?.language ?? 'zh', ultraActive: !!v?.ultraActive, at: Date.now() });
          log.debug('settings', 'settings changed: ' + JSON.stringify(v));
        } catch { /* contained */ }
      });
    } catch (e) { log.warn('settings', 'settings service unavailable: ' + String(e)); }
  });

  // ---- agent loop hooks + http routes ----
  let disposeHooks = () => {};
  try { disposeHooks = installAgentHooks(ctx, services); } catch (e) { log.warn('hooks', 'install agent hooks failed: ' + String(e)); }
  const disposeHttp = installHttp(ctx, services);

  log.info('core', 'Think v' + PLUGIN_VERSION + ' host plane ready (harness ' + harnessVersion + ', compat=' + hostCompat.level + '/' + hostCompat.note + ')');

  // ============================================================
  // v0.11-RC2 内核层后台常驻进程启动（全部静默运行，不触碰前端可视层）
  // ============================================================
  let disposeKernel = () => {};
  try {
    startLoadTimer();
    for (const m of getLoadOrder()) { markLoadStart(m); markLoaded(m, { version: PLUGIN_VERSION }); }
    endLoadTimer();

    startGuardian({ statePersistencePath: join(activeSnapshotDir, 'guardian-state.json'), failureThreshold: 5, recoveryTimeout: 30000, heartbeatInterval: 5000 });
    startScheduler();
    startResourceController();
    startRenderScheduler(publishEvent);
    // Shipped builds never run debugger/anti-debug probes on the user machine.
    try { stopAntiDebug(); } catch { /* ensure no latent probe timer */ }
    startMetacognition();
    startInputMonitor();
    startStabilityGuard();

    registerMonitoredTask('core-bridge', { name: 'Rust核心桥接', timeoutMs: 15000, modelKey: state.model });
    registerMonitoredTask('agent-hooks', { name: 'Agent循环钩子', timeoutMs: 10000, modelKey: state.model });
    registerMonitoredTask('slider-pipeline', { name: '滑杆调度管道', timeoutMs: 8000, modelKey: state.model });
    registerTaskPriority('core-bridge', 'critical');
    registerTaskPriority('agent-hooks', 'high');
    registerTaskPriority('slider-pipeline', 'high');
    registerBoundaryCheck('config-valid', () => !!state && typeof state === 'object');
    registerBoundaryCheck('core-running', () => !core || core.running());

    log.info('kernel', 'v0.10 内核层后台进程已启动: guardian/scheduler/resource/render/metacognition/input-monitor/stability-guard');
    disposeKernel = () => {
      try { stopGuardian(); } catch { /* contained */ }
      try { stopScheduler(); } catch { /* contained */ }
      try { stopResourceController(); } catch { /* contained */ }
      try { stopRenderScheduler(); } catch { /* contained */ }
      try { stopAntiDebug(); } catch { /* contained */ }
      try { stopMetacognition(); } catch { /* contained */ }
      try { stopInputMonitor(); } catch { /* contained */ }
      try { stopStabilityGuard(); } catch { /* contained */ }
      try { unregisterMonitoredTask('core-bridge'); } catch { /* contained */ }
      try { unregisterMonitoredTask('agent-hooks'); } catch { /* contained */ }
      try { unregisterMonitoredTask('slider-pipeline'); } catch { /* contained */ }
      log.info('kernel', 'v0.11-RC2 内核层后台进程已停止');
    };
  } catch (e) {
    log.warn('kernel', '内核层后台进程启动失败: ' + String(e));
  }

  return () => {
    for (const t of timers) { try { t(); } catch { /* contained */ } }
    try { offUpdated(); } catch { /* contained */ }
    try { disposeHttp(); } catch { /* contained */ }
    disposeHooks();
    installer.restore();
    // v0.11-RC2: 停止内核层后台常驻进程
    try { disposeKernel(); } catch { /* contained */ }
    const procNow = core;
    services.deactivate().catch(() => { /* contained */ });
    // 兜底：优雅关闭超时前，1.2s 后强制终结，确保 unmount 后进程归零
    if (procNow) { setTimeout(() => { try { procNow.killNow(); } catch { /* contained */ } }, 1200); }
    log.info('core', 'Think host plane disposed');
  };
}

