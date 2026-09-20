// Think v0.11-RC2 - Resource Controller
// CPU占用动态调控、内存占用峰值压制、磁盘IO优化、资源抢占优先级管理、闲置资源自动释放

const RESOURCE_PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
  IDLE: 'idle',
};

class ResourceController {
  constructor(options = {}) {
    this.cpuLimit = options.cpuLimit || 80;
    this.memoryLimit = options.memoryLimit || 512;
    this.ioLimit = options.ioLimit || 50;
    this.currentCpu = 0;
    this.currentMemory = 0;
    this.currentIo = 0;
    this.resourceTasks = new Map();
    this.idleResources = new Set();
    this.monitorInterval = options.monitorInterval || 2000;
    this.monitorTimer = null;
    this.peakMemory = 0;
    this.peakCpu = 0;
    this.isRunning = false;
    this.releaseThreshold = options.releaseThreshold || 30000;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._startMonitoring();
  }

  stop() {
    this.isRunning = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  registerTask(taskId, options = {}) {
    const task = {
      id: taskId,
      priority: options.priority || RESOURCE_PRIORITIES.NORMAL,
      cpuRequirement: options.cpuRequirement || 10,
      memoryRequirement: options.memoryRequirement || 50,
      ioRequirement: options.ioRequirement || 5,
      lastActive: Date.now(),
      isActive: true,
      resourceUsage: { cpu: 0, memory: 0, io: 0 },
    };
    this.resourceTasks.set(taskId, task);
    return task;
  }

  unregisterTask(taskId) {
    const task = this.resourceTasks.get(taskId);
    if (task) {
      this._releaseTaskResources(task);
      this.resourceTasks.delete(taskId);
    }
  }

  updateTaskActivity(taskId) {
    const task = this.resourceTasks.get(taskId);
    if (task) {
      task.lastActive = Date.now();
      task.isActive = true;
    }
  }

  setTaskPriority(taskId, priority) {
    const task = this.resourceTasks.get(taskId);
    if (task) {
      task.priority = priority;
      this._reallocateResources();
    }
  }

  getResourceUsage() {
    return {
      cpu: { current: this.currentCpu, limit: this.cpuLimit, peak: this.peakCpu },
      memory: { current: this.currentMemory, limit: this.memoryLimit, peak: this.peakMemory },
      io: { current: this.currentIo, limit: this.ioLimit },
      activeTasks: Array.from(this.resourceTasks.values()).filter((t) => t.isActive).length,
      totalTasks: this.resourceTasks.size,
      idleResources: this.idleResources.size,
    };
  }

  throttleIfNeeded() {
    if (this.currentCpu > this.cpuLimit || this.currentMemory > this.memoryLimit) {
      this._throttleLowPriorityTasks();
      return true;
    }
    return false;
  }

  _startMonitoring() {
    this.monitorTimer = setInterval(() => {
      if (!this.isRunning) return;
      this._sampleResourceUsage();
      this._releaseIdleResources();
      this._enforceLimits();
    }, this.monitorInterval);
    if (typeof this.monitorTimer.unref === 'function') this.monitorTimer.unref();
  }

  _sampleResourceUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      this.currentMemory = Math.round(mem.heapUsed / 1024 / 1024);
      this.peakMemory = Math.max(this.peakMemory, this.currentMemory);
    }
    this.currentCpu = this._estimateCpuUsage();
    this.peakCpu = Math.max(this.peakCpu, this.currentCpu);
  }

  _estimateCpuUsage() {
    let total = 0;
    for (const task of this.resourceTasks.values()) {
      if (task.isActive) total += task.cpuRequirement;
    }
    return Math.min(100, total);
  }

  _releaseIdleResources() {
    const now = Date.now();
    for (const task of this.resourceTasks.values()) {
      if (task.isActive && now - task.lastActive > this.releaseThreshold) {
        task.isActive = false;
        this._releaseTaskResources(task);
        this.idleResources.add(task.id);
      }
    }
  }

  _releaseTaskResources(task) {
    task.resourceUsage = { cpu: 0, memory: 0, io: 0 };
  }

  _enforceLimits() {
    if (this.currentMemory > this.memoryLimit) {
      if (typeof global !== 'undefined' && global.gc) {
        try { global.gc(); } catch { /* contained */ }
      }
      this._throttleLowPriorityTasks();
    }
  }

  _throttleLowPriorityTasks() {
    const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1, idle: 0 };
    const sorted = Array.from(this.resourceTasks.values())
      .filter((t) => t.isActive)
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    for (const task of sorted) {
      if (this.currentMemory <= this.memoryLimit * 0.8) break;
      task.isActive = false;
      this._releaseTaskResources(task);
    }
  }

  _reallocateResources() {
    this.currentCpu = this._estimateCpuUsage();
  }
}

let controllerInstance = null;

export function getResourceController() {
  if (!controllerInstance) controllerInstance = new ResourceController();
  return controllerInstance;
}

export function startResourceController(options = {}) {
  const controller = getResourceController();
  if (options.cpuLimit) controller.cpuLimit = options.cpuLimit;
  if (options.memoryLimit) controller.memoryLimit = options.memoryLimit;
  controller.start();
  return controller;
}

export function stopResourceController() {
  if (controllerInstance) controllerInstance.stop();
}

export default {
  ResourceController,
  getResourceController,
  startResourceController,
  stopResourceController,
  RESOURCE_PRIORITIES,
};
