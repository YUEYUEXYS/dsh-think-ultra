// Rust core bridge: spawns the thinking-ultra-core daemon, runs the
// line-delimited JSON-RPC over stdio, and owns the process lifecycle.
// The daemon is fully local (no network in either direction) and is
// stopped + reaped the moment Ultra deactivates.

import { spawn } from 'node:child_process';
                                                       
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
                                         
                                                                                                    

export class CoreBridge {
          proc                      = null;
          nextId = 1;
          pending = new Map                                                                                                             ();
          readyResolve                      = null;
          readyReject                              = null;
          ready = false;
          readyTimer                                       = null;
          log          ;
          binaryPath         ;

  constructor(log          , binaryPath         ) {
    this.log = log;
    this.binaryPath = binaryPath;
  }

  static defaultBinaryPath()         {
    return join(
      dirname(fileURLToPath(import.meta.url)),
      '..', 'native',
      process.platform === 'win32' ? 'thinking-ultra-core.exe' : 'thinking-ultra-core',
    );
  }

  running()          { return this.proc !== null; }

  start()                {
    if (this.proc) return Promise.resolve();
    const bin = this.binaryPath ?? CoreBridge.defaultBinaryPath();
    if (!existsSync(bin)) {
      return Promise.reject(new Error('thinking-ultra-core binary missing at ' + bin + ' (run the plugin build first)'));
    }
    const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc = child;
    this.ready = false;
    this.log.info('core', 'starting core daemon: ' + bin);

    const readyPromise = new Promise      ((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimer = setTimeout(() => {
      if (this.ready) return;
      // 就绪超时必须回收没起来的子进程并清空 proc：否则 proc 非空会让 ensureCore 永久复用死实例，一次失败后再无法自愈
      const err = new Error('core daemon did not become ready within 15s');
      try { this.proc?.kill(); } catch { /* contained */ }
      this.onExit(err);
    }, 15000);
    if (typeof this.readyTimer.unref === 'function') this.readyTimer.unref();

    const rl = createInterface({ input: child.stdout  });
    rl.on('line', (line) => this.onLine(line));
    child.stderr .on('data', (d) => {
      const text = String(d).trim();
      if (text) this.log.warn('core', 'stderr: ' + text.slice(0, 400));
    });
    child.on('error', (err) => this.onExit(err));
    child.on('exit', (code, signal) => this.onExit(new Error('core exited code=' + code + ' signal=' + signal)));
    return readyPromise;
  }

          onLine(line        ) {
    let msg                 ;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id === null && msg.result && typeof msg.result === 'object' && (msg.result                           ).ready === true) {
      this.ready = true;
      if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
      if (this.readyResolve) { this.readyResolve(); this.readyResolve = null; }
      this.log.info('core', 'core daemon ready');
      return;
    }
    if (msg.id === null) return;
    const waiter = this.pending.get(msg.id);
    if (!waiter) return;
    this.pending.delete(msg.id);
    clearTimeout(waiter.timer);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new Error(String(msg.error ?? 'core error')));
  }

