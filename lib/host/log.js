// Host-plane debug log: ring buffer + listener fan-out (SSE bridge).
// All harness-facing messages flow through here so the debug-log global
// switch controls observability from one place.

                           
             
                                             
                 
                  
 

export class DebugLog {
  enabled = true;
          entries             = [];
          listeners = new Set                       ();

  subscribe(fn                       )             {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(level                   , module        , message        )           {
    const entry           = { at: Date.now(), level, module, message };
    this.entries.push(entry);
    if (this.entries.length > 500) this.entries.shift();
    for (const fn of this.listeners) {
      try { fn(entry); } catch { /* contained */ }
    }
    return entry;
  }

  debug(module        , message        ) {
    if (this.enabled) return this.emit('debug', module, message);
    return null;
  }
  info(module        , message        ) { return this.emit('info', module, message); }
  warn(module        , message        ) { return this.emit('warn', module, message); }
  error(module        , message        ) { return this.emit('error', module, message); }

  snapshot()             { return [...this.entries]; }
}

