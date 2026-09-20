// Client <-> host IPC: routes registered on the harness's own webserver.
//   POST /thinking-ultra/api/state          activate/deactivate + sync config
//   GET  /thinking-ultra/api/state          current state snapshot
//   POST /thinking-ultra/api/bench          run the internal quality benchmark
//   POST /thinking-ultra/api/stress         run the accelerated stress test
//   POST /thinking-ultra/api/project-parse  parse cwd and inject the digest
//   POST /thinking-ultra/api/snapshot-save  force a snapshot
//   GET  /thinking-ultra/events             SSE: drift/snapshot/review/log stream
// Everything is same-origin loopback through the harness web server — no
// external network is ever involved.

                                         
                                                   
                                                                    
import { API_PREFIX, EVENTS_PATH } from '../shared/constants.js';

                               
                         
                                                                                                                                                                                                                            
                              
                               
                
                                 
                             
                                                          
                               
                                             
                                                                                                        
                                                                                     
                                                                                                                                               
                                                                                             
 

function sendJson(res     , code        , body         ) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
  });
  res.end(text);
}

function readBody(req     )                  {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks           = [];
    req.on('data', (c        ) => {
      size += c.length;
      if (size > 65536) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function installHttp(ctx     , services              )             {
  let benchRunning = false;
  let stressRunning = false;
  const routeDisposers                 = [];

  ctx.inject(['webServer'], (wsCtx     ) => {
    const webServer = wsCtx.webServer;

    const reg = webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req     , res     ) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const path = url.pathname.slice(API_PREFIX.length) || '/state';
          if (path === '/state' && req.method === 'GET') {
            const s = services.getState();
            let coreState          = null;
            try {
              const c = services.getCore();
              if (c?.running()) coreState = await c.call('state.get');
            } catch { coreState = null; }
            const adapter = typeof services.adapterReport === 'function' ? services.adapterReport() : null;
            // 面板状态（guardEnabled/language 等）随 /state 回传，客户端挂载据此恢复
            const panel = typeof services.panelState === 'function' ? services.panelState() : null;
            sendJson(res, 200, {
              ok: true,
              state: s,
              guardEnabled: panel ? panel.guardEnabled : undefined,
              language: panel ? panel.language : undefined,
              prefs: panel ? panel.prefs : undefined, // v0.3 essence：偏好指令回传（客户端首拉恢复）
              coreState,
              coreRunning: services.getCore()?.running() ?? false,
              extremeUnlocked: services.extremeUnlocked(),
              adapter,
            });
            return;
          }
          if (path === '/state' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (body && body.active === false) {
              await services.deactivate();
              sendJson(res, 200, { ok: true, active: false });
              return;
            }
            const r = await services.activate(body);
            sendJson(res, r.ok ? 200 : 400, r);
            return;
          }
          if (path === '/bench' && req.method === 'POST') {
            if (benchRunning) { sendJson(res, 409, { ok: false, error: 'bench already running' }); return; }
            benchRunning = true;
            try { sendJson(res, 200, { ok: true, report: await services.runBench() }); }
            finally { benchRunning = false; }
            return;
          }
          if (path === '/stress' && req.method === 'POST') {
            if (stressRunning) { sendJson(res, 409, { ok: false, error: 'stress already running' }); return; }
            const body = JSON.parse(await readBody(req));
            const hours = Math.min(Math.max(Number(body?.hours ?? 0), 0.05), 24);
            stressRunning = true;
            try { sendJson(res, 200, { ok: true, report: await services.runStress(hours) }); }
            finally { stressRunning = false; }
            return;
          }
          if (path === '/project-parse' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await services.parseProjectIntoAgent(String(body?.sessionId ?? '')));
            return;
          }
          if (path === '/snapshot-save' && req.method === 'POST') {
            const core = services.getCore();
            if (!core) { sendJson(res, 400, { ok: false, error: 'core not running' }); return; }
            sendJson(res, 200, { ok: true, snapshot: await core.snapshotSave() });
            return;
          }
          if (path === '/config-reload' && req.method === 'POST') {
            sendJson(res, 200, await services.reloadConfig());
            return;
          }
          if (path === '/essence-approve' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await services.essenceApprove(body));
            return;
          }
          if (path === '/settings-sync' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await services.settingsSync(body));
            return;
          }
          if (path === '/authorize-decide' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await services.authorizeDecide(body));
            return;
          }
          sendJson(res, 404, { ok: false, error: 'unknown endpoint' });
        } catch (err) {
          services.log.warn('http', 'api error: ' + String(err instanceof Error ? err.message : err));
          try { sendJson(res, 500, { ok: false, error: String(err instanceof Error ? err.message : err) }); } catch { /* contained */ }
        }
      },
    });

    const reg2 = webServer.register({
      kind: 'prefix',
      path: EVENTS_PATH,
      handler: (req     , res     ) => {
        if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('retry: 3000\n\n');
        const send = (e            ) => {
          try { res.write('event: ultra\ndata: ' + JSON.stringify(e) + '\n\n'); } catch { /* client gone */ }
        };
        const offEvent = subscribeEvents(send);
        const offLog = services.log.subscribe((entry) => {
          if (!entry) return;
          send({ type: 'debug-log', sessionId: '', level: entry.level, module: entry.module, message: entry.message, at: entry.at });
        });
        const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* contained */ } }, 15000); if (typeof heartbeat.unref === 'function') heartbeat.unref();
        req.on('close', () => { clearInterval(heartbeat); offEvent(); offLog(); });
      },
    });
    if (typeof reg === 'function') routeDisposers.push(reg);
    if (typeof reg2 === 'function') routeDisposers.push(reg2);
  });
  // 显式回收：unmount 时逐一注销路由（不依赖 inject 主体语义，任何
  // webServer 实现下都无残留副作用）
  return () => {
    for (const d of routeDisposers) {
      try { d(); } catch { /* contained */ }
    }
    routeDisposers.length = 0;
  };
}

// simple event fan-out for SSE subscribers
const eventListeners = new Set                         ();
export function subscribeEvents(fn                         )             {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}
export function publishEvent(e            )       {
  for (const fn of eventListeners) { try { fn(e); } catch { /* contained */ } }
}

