// Ultra 推理档位注入: makes the NATIVE model-selection dropdown show an
// 'Ultra' effort row without touching any harness source. The llm runtime's
// effort vocabulary comes from adapter-declared model info; we wrap the
// already-registered provider adapter with a proxy that
//   1. appends { id:'ultra', name:'Ultra' } to resolveModel()'s efforts,
//   2. maps reasoningEffort 'ultra' back to a wire-valid effort ('max' or
//      the model's default) inside stream() so the real API never sees it.
// When the compat layer cannot recognize the registration shape, the client
// falls back to a 1:1-styled replica dropdown (slot shadowing).

                                         

                                                             
                                 
                                     
                                                               
 

                                    
                  
                   
 

                              
                                                                
                         
 

export function withUltraEffort(info) {
  // 全防御：任何非预期结构/异常都原样返回 info，绝不让模型解析链路抛错（否则原生模型选择器会消失）
  try {
    if (!info || !info.reasoning) return info;
    const base = info.reasoning.efforts;
    if (!Array.isArray(base)) return info;
    const efforts = [...base];
    if (!efforts.some((e) => e && e.id === 'ultra')) {
      efforts.push({ id: 'ultra', name: 'Ultra' });
    }
    return { ...info, reasoning: { ...info.reasoning, efforts } };
  } catch { return info; }
}

function wireEffortFor(modelInfo                                                       , requested                    )                     {
  if (requested !== 'ultra') return requested;
  // 底座必须保持 MAX 思考：Ultra 档在 wire 层映射回 'max'（DeepSeek 合法 effort），
  // 真正的超越来自插件的注入层（提示增强），底座不能弱于原生 Max。
  // per-model 信息独立传入：flash/pro 各自解析，互不覆盖。
  const efforts = modelInfo?.reasoning?.efforts ?? [];
  if (efforts.some((e) => e && e.id === 'max')) return 'max';
  if (modelInfo?.reasoning?.defaultEffort) return modelInfo.reasoning.defaultEffort;
  return efforts.length > 0 ? efforts[efforts.length - 1].id : undefined;
}

export class UltraAdapterInstaller {
          wrapped = new Map                                               ();
          proxies = new WeakSet();
          disposed = false;
          llm                ;
          log          ;

  constructor(llm                , log          ) {
    this.llm = llm;
    this.log = log;
  }

  // alpha.5 起移除了公开的 llm.registration(id) 访问器，adapter 注册项改存于内部
  // `llm.adapters` Map（{adapter, provider, retryPolicy}）。这里同时兼容旧公开 API
  // 与 alpha.5 内部 Map；两者都拿不到才返回 null（全防御，绝不抛到模型解析链路）。
  registrationOf(providerId         ) {
    // 1) 旧版公开访问器（alpha.2/alpha.3 形状）
    try {
      const oldApi = this.llm.registration;
      if (typeof oldApi === 'function') {
        const r = oldApi.call(this.llm, providerId);
        if (r && typeof r === 'object' && ('adapter' in r)) return r;
      }
    } catch { /* fall through */ }
    // 2) alpha.5+ 内部 adapters Map
    try {
      const map = this.llm.adapters;
      if (map && typeof map.get === 'function') {
        const r = map.get(providerId);
        if (r && typeof r === 'object' && ('adapter' in r)) return r;
      }
    } catch { /* fall through */ }
    return null;
  }

  install()                    {
    const report                    = { wrapped: 0, failed: [] };
    let providers                    = [];
    try { providers = this.llm.listProviders(); } catch (err) {
      report.failed.push('listProviders: ' + String(err));
      return report;
    }
    for (const provider of providers) {
      try {
        const reg = this.registrationOf(provider.id);
        if (!reg || typeof reg !== 'object' || !('adapter' in reg)) {
          report.failed.push(provider.id + ': unrecognized registration shape');
          continue;
        }
        const cur = (reg                        ).adapter;
        // 幂等只认“当前 adapter 是否本安装器产出的 proxy”：DSH 在 adapters-updated 时
        // 可能换上全新原始 adapter（reg 对象不变），此时必须重新包，绝不能因 reg 处理过就跳过。
        if (this.proxies.has(cur)) continue;
        const original = cur;
        if (original === null || (typeof original !== 'object' && typeof original !== 'function')) {
          report.failed.push(provider.id + ': adapter is not an object');
          continue;
        }
        const proxy = this.makeProxy(original);
        (reg                        ).adapter = proxy;
        this.proxies.add(proxy);
        this.wrapped.set(reg, { original, proxy });
        report.wrapped += 1;
        this.log.info('ultra-adapter', 'Ultra effort advertised for provider ' + provider.id);
      } catch (err) {
        report.failed.push(provider.id + ': ' + String(err instanceof Error ? err.message : err));
      }
    }
    if (report.wrapped === 0 && report.failed.length === 0) {
      this.log.warn('ultra-adapter', 'no providers found to wrap; Ultra option will not appear in the dropdown');
    }
    return report;
  }

