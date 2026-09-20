// Think v0.11-RC2 - Multi-Agent Scheduler
// 任务分片粒度、死锁规避自愈、任务优先级动态调度、子任务状态同步、
// 资源动态分配、调度时延压缩

const TASK_PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
};

const TASK_STATES = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

class MultiAgentScheduler {
  constructor(options = {}) {
    this.maxParallelAgents = options.maxParallelAgents || 4;
    this.taskQueue = [];
    this.runningTasks = new Map();
    this.completedTasks = [];
    this.deadlockDetectionInterval = options.deadlockDetectionInterval || 5000;
    this.deadlockTimer = null;
    this.resourcePool = { cpu: 100, memory: 100, io: 100 };
    this.schedulingLatency = [];
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    this._startDeadlockDetection();
    this._scheduleLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.deadlockTimer) {
      clearInterval(this.deadlockTimer);
      if (this._scheduleTimer) { clearTimeout(this._scheduleTimer); this._scheduleTimer = null; }
      this.deadlockTimer = null;
    }
  }

  registerTask(taskId, options = {}) {
    const task = {
      id: taskId,
      name: options.name || taskId,
      priority: options.priority || TASK_PRIORITIES.NORMAL,
      state: TASK_STATES.PENDING,
      dependencies: options.dependencies || [],
      resourceRequirements: options.resourceRequirements || { cpu: 10, memory: 10, io: 5 },
      timeoutMs: options.timeoutMs || 30000,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      agentId: null,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      result: null,
      error: null,
    };
    this.taskQueue.push(task);
    this._sortQueue();
    return task;
  }

  setTaskPriority(taskId, priority) {
    const task = this._findTask(taskId);
    if (task) {
      task.priority = priority;
      this._sortQueue();
    }
  }

  updateTaskState(taskId, state, result = null, error = null) {
    const task = this.runningTasks.get(taskId) || this._findTask(taskId);
    if (!task) return null;
    task.state = state;
    if (state === TASK_STATES.COMPLETED) {
      task.completedAt = Date.now();
      task.result = result;
      this.runningTasks.delete(taskId);
      this.completedTasks.push(task);
      this._releaseResources(task);
    } else if (state === TASK_STATES.FAILED) {
      task.error = error;
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.state = TASK_STATES.PENDING;
        this.taskQueue.push(task);
        this._sortQueue();
      } else {
        this.runningTasks.delete(taskId);
        this.completedTasks.push(task);
        this._releaseResources(task);
      }
    }
    return task;
  }

  getTaskStatus(taskId) {
    return this.runningTasks.get(taskId) || this._findTask(taskId) || this.completedTasks.find((t) => t.id === taskId);
  }

  getRunningTasks() {
    return Array.from(this.runningTasks.values());
  }

  getQueueStats() {
    return {
      pending: this.taskQueue.length,
      running: this.runningTasks.size,
      completed: this.completedTasks.length,
      avgLatencyMs: this.schedulingLatency.length > 0
        ? this.schedulingLatency.reduce((a, b) => a + b, 0) / this.schedulingLatency.length
        : 0,
      resourcePool: { ...this.resourcePool },
    };
  }

  _sortQueue() {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    this.taskQueue.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.createdAt - b.createdAt;
    });
  }

  _findTask(taskId) {
    return this.taskQueue.find((t) => t.id === taskId);
  }

  _scheduleLoop() {
    if (!this.isRunning) return;
    const startTime = Date.now();
    while (this.runningTasks.size < this.maxParallelAgents && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (this._canAllocateResources(task)) {
        task.state = TASK_STATES.RUNNING;
        task.startedAt = Date.now();
        task.agentId = `agent-${this.runningTasks.size + 1}`;
        this._allocateResources(task);
        this.runningTasks.set(task.id, task);
      } else {
        this.taskQueue.unshift(task);
        break;
      }
    }
    const latency = Date.now() - startTime;
    this.schedulingLatency.push(latency);
    if (this.schedulingLatency.length > 100) this.schedulingLatency.shift();
    this._scheduleTimer = setTimeout(() => this._scheduleLoop(), 100);
    if (typeof this._scheduleTimer.unref === 'function') this._scheduleTimer.unref();
  }

  _canAllocateResources(task) {
    const req = task.resourceRequirements;
    return (
      this.resourcePool.cpu >= req.cpu &&
      this.resourcePool.memory >= req.memory &&
      this.resourcePool.io >= req.io
    );
  }

  _allocateResources(task) {
    const req = task.resourceRequirements;
    this.resourcePool.cpu -= req.cpu;
    this.resourcePool.memory -= req.memory;
    this.resourcePool.io -= req.io;
  }

  _releaseResources(task) {
    const req = task.resourceRequirements;
    this.resourcePool.cpu = Math.min(100, this.resourcePool.cpu + req.cpu);
    this.resourcePool.memory = Math.min(100, this.resourcePool.memory + req.memory);
    this.resourcePool.io = Math.min(100, this.resourcePool.io + req.io);
  }

  _startDeadlockDetection() {
    this.deadlockTimer = setInterval(() => this._detectAndResolveDeadlocks(), this.deadlockDetectionInterval);
    if (typeof this.deadlockTimer.unref === 'function') this.deadlockTimer.unref();
  }

  _detectAndResolveDeadlocks() {
    const now = Date.now();
    const blocked = this.getRunningTasks().filter((t) => {
      if (t.state !== TASK_STATES.RUNNING) return false;
      const elapsed = now - t.startedAt;
      return elapsed > t.timeoutMs;
    });
    for (const task of blocked) {
      this.updateTaskState(task.id, TASK_STATES.FAILED, null, new Error('deadlock detected: task timeout'));
    }
  }
}

let schedulerInstance = null;

export function getMultiAgentScheduler() {
  if (!schedulerInstance) schedulerInstance = new MultiAgentScheduler();
  return schedulerInstance;
}

export function startScheduler(options = {}) {
  const scheduler = getMultiAgentScheduler();
  if (options.maxParallelAgents) scheduler.maxParallelAgents = options.maxParallelAgents;
  scheduler.start();
  return scheduler;
}

export function stopScheduler() {
  if (schedulerInstance) schedulerInstance.stop();
}

export function registerMonitoredTask(taskId, options = {}) {
  return getMultiAgentScheduler().registerTask(taskId, options);
}

export function registerTaskPriority(taskId, priority) {
  return getMultiAgentScheduler().setTaskPriority(taskId, priority);
}

export function unregisterMonitoredTask(taskId) {
  const scheduler = getMultiAgentScheduler();
  scheduler.taskQueue = scheduler.taskQueue.filter((t) => t.id !== taskId);
  if (scheduler.runningTasks.has(taskId)) {
    scheduler.updateTaskState(taskId, TASK_STATES.CANCELLED);
  }
}

export default {
  MultiAgentScheduler,
  getMultiAgentScheduler,
  startScheduler,
  stopScheduler,
  registerMonitoredTask,
  registerTaskPriority,
  unregisterMonitoredTask,
  TASK_PRIORITIES,
  TASK_STATES,
};
