// dag-core.cjs — 真正运行的DAG任务编排引擎
// 有向无环图任务编排、并行执行、失败重试、检查点回滚、结果聚合。
// 不是提示词，是实际在后端运行的代码，管理复杂多步骤任务的执行。

'use strict';

class DAGOrchestrator {
  constructor(options = {}) {
    this.tasks = new Map();       // taskId -> task definition
    this.dependencies = new Map(); // taskId -> Set of dependency taskIds
    this.dependents = new Map();   // taskId -> Set of dependent taskIds
    this.results = new Map();      // taskId -> result
    this.status = new Map();       // taskId -> status (pending/running/success/failed/skipped)
    this.checkpoints = new Map();  // taskId -> checkpoint data
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000, // ms
      timeout: options.timeout || 30000,       // ms per task
      maxParallel: options.maxParallel || 5,
      ...options,
    };
    this.executionLog = [];
    this.onTaskStart = options.onTaskStart || null;
    this.onTaskComplete = options.onTaskComplete || null;
    this.onTaskFail = options.onTaskFail || null;
  }

  // 添加任务
  addTask(id, definition) {
    if (this.tasks.has(id)) {
      throw new Error(`Task "${id}" already exists`);
    }
    this.tasks.set(id, {
      id,
      name: definition.name || id,
      fn: definition.fn || null,
      dependencies: definition.dependencies || [],
      timeout: definition.timeout || this.options.timeout,
      retries: definition.retries != null ? definition.retries : this.options.maxRetries,
      metadata: definition.metadata || {},
    });
    this.dependencies.set(id, new Set(definition.dependencies || []));
    if (!this.dependents.has(id)) this.dependents.set(id, new Set());
    for (const dep of definition.dependencies || []) {
      if (!this.dependents.has(dep)) this.dependents.set(dep, new Set());
      this.dependents.get(dep).add(id);
    }
    this.status.set(id, 'pending');
    return this;
  }

  // 批量添加任务
  addTasks(taskDefs) {
    for (const def of taskDefs) {
      this.addTask(def.id, def);
    }
    return this;
  }

  // 验证DAG（检测循环依赖）
  validate() {
    const visited = new Set();
    const recStack = new Set();
    const cycles = [];

    const dfs = (node, path) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      for (const dep of this.dependencies.get(node) || []) {
        if (!visited.has(dep)) {
          if (dfs(dep, path)) return true;
        } else if (recStack.has(dep)) {
          cycles.push([...path, dep]);
          return true;
        }
      }
      recStack.delete(node);
      path.pop();
      return false;
    };

    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        dfs(taskId, []);
      }
    }

    // 检查缺失的依赖
    const missingDeps = [];
    for (const [taskId, deps] of this.dependencies) {
      for (const dep of deps) {
        if (!this.tasks.has(dep)) {
          missingDeps.push({ task: taskId, missing: dep });
        }
      }
    }

    return {
      valid: cycles.length === 0 && missingDeps.length === 0,
      cycles,
      missingDeps,
      taskCount: this.tasks.size,
      edgeCount: Array.from(this.dependencies.values()).reduce((sum, s) => sum + s.size, 0),
    };
  }

  // 获取拓扑排序
  topologicalSort() {
    const inDegree = new Map();
    for (const taskId of this.tasks.keys()) {
      inDegree.set(taskId, (this.dependencies.get(taskId) || new Set()).size);
    }
    const queue = [];
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) queue.push(taskId);
    }
    const result = [];
    while (queue.length > 0) {
      const node = queue.shift();
      result.push(node);
      for (const dep of this.dependents.get(node) || []) {
        inDegree.set(dep, inDegree.get(dep) - 1);
        if (inDegree.get(dep) === 0) queue.push(dep);
      }
    }
    if (result.length !== this.tasks.size) {
      throw new Error('Cycle detected in DAG');
    }
    return result;
  }

  // 执行整个DAG
  async execute(context = {}) {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`DAG validation failed: ${validation.cycles.length} cycles, ${validation.missingDeps.length} missing dependencies`);
    }

    // 重置状态
    for (const taskId of this.tasks.keys()) {
      this.status.set(taskId, 'pending');
      this.results.delete(taskId);
    }

    const topoOrder = this.topologicalSort();
    const completed = new Set();
    const failed = new Set();
    let running = 0;

    const canRun = (taskId) => {
      const deps = this.dependencies.get(taskId) || new Set();
      for (const dep of deps) {
        if (!completed.has(dep)) return false;
      }
      return true;
    };

    const runTask = async (taskId) => {
      const task = this.tasks.get(taskId);
      this.status.set(taskId, 'running');
      if (this.onTaskStart) this.onTaskStart(task, context);

      // 收集依赖结果
      const depResults = {};
      for (const dep of this.dependencies.get(taskId) || []) {
        depResults[dep] = this.results.get(dep);
      }

      let lastError = null;
      for (let attempt = 0; attempt <= task.retries; attempt++) {
        try {
          const result = await this._executeWithTimeout(task, { ...context, depResults, taskId });
          this.results.set(taskId, result);
          this.status.set(taskId, 'success');
          this._saveCheckpoint(taskId, { result, completedAt: Date.now() });
          if (this.onTaskComplete) this.onTaskComplete(task, result, context);
          this._log({ type: 'success', taskId, attempt, time: Date.now() });
          return;
        } catch (err) {
          lastError = err;
          this._log({ type: 'retry', taskId, attempt, error: String(err).slice(0, 100), time: Date.now() });
          if (attempt < task.retries) {
            await this._sleep(this.options.retryDelay * Math.pow(2, attempt)); // 指数退避
          }
        }
      }

      // 所有重试都失败
      this.status.set(taskId, 'failed');
      failed.add(taskId);
      if (this.onTaskFail) this.onTaskFail(task, lastError, context);
      this._log({ type: 'failed', taskId, error: String(lastError).slice(0, 200), time: Date.now() });

      // 跳过所有依赖此任务的后续任务
      this._skipDependents(taskId);
    };

    // 主执行循环
    return new Promise((resolve, reject) => {
      const tick = () => {
        // 启动可运行的任务
        for (const taskId of topoOrder) {
          if (this.status.get(taskId) === 'pending' && canRun(taskId) && running < this.options.maxParallel) {
            running++;
            runTask(taskId).finally(() => {
              running--;
              completed.add(taskId);
              tick();
            });
          }
        }

        // 检查是否完成
        const allDone = Array.from(this.tasks.keys()).every(
          id => this.status.get(id) === 'success' || this.status.get(id) === 'failed' || this.status.get(id) === 'skipped'
        );
        if (allDone) {
          const successCount = Array.from(this.status.values()).filter(s => s === 'success').length;
          const failedCount = Array.from(this.status.values()).filter(s => s === 'failed').length;
          const skippedCount = Array.from(this.status.values()).filter(s => s === 'skipped').length;
          resolve({
            success: failedCount === 0,
            successCount,
            failedCount,
            skippedCount,
            results: Object.fromEntries(this.results),
            status: Object.fromEntries(this.status),
            executionLog: this.executionLog.slice(-50),
          });
        }
      };
      tick();
    });
  }

  // 获取执行进度
  getProgress() {
    const total = this.tasks.size;
    let success = 0, failed = 0, running = 0, pending = 0, skipped = 0;
    for (const status of this.status.values()) {
      if (status === 'success') success++;
      else if (status === 'failed') failed++;
      else if (status === 'running') running++;
      else if (status === 'pending') pending++;
      else if (status === 'skipped') skipped++;
    }
    return {
      total,
      success,
      failed,
      running,
      pending,
      skipped,
      percent: total > 0 ? Math.round(((success + failed + skipped) / total) * 100) : 0,
      completedTasks: Array.from(this.results.keys()),
    };
  }

  // 从检查点恢复
  async resumeFromCheckpoint(taskId, context = {}) {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for task "${taskId}"`);
    }
    // 恢复结果
    this.results.set(taskId, checkpoint.result);
    this.status.set(taskId, 'success');
    this._log({ type: 'resumed', taskId, fromCheckpoint: true, time: Date.now() });
    return checkpoint.result;
  }

  // 获取DAG统计
  getStats() {
    return {
      taskCount: this.tasks.size,
      edgeCount: Array.from(this.dependencies.values()).reduce((sum, s) => sum + s.size, 0),
      maxDepth: this._calculateMaxDepth(),
      avgDependencies: this.tasks.size > 0
        ? Array.from(this.dependencies.values()).reduce((sum, s) => sum + s.size, 0) / this.tasks.size
        : 0,
      executionLogCount: this.executionLog.length,
    };
  }

  // ========== 内部方法 ==========

  async _executeWithTimeout(task, context) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task "${task.id}" timed out after ${task.timeout}ms`));
      }, task.timeout);

      Promise.resolve()
        .then(() => {
          if (typeof task.fn === 'function') {
            return task.fn(context);
          }
          return null; // 没有执行函数的任务（纯编排节点）直接成功
        })
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  _skipDependents(taskId) {
    const dependents = this.dependents.get(taskId) || new Set();
    for (const dep of dependents) {
      if (this.status.get(dep) === 'pending') {
        this.status.set(dep, 'skipped');
        this._log({ type: 'skipped', taskId: dep, reason: `dependency "${taskId}" failed`, time: Date.now() });
        this._skipDependents(dep); // 递归跳过
      }
    }
  }

  _saveCheckpoint(taskId, data) {
    this.checkpoints.set(taskId, { ...data, savedAt: Date.now() });
  }

  _calculateMaxDepth() {
    const depth = new Map();
    const dfs = (node) => {
      if (depth.has(node)) return depth.get(node);
      const deps = this.dependencies.get(node) || new Set();
      if (deps.size === 0) {
        depth.set(node, 0);
        return 0;
      }
      let maxDepDepth = 0;
      for (const dep of deps) {
        maxDepDepth = Math.max(maxDepDepth, dfs(dep));
      }
      const d = maxDepDepth + 1;
      depth.set(node, d);
      return d;
    };
    let max = 0;
    for (const taskId of this.tasks.keys()) {
      max = Math.max(max, dfs(taskId));
    }
    return max;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _log(entry) {
    this.executionLog.push(entry);
    if (this.executionLog.length > 500) this.executionLog.shift();
  }
}

module.exports = { DAGOrchestrator };
