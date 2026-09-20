// Think v0.11-RC2 - Plugin Loader
// 加载链路优化、热更新兼容、版本适配容错、依赖冲突规避、启动速度优化

const LOAD_STATES = {
  UNLOADED: 'unloaded',
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
  HOT_RELOADING: 'hot_reloading',
};

class PluginLoader {
  constructor(options = {}) {
    this.plugins = new Map();
    this.loadOrder = [];
    this.dependencyGraph = new Map();
    this.hotReloadEnabled = options.hotReloadEnabled !== false;
    this.versionCompatibility = options.versionCompatibility || '^0.1.0';
    this.startTime = 0;
    this.loadTimings = [];
    this.isLoading = false;
  }

  async loadPlugin(pluginId, pluginModule, options = {}) {
    if (this.plugins.has(pluginId)) {
      if (this.hotReloadEnabled) {
        return this._hotReload(pluginId, pluginModule, options);
      }
      return this.plugins.get(pluginId);
    }
    this.isLoading = true;
    const loadStart = Date.now();
    const pluginEntry = {
      id: pluginId,
      module: pluginModule,
      state: LOAD_STATES.LOADING,
      options,
      loadedAt: null,
      error: null,
      version: options.version || '0.0.0',
      dependencies: options.dependencies || [],
    };
    try {
      await this._resolveDependencies(pluginEntry);
      await this._initializePlugin(pluginEntry);
      pluginEntry.state = LOAD_STATES.LOADED;
      pluginEntry.loadedAt = Date.now();
      this.plugins.set(pluginId, pluginEntry);
      this.loadOrder.push(pluginId);
      const loadTime = Date.now() - loadStart;
      this.loadTimings.push({ pluginId, loadTime });
      return pluginEntry;
    } catch (error) {
      pluginEntry.state = LOAD_STATES.ERROR;
      pluginEntry.error = error;
      this.plugins.set(pluginId, pluginEntry);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    if (plugin.module && typeof plugin.module.dispose === 'function') {
      try { plugin.module.dispose(); } catch { /* contained */ }
    }
    this.plugins.delete(pluginId);
    this.loadOrder = this.loadOrder.filter((id) => id !== pluginId);
    return true;
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }

  listPlugins() {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      state: p.state,
      version: p.version,
      loadedAt: p.loadedAt,
      dependencies: p.dependencies,
    }));
  }

  getLoadStats() {
    const totalLoadTime = this.loadTimings.reduce((sum, t) => sum + t.loadTime, 0);
    const avgLoadTime = this.loadTimings.length > 0 ? totalLoadTime / this.loadTimings.length : 0;
    return {
      totalPlugins: this.plugins.size,
      loaded: Array.from(this.plugins.values()).filter((p) => p.state === LOAD_STATES.LOADED).length,
      errors: Array.from(this.plugins.values()).filter((p) => p.state === LOAD_STATES.ERROR).length,
      totalLoadTime,
      avgLoadTime,
      loadOrder: [...this.loadOrder],
    };
  }

  checkVersionCompatibility(version) {
    const required = this.versionCompatibility.replace(/[\^~]/g, '').split('.').map(Number);
    const actual = version.split('.').map(Number);
    for (let i = 0; i < required.length; i++) {
      if (actual[i] > required[i]) return true;
      if (actual[i] < required[i]) return false;
    }
    return true;
  }

  async _resolveDependencies(pluginEntry) {
    for (const depId of pluginEntry.dependencies) {
      if (!this.plugins.has(depId)) {
        throw new Error(`Plugin dependency not found: ${depId}`);
      }
      const dep = this.plugins.get(depId);
      if (dep.state !== LOAD_STATES.LOADED) {
        throw new Error(`Plugin dependency not loaded: ${depId}`);
      }
    }
  }

  async _initializePlugin(pluginEntry) {
    if (pluginEntry.module && typeof pluginEntry.module.apply === 'function') {
      await pluginEntry.module.apply(pluginEntry.options);
    }
  }

  async _hotReload(pluginId, newModule, options) {
    const oldPlugin = this.plugins.get(pluginId);
    oldPlugin.state = LOAD_STATES.HOT_RELOADING;
    if (oldPlugin.module && typeof oldPlugin.module.dispose === 'function') {
      try { await oldPlugin.module.dispose(); } catch { /* contained */ }
    }
    oldPlugin.module = newModule;
    oldPlugin.options = { ...oldPlugin.options, ...options };
    try {
      await this._initializePlugin(oldPlugin);
      oldPlugin.state = LOAD_STATES.LOADED;
      return oldPlugin;
    } catch (error) {
      oldPlugin.state = LOAD_STATES.ERROR;
      oldPlugin.error = error;
      throw error;
    }
  }
}

let loaderInstance = null;

export function getPluginLoader() {
  if (!loaderInstance) loaderInstance = new PluginLoader();
  return loaderInstance;
}

export function startLoadTimer() {
  const loader = getPluginLoader();
  loader.startTime = Date.now();
}

export function markLoadStart(pluginId) {
  const loader = getPluginLoader();
  loader.loadTimings.push({ pluginId, loadTime: 0, start: Date.now() });
}

export function markLoaded(pluginId, info = {}) {
  const loader = getPluginLoader();
  const entry = loader.loadTimings.find((t) => t.pluginId === pluginId && t.loadTime === 0);
  if (entry) {
    entry.loadTime = Date.now() - entry.start;
    entry.info = info;
  }
}

export function endLoadTimer() {
  const loader = getPluginLoader();
  return Date.now() - loader.startTime;
}

export function getLoadOrder() {
  return getPluginLoader().loadOrder;
}

export default {
  PluginLoader,
  getPluginLoader,
  startLoadTimer,
  markLoadStart,
  markLoaded,
  endLoadTimer,
  getLoadOrder,
  LOAD_STATES,
};