          onExit(err       ) {
    this.ready = false;
    if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
    if (this.readyReject) { this.readyReject(err); this.readyReject = null; }
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('core exited: ' + err.message));
    }
    this.pending.clear();
    if (this.proc) {
      this.log.error('core', 'core daemon exited: ' + err.message);
    }
    this.proc = null;
  }

  async call             (method        , params                          , timeoutMs = 30000)             {
    if (!this.proc || !this.ready) throw new Error('core not running');
    const id = this.nextId++;
    const promise = new Promise         ((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('core timeout: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    const w = this.proc.stdin;
    const failWrite = (e) => { const p = this.pending.get(id); if (p) clearTimeout(p.timer); this.pending.delete(id); return Promise.reject(e); };
    if (!w || !w.writable) return failWrite(new Error('core stdin unavailable: ' + method));
    try { w.write(JSON.stringify({ id, method, params }) + '\n'); } catch (wErr) { return failWrite(wErr); }
    return promise              ;
  }

  async syncState(state            , objective        , harnessVersion        , snapshotDir         , kvBudgetTokens         , branchCount         ) {
    await this.call('state.set', {
      mode: state.mode,
      ultraActive: state.active,
      modules: state.modules,
      globals: state.globals,
      sliders: state.sliders,
      extreme: state.extreme,
      harnessVersion,
      snapshotDir: snapshotDir ?? null,
    });
    await this.call('objective.set', { objective });
    if (typeof kvBudgetTokens === 'number') await this.call('state.set', { kvBudgetTokens });
    if (typeof branchCount === 'number') await this.call('state.set', { branchCount });
  }

  async stop()                {
    if (!this.proc) return;
    const proc = this.proc;
    try { await this.call('shutdown', {}, 2000); } catch { /* ignore */ }
    const dead = new Promise      ((resolve) => {
      const t = setTimeout(() => { proc.kill(); resolve(); }, 1000);
      proc.once('exit', () => { clearTimeout(t); resolve(); });
    });
    await dead;
    this.proc = null;
    this.ready = false;
    this.log.info('core', 'core daemon stopped');
  }

  /** 同步兜底：unmount 时无条件终结进程（快照已持久化，无状态损失） */
  killNow()       {
    try { this.proc?.kill(); } catch { /* contained */ }
  }

  bench()                       { return this.call             ('bench.quality'); }
  stress(hours        )                        {
    return this.call              ('stress.run', { hours, turnsPerHour: 120, seed: Date.now() % 2147483647 });
  }
  review(output        , objective        ) { return this.call('review.run', { output, objective }); }
  turnAdd(output        ) { return this.call('turn.add', { output }); }
  driftCheck() { return this.call('drift.check'); }
  snapshotSave() { return this.call('snapshot.save'); }
  snapshotRollback(id         ) { return this.call('snapshot.rollback', id === undefined ? {} : { id }); }
  projectParse(root        ) {
    return this.call('project.parse', { root, maxFiles: 2000, maxBytesPerFile: 262144, maxTotalBytes: 67108864, maxDepth: 24 });
  }
  compatCheck(harnessVersion        ) { return this.call('compat.check', { harnessVersion }); }
  memStats() { return this.call('mem.stats'); }
  cacheOptimize(messages           , budget        ) {
    return this.call('cache.optimize', { messages, budget });
  }
  branchesPlan(objective        ) { return this.call('branches.plan', { objective }); }

  // —— v0.10 S-level cores (turn-level async heavy compute) ——
  // The synchronous injection path uses the JS mirror aggregation-core.js
  // (proven formula-identical by cargo test t23); these RPCs drive the deep
  // multi-step reasoning kernels off the hot path.
  aggregateRun(sliders, model, budgetTokens) {
    return this.call('aggregate.run', { sliders, model, budgetTokens });
  }
  reasoningTournament(params) { return this.call('reasoning.tournament', params || {}); }
  proofCheck(params) { return this.call('proof.check', params || {}); }
  bayesFuse(params) { return this.call('bayes.fuse', params || {}); }
  topologyBuild(params) { return this.call('topology.build', params || {}); }
  convergenceStep(params) { return this.call('convergence.step', params || {}); }
  provenanceAnalyze(params) { return this.call('provenance.analyze', params || {}); }
  reflectionRun(params) { return this.call('reflection.run', params || {}); }
  fieldEvolve(params) { return this.call('field.evolve', params || {}); }
  primitivesExecute(params) { return this.call('primitives.execute', params || {}); }
  blackboardDeliberate(params) { return this.call('blackboard.deliberate', params || {}); }

  // v0.10 元认知核心舱：按 metacog-director 归约出的 activeKernels 逐个驱动 Rust S 级内核。
  // 每个内核独立 try/catch，单点失败必须隔离、不拖垮其余；结果回传供注入层/日志核对。
  async runMetacog(directed, context = {}) {
    if (!directed || !Array.isArray(directed.activeKernels) || !directed.activeKernels.length) {
      return { ok: true, level: directed ? directed.level : 0, ran: [] };
    }
    const dispatch = {
      'reasoning.tournament': (p) => this.reasoningTournament(p),
      'blackboard.deliberate': (p) => this.blackboardDeliberate(p),
      'bayes.fuse': (p) => this.bayesFuse(p),
      'reflection.run': (p) => this.reflectionRun(p),
      'topology.build': (p) => this.topologyBuild(p),
      'provenance.analyze': (p) => this.provenanceAnalyze(p),
      'proof.check': (p) => this.proofCheck(p),
      'field.evolve': (p) => this.fieldEvolve(p),
      'primitives.execute': (p) => this.primitivesExecute(p),
      'convergence.step': (p) => this.convergenceStep(p),
      'aggregate.run': (p) => this.aggregateRun(p.sliders, p.model, p.budgetTokens),
    };
    const ran = [];
    for (const k of directed.activeKernels) {
      let fn = dispatch[k.name];
      try {
        let result;
        if (typeof fn === 'function') {
          result = await fn(Object.assign({}, k.params, context || {}));
        } else {
          // 通用兜底：任何已在 Rust main.rs 注册的 RPC（元规则/模态/跨模型/防护/总装等）都能被驱动
          result = await this.call(k.name, Object.assign({}, k.params, context || {}));
        }
        ran.push({ name: k.name, ok: true, result });
      } catch (e) {
        ran.push({ name: k.name, ok: false, error: String((e && e.message) || e) });
      }
    }
    // 顶层总装：把档位/开关/预算编排成确定性波次计划（失败隔离，不影响主路径）
    // 同时跑策略编译器，把海量配置归约为有限策略类并给出“只强不弱”指纹。
    try {
      const plan = await this.call('ultra.plan', Object.assign({
        model: context.model || 'pro',
        level: directed.level,
        budgetTokens: context.budgetTokens || 48000,
      }, directed.flags || {}, context.labConfig || {}));
      let policy = null;
      try {
        policy = await this.call('policy.compile', Object.assign({
          model: context.model || 'pro',
          level: directed.level,
          devUnlocked: !!(directed.flags && directed.flags.probField),
        }, directed.flags || {}, context.domainVector || {}, { labConfig: context.labConfig || null }));
      } catch { policy = null; }
      return { ok: true, level: directed.level, budgetMult: directed.budgetMult, ran, plan, policy };
    } catch (e) {
      return { ok: true, level: directed.level, budgetMult: directed.budgetMult, ran, planError: String((e && e.message) || e) };
    }
  }
}

