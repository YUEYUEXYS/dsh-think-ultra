// Think v0.11-RC2 - Render Scheduler
// 120甯I娓叉煋搴曞眰缁樺埗闄嶈浇銆佸啑浣欐覆鏌撹鍓€佹覆鏌撹祫婧愬鐢ㄣ€佸抚鐜囩ǔ瀹氭€т紭鍖栥€佸唴瀛樻硠婕忔帓鏌?

const RENDER_MODES = {
  PERFORMANCE: 'performance',
  BALANCED: 'balanced',
  QUALITY: 'quality',
};

class RenderScheduler {
  constructor(options = {}) {
    this.targetFps = options.targetFps || 120;
    this.currentFps = 0;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    this.fpsHistory = [];
    this.renderQueue = [];
    this.rendering = false;
    this.animationFrameId = null;
    this.redundantRenderCount = 0;
    this.totalRenderCount = 0;
    this.resourceCache = new Map();
    this.memoryLeakCheckInterval = options.memoryLeakCheckInterval || 10000;
    this.leakCheckTimer = null;
    this.mode = options.mode || RENDER_MODES.BALANCED;
    this.droppedFrames = 0;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    // Host/Node 环境没有 requestAnimationFrame；不要在服务端空转渲染循环。
    if (typeof requestAnimationFrame !== 'function') return;
    this._renderLoop();
    this._startMemoryLeakCheck();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.leakCheckTimer) {
      clearInterval(this.leakCheckTimer);
      this.leakCheckTimer = null;
    }
  }

  scheduleRender(componentId, renderFn, priority = 'normal') {
    const task = {
      id: `${componentId}-${Date.now()}-${Math.random()}`,
      componentId,
      renderFn,
      priority,
      scheduledAt: Date.now(),
      dependencies: new Set(),
    };
    if (this._isRedundant(task)) {
      this.redundantRenderCount++;
      return null;
    }
    this.renderQueue.push(task);
    this._sortQueue();
    return task.id;
  }

  cancelRender(taskId) {
    this.renderQueue = this.renderQueue.filter((t) => t.id !== taskId);
  }

  setMode(mode) {
    this.mode = mode;
    switch (mode) {
      case RENDER_MODES.PERFORMANCE:
        this.targetFps = 60;
        break;
      case RENDER_MODES.BALANCED:
        this.targetFps = 90;
        break;
      case RENDER_MODES.QUALITY:
        this.targetFps = 120;
        break;
    }
  }

  getStats() {
    return {
      currentFps: this.currentFps,
      targetFps: this.targetFps,
      droppedFrames: this.droppedFrames,
      redundantRenderCount: this.redundantRenderCount,
      totalRenderCount: this.totalRenderCount,
      queueLength: this.renderQueue.length,
      mode: this.mode,
      resourceCacheSize: this.resourceCache.size,
      avgFps: this.fpsHistory.length > 0
        ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
        : 0,
    };
  }

  cacheResource(key, resource) {
    if (this.resourceCache.size > 100) {
      const firstKey = this.resourceCache.keys().next().value;
      this.resourceCache.delete(firstKey);
    }
    this.resourceCache.set(key, resource);
  }

  getCachedResource(key) {
    return this.resourceCache.get(key);
  }

  _renderLoop() {
    if (!this.isRunning) return;
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    const frameInterval = 1000 / this.targetFps;
    if (delta >= frameInterval) {
      this._processRenderQueue();
      this.frameCount++;
      this.lastFrameTime = now;
      if (delta > frameInterval * 1.5) {
        this.droppedFrames++;
      }
    }
    if (this.frameCount % 30 === 0) {
      this.currentFps = Math.round(1000 / delta);
      this.fpsHistory.push(this.currentFps);
      if (this.fpsHistory.length > 100) this.fpsHistory.shift();
    }
    this.animationFrameId = requestAnimationFrame(() => this._renderLoop());
  }

  _processRenderQueue() {
    const maxRendersPerFrame = this.mode === RENDER_MODES.PERFORMANCE ? 3 : 5;
    let rendered = 0;
    while (this.renderQueue.length > 0 && rendered < maxRendersPerFrame) {
      const task = this.renderQueue.shift();
      try {
        task.renderFn();
        this.totalRenderCount++;
        rendered++;
      } catch { /* contained */ }
    }
  }

  _sortQueue() {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    this.renderQueue.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.scheduledAt - b.scheduledAt;
    });
  }

  _isRedundant(task) {
    return this.renderQueue.some(
      (t) => t.componentId === task.componentId && t.priority === task.priority
    );
  }

  _startMemoryLeakCheck() {
    this.leakCheckTimer = setInterval(() => {
      this._checkMemoryLeaks();
    }, this.memoryLeakCheckInterval);
    if (typeof this.leakCheckTimer.unref === 'function') this.leakCheckTimer.unref();
  }

  _checkMemoryLeaks() {
    if (this.resourceCache.size > 80) {
      this.resourceCache.clear();
    }
    if (this.fpsHistory.length > 100) {
      this.fpsHistory = this.fpsHistory.slice(-50);
    }
  }
}

let renderInstance = null;

export function getRenderScheduler() {
  if (!renderInstance) renderInstance = new RenderScheduler();
  return renderInstance;
}

export function startRenderScheduler(publishFn, options = {}) {
  const scheduler = getRenderScheduler();
  if (options.targetFps) scheduler.targetFps = options.targetFps;
  if (options.mode) scheduler.mode = options.mode;
  scheduler.start();
  return scheduler;
}

export function stopRenderScheduler() {
  if (renderInstance) renderInstance.stop();
}

export default {
  RenderScheduler,
  getRenderScheduler,
  startRenderScheduler,
  stopRenderScheduler,
  RENDER_MODES,
};