          makeProxy(original         )          {
    const target = original                                    ;
    // 每个 (provider, model) 独立缓存 resolveModel 的 efforts 信息：
    // flash / pro 的 Ultra 底座各自解析，严禁单值 lastInfo 互相覆盖。
    const effortInfos = new Map                                            ();
    const infoKey = (provider        , model        ) => provider + '/' + model;
    // 透明绑定缓存：未改写的方法统一 bind 回原始 adapter，保证方法内 this 永远是
    // 原始对象而非 Proxy——alpha 版 adapter 若使用私有字段/内部状态，this 落到 Proxy
    // 会抛 Illegal invocation 并使原生模型选择器整体解析失败（历史上“选择器消失”的根因）。
    const bound = new Map();
    const overrides = {
      resolveModel: async function (provider, model, signal) {
        const info = await target.resolveModel.call(target, provider, model, signal);
        if (info) effortInfos.set(infoKey(provider, model), info);
        return withUltraEffort(info);
      },
      resolveModelInfo: async function (provider, model, signal) {
        const fn = target.resolveModelInfo;
        const info = await fn.call(target, provider, model, signal);
        if (info) effortInfos.set(infoKey(provider, model), info);
        return withUltraEffort(info);
      },
      stream: function (options) {
        const info = options ? (effortInfos.get(infoKey(String(options.provider ?? ''), String(options.model ?? ''))) ?? null) : null;
        // 底座焊死 MAX：界面选 ultra（或任意档），wire 层一律映射为 DeepSeek 合法最高档 'max'，
        // 真正的档位差异由插件注入层实现；info 缺失也兜底 max，ultra 绝无可能漏到官方适配器。
        const wireEffort = options ? (wireEffortFor(info, 'ultra') || 'max') : undefined;
        const mapped = options ? { ...options, reasoningEffort: wireEffort } : options;
        return target.stream.call(target, mapped);
      },
      prepareCall: async function (provider, model, signal) {
        const call = await target.prepareCall.call(target, provider, model, signal);
        if (!call || typeof call !== 'object') return call;
        const p = String(provider ?? '');
        const m = String(model ?? '');
        const wiredInfo = withUltraEffort(call.model);
        if (wiredInfo) effortInfos.set(infoKey(p, m), wiredInfo);
        const originalCallStream = call.stream;
        const patchedStream = typeof originalCallStream === 'function'
          ? (options) => {
              const keyProvider = String(options?.provider ?? provider ?? '');
              const keyModel = String(options?.model ?? model ?? '');
              const info = effortInfos.get(infoKey(keyProvider, keyModel)) ?? wiredInfo ?? null;
              const wireEffort = options ? (wireEffortFor(info, 'ultra') || 'max') : undefined;
              const mapped = options ? { ...options, reasoningEffort: wireEffort } : options;
              return originalCallStream.call(call, mapped);
            }
          : originalCallStream;
        return { ...call, model: wiredInfo, stream: patchedStream };
      },
    };
    return new Proxy(target, {
      get(t, prop) {
        if (prop in overrides && typeof t[prop] === 'function') return overrides[prop];
        const v = t[prop];
        if (typeof v === 'function') {
          let f = bound.get(prop);
          if (!f) { f = v.bind(t); bound.set(prop, f); }
          return f;
        }
        return v;
      },
      set(t, prop, value) { try { t[prop] = value; } catch { /* contained */ } return true; },
      has(t, prop) { return prop in t; },
    });
  }

  restore()       {
    if (this.disposed) return;
    this.disposed = true;
    for (const [reg, { original }] of this.wrapped) {
      try { (reg                        ).adapter = original; } catch { /* contained */ }
    }
    this.wrapped.clear();
    this.log.info('ultra-adapter', 'restored original adapters (Ultra effort withdrawn)');
  }
}

