// execgate-engine.js — Think 执行门控·完整引擎
// 独立引擎文件：风险分类器 / 权限矩阵 / 沙盒策略 / 参数校验 /
// 副作用审计 / 回滚机制 / 熔断保护 / 统计记录 / 强度分级
// 纯 JavaScript ESM，零外部依赖。

// ============================================================
// 一、风险等级定义
// ============================================================
export const RISK_LEVELS = {
  safe: { level: 0, name: '安全', color: 'green', description: '纯只读/计算，无任何副作用', autoApprove: true, requireConfirmation: false, sandbox: 'none' },
  low: { level: 1, name: '低风险', color: 'blue', description: '有轻微副作用但可轻易撤销', autoApprove: true, requireConfirmation: false, sandbox: 'light' },
  medium: { level: 2, name: '中风险', color: 'yellow', description: '有明显副作用，撤销需要一定成本', autoApprove: false, requireConfirmation: true, sandbox: 'standard' },
  high: { level: 3, name: '高风险', color: 'orange', description: '有重大副作用，可能影响系统/数据/外部状态', autoApprove: false, requireConfirmation: true, sandbox: 'strict' },
  critical: { level: 4, name: '极高风险', color: 'red', description: '不可逆操作，可能造成永久性损失', autoApprove: false, requireConfirmation: true, sandbox: 'isolated', requireRollbackPlan: true },
};

// ============================================================
// 二、操作类型库（12 种真实操作类型）
// ============================================================
export const OPERATION_TYPES = [
  { id: 'read_file', name: '读取文件', defaultRisk: 'safe', sideEffects: false, reversible: true },
  { id: 'write_file', name: '写入文件', defaultRisk: 'medium', sideEffects: true, reversible: true },
  { id: 'delete_file', name: '删除文件', defaultRisk: 'high', sideEffects: true, reversible: false },
  { id: 'execute_code', name: '执行代码', defaultRisk: 'high', sideEffects: true, reversible: false },
  { id: 'shell_command', name: 'Shell 命令', defaultRisk: 'high', sideEffects: true, reversible: false },
  { id: 'network_request', name: '网络请求', defaultRisk: 'low', sideEffects: true, reversible: true },
  { id: 'api_call', name: 'API 调用', defaultRisk: 'medium', sideEffects: true, reversible: true },
  { id: 'database_query', name: '数据库查询', defaultRisk: 'low', sideEffects: false, reversible: true },
  { id: 'database_write', name: '数据库写入', defaultRisk: 'high', sideEffects: true, reversible: false },
  { id: 'send_message', name: '发送消息', defaultRisk: 'medium', sideEffects: true, reversible: false },
  { id: 'install_package', name: '安装包', defaultRisk: 'medium', sideEffects: true, reversible: true },
  { id: 'system_config', name: '系统配置', defaultRisk: 'critical', sideEffects: true, reversible: false },
];

// ============================================================
// 三、风险分类器
// ============================================================
export function classifyRisk(operation, context = {}) {
  const opType = OPERATION_TYPES.find((t) => t.id === operation.type) || { defaultRisk: 'medium', name: operation.type || 'unknown' };
  let riskLevel = RISK_LEVELS[opType.defaultRisk] || RISK_LEVELS.medium;
  // 上下文调整因子
  const adjustments = [];
  // 路径敏感：系统目录/根目录提升风险
  if (operation.path) {
    const path = String(operation.path).toLowerCase();
    if (/^(\/|c:\\windows|c:\\program|\/etc|\/usr|\/bin|\/sbin)/.test(path)) {
      riskLevel = escalateRisk(riskLevel, 1, '系统路径');
      adjustments.push('系统路径+1');
    }
    if (/\.env|\.key|\.pem|\.p12|\.pfx|password|secret|credential/i.test(path)) {
      riskLevel = escalateRisk(riskLevel, 2, '敏感文件');
      adjustments.push('敏感文件+2');
    }
  }
  // 递归/强制标志提升风险
  if (operation.flags) {
    const flags = String(operation.flags).toLowerCase();
    if (/-r|--recursive|-f|--force|-rf/.test(flags)) {
      riskLevel = escalateRisk(riskLevel, 1, '递归/强制');
      adjustments.push('递归/强制+1');
    }
  }
  // 批量操作提升风险
  if (operation.batchSize && operation.batchSize > 10) {
    riskLevel = escalateRisk(riskLevel, 1, '批量操作');
    adjustments.push(`批量(${operation.batchSize})+1`);
  }
  // 不可撤销操作直接到 critical
  if (!opType.reversible && riskLevel.level < 4) {
    adjustments.push('不可撤销');
  }
  return {
    operationType: opType.name,
    operationTypeId: opType.id,
    riskLevel: riskLevel.level,
    riskName: riskLevel.name,
    riskColor: riskLevel.color,
    description: riskLevel.description,
    autoApprove: riskLevel.autoApprove && !context.requireManualApproval,
    requireConfirmation: riskLevel.requireConfirmation,
    sandbox: riskLevel.sandbox,
    requireRollbackPlan: riskLevel.requireRollbackPlan || false,
    sideEffects: opType.sideEffects,
    reversible: opType.reversible,
    adjustments,
    contextFactors: Object.keys(context),
  };
}

function escalateRisk(current, levels, reason) {
  const order = ['safe', 'low', 'medium', 'high', 'critical'];
  const idx = order.indexOf(current.name.toLowerCase()) || 2;
  const newIdx = Math.min(4, idx + levels);
  return RISK_LEVELS[order[newIdx]];
}

// ============================================================
// 四、参数校验器
// ============================================================
export function validateParams(operation, schema) {
  const errors = [];
  const warnings = [];
  if (!schema) return { valid: true, errors: [], warnings: ['无校验schema，跳过参数校验'] };
  for (const [field, rules] of Object.entries(schema)) {
    const value = operation.params?.[field];
    // required 检查
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`参数 "${field}" 是必填项，但值为空`);
      continue;
    }
    if (value === undefined || value === null) continue;
    // type 检查
    if (rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`参数 "${field}" 类型错误：期望 ${rules.type}，实际 ${actualType}`);
        continue;
      }
    }
    // enum 检查
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`参数 "${field}" 值无效：必须是 ${rules.enum.join(' / ')} 之一，实际 "${value}"`);
      continue;
    }
    // min/max 检查
    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      errors.push(`参数 "${field}" 值过小：最小值 ${rules.min}，实际 ${value}`);
    }
    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      errors.push(`参数 "${field}" 值过大：最大值 ${rules.max}，实际 ${value}`);
    }
    // pattern 检查
    if (rules.pattern && typeof value === 'string') {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(value)) {
          errors.push(`参数 "${field}" 格式不匹配：期望模式 ${rules.pattern}`);
        }
      } catch (e) {
        warnings.push(`参数 "${field}" 的 pattern 无效：${e.message}`);
      }
    }
    // minLength/maxLength
    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      errors.push(`参数 "${field}" 过短：最少 ${rules.minLength} 字符，实际 ${value.length}`);
    }
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      warnings.push(`参数 "${field}" 过长：最多 ${rules.maxLength} 字符，实际 ${value.length}（将被截断）`);
    }
  }
  // 检查未知参数
  if (operation.params) {
    for (const key of Object.keys(operation.params)) {
      if (!schema[key]) {
        warnings.push(`未知参数 "${key}"，将被忽略`);
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings, sanitizedParams: sanitizeParams(operation.params, schema) };
}

function sanitizeParams(params, schema) {
  if (!params || !schema) return params;
  const sanitized = {};
  for (const [key, value] of Object.entries(params)) {
    if (!schema[key]) continue;
    let v = value;
    if (schema[key].maxLength && typeof v === 'string') v = v.slice(0, schema[key].maxLength);
    if (schema[key].type === 'number' && typeof v === 'string') v = parseFloat(v);
    if (schema[key].type === 'boolean' && typeof v === 'string') v = v === 'true' || v === '1';
    sanitized[key] = v;
  }
  return sanitized;
}

// ============================================================
// 五、沙盒策略生成器
// ============================================================
export function generateSandboxPolicy(riskClassification) {
  const policies = {
    none: {
      name: '无沙盒',
      description: '安全操作，直接执行',
      restrictions: [],
      allowed: ['*'],
      blocked: [],
    },
    light: {
      name: '轻沙盒',
      description: '低风险操作，基础隔离',
      restrictions: ['禁止访问系统目录', '网络请求限白名单域名'],
      allowed: ['read:*', 'network:whitelist'],
      blocked: ['write:system', 'execute:shell'],
    },
    standard: {
      name: '标准沙盒',
      description: '中风险操作，标准隔离',
      restrictions: ['文件系统限工作目录', '网络请求限白名单', '禁止子进程', '内存限制 512MB', '超时 30s'],
      allowed: ['read:workdir', 'write:workdir', 'network:whitelist'],
      blocked: ['write:system', 'execute:shell', 'execute:code', 'network:*'],
    },
    strict: {
      name: '严格沙盒',
      description: '高风险操作，强隔离',
      restrictions: ['文件系统只读', '网络完全禁止', '禁止子进程', '内存限制 256MB', '超时 15s', '禁止环境变量访问'],
      allowed: ['read:workdir'],
      blocked: ['write:*', 'execute:*', 'network:*', 'env:*'],
    },
    isolated: {
      name: '隔离沙盒',
      description: '极高风险操作，完全隔离',
      restrictions: ['独立容器', '文件系统临时副本', '网络完全禁止', '禁止子进程', '内存限制 128MB', '超时 10s', '禁止任何持久化', '执行后自动销毁'],
      allowed: ['read:temp'],
      blocked: ['*'],
    },
  };
  return policies[riskClassification.sandbox] || policies.standard;
}

// ============================================================
// 六、回滚计划生成器
// ============================================================
export function generateRollbackPlan(operation, riskClassification) {
  if (!riskClassification.requireRollbackPlan) return null;
  const plans = {
    write_file: {
      steps: [
        '执行前备份原文件到 .backup/{timestamp}/',
        '记录原文件的 SHA256 和大小',
        '写入新内容',
        '验证写入后文件可正常读取',
        '如果验证失败，从备份恢复原文件',
      ],
      rollbackCommand: 'cp .backup/{timestamp}/{filename} {path}',
      verification: '对比备份文件和当前文件的 SHA256',
    },
    delete_file: {
      steps: [
        '不直接删除，移动到回收站/临时目录',
        '记录原路径和删除时间',
        '保留 30 天后自动清理',
      ],
      rollbackCommand: 'mv {trash_path}/{filename} {original_path}',
      verification: '确认文件已恢复到原路径且内容完整',
    },
    execute_code: {
      steps: [
        '在隔离沙盒中执行',
        '记录执行前的系统状态快照（环境变量、工作目录、关键文件）',
        '执行代码',
        '记录执行后的系统状态',
        '对比前后差异，如果有非预期变化则回滚',
      ],
      rollbackCommand: '恢复系统状态快照',
      verification: '确认系统状态与执行前一致',
    },
    database_write: {
      steps: [
        '开启事务',
        '执行写入操作',
        '验证写入结果',
        '如果验证失败，回滚事务',
        '验证通过后提交事务',
      ],
      rollbackCommand: 'ROLLBACK TRANSACTION',
      verification: '确认数据未被修改',
    },
    system_config: {
      steps: [
        '备份原配置文件',
        '记录原配置的所有键值',
        '应用新配置',
        '验证系统功能正常',
        '如果有问题，立即恢复原配置',
      ],
      rollbackCommand: '恢复配置备份并重启服务',
      verification: '确认配置已恢复且系统功能正常',
    },
  };
  const plan = plans[operation.type] || {
    steps: ['执行前记录当前状态', '执行操作', '验证结果', '如果失败，恢复到执行前状态'],
    rollbackCommand: '手动恢复',
    verification: '确认状态已恢复',
  };
  return { ...plan, operationType: operation.type, generatedAt: new Date().toISOString() };
}

// ============================================================
// 七、强度分级
// ============================================================
export const EXECGATE_TIERS = {
  light: { label: '轻', autoApproveUpTo: 'low', requireConfirmationFrom: 'medium', sandboxEnforcement: 'advisory', tokenBudgetMultiplier: 1.1 },
  medium: { label: '中', autoApproveUpTo: 'low', requireConfirmationFrom: 'medium', sandboxEnforcement: 'enforced', tokenBudgetMultiplier: 1.3 },
  heavy: { label: '重', autoApproveUpTo: 'safe', requireConfirmationFrom: 'low', sandboxEnforcement: 'enforced', tokenBudgetMultiplier: 1.5 },
  extreme: { label: '极', autoApproveUpTo: 'safe', requireConfirmationFrom: 'safe', sandboxEnforcement: 'strict', tokenBudgetMultiplier: 2.0 },
};

// ============================================================
// 八、熔断保护器
// ============================================================
export class ExecGateFuse {
  constructor(options = {}) {
    this.maxOperations = options.maxOperations || 50;
    this.maxHighRisk = options.maxHighRisk || 5;
    this.maxFailures = options.maxFailures || 10;
    this.operationCount = 0;
    this.highRiskCount = 0;
    this.failureCount = 0;
    this.tripped = false;
    this.tripReason = '';
  }
  checkOperation(riskLevel) {
    if (this.tripped) return false;
    if (this.operationCount >= this.maxOperations) { this.trip(`操作数熔断：已达上限 ${this.maxOperations}`); return false; }
    if (riskLevel >= 3) {
      if (this.highRiskCount >= this.maxHighRisk) { this.trip(`高风险操作熔断：已达上限 ${this.maxHighRisk}`); return false; }
      this.highRiskCount++;
    }
    this.operationCount++;
    return true;
  }
  recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.maxFailures) { this.trip(`失败率熔断：已达上限 ${this.maxFailures} 次失败`); }
  }
  trip(reason) { this.tripped = true; this.tripReason = reason; }
  reset() { this.operationCount = 0; this.highRiskCount = 0; this.failureCount = 0; this.tripped = false; this.tripReason = ''; }
  status() {
    return { operationCount: this.operationCount, maxOperations: this.maxOperations, highRiskCount: this.highRiskCount, maxHighRisk: this.maxHighRisk, failureCount: this.failureCount, maxFailures: this.maxFailures, tripped: this.tripped, tripReason: this.tripReason };
  }
}

// ============================================================
// 九、统计记录器
// ============================================================
export class ExecGateStats {
  constructor() { this.sessions = new Map(); }
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { operationsGated: 0, approved: 0, rejected: 0, requiringConfirmation: 0, riskBreakdown: {}, sandboxUsage: {}, rollbackPlansGenerated: 0, paramValidationErrors: 0, fuseTrips: 0, startTime: Date.now() });
    }
    return this.sessions.get(sessionId);
  }
  recordOperation(sessionId, classification, decision) {
    const s = this.getSession(sessionId);
    s.operationsGated++;
    if (decision === 'approved') s.approved++;
    else if (decision === 'rejected') s.rejected++;
    if (classification.requireConfirmation) s.requiringConfirmation++;
    s.riskBreakdown[classification.riskName] = (s.riskBreakdown[classification.riskName] || 0) + 1;
    s.sandboxUsage[classification.sandbox] = (s.sandboxUsage[classification.sandbox] || 0) + 1;
  }
  recordRollbackPlan(sessionId) { this.getSession(sessionId).rollbackPlansGenerated++; }
  recordParamError(sessionId) { this.getSession(sessionId).paramValidationErrors++; }
  recordFuseTrip(sessionId) { this.getSession(sessionId).fuseTrips++; }
  summary(sessionId) {
    const s = this.getSession(sessionId);
    return { operationsGated: s.operationsGated, approved: s.approved, rejected: s.rejected, approvalRate: s.operationsGated > 0 ? `${Math.round((s.approved / s.operationsGated) * 100)}%` : '0%', requiringConfirmation: s.requiringConfirmation, riskBreakdown: s.riskBreakdown, sandboxUsage: s.sandboxUsage, rollbackPlansGenerated: s.rollbackPlansGenerated, paramValidationErrors: s.paramValidationErrors, fuseTrips: s.fuseTrips, durationMs: Date.now() - s.startTime };
  }
}

// ============================================================
// 十、主引擎入口
// ============================================================
export class ExecGateEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 'medium';
    this.tier = EXECGATE_TIERS[this.intensity] || EXECGATE_TIERS.medium;
    this.fuse = new ExecGateFuse();
    this.stats = new ExecGateStats();
    this.auditLog = [];
  }
  setIntensity(intensity) {
    if (EXECGATE_TIERS[intensity]) { this.intensity = intensity; this.tier = EXECGATE_TIERS[intensity]; }
  }
  gate(sessionId, operation, context = {}, paramSchema = null) {
    if (this.fuse.tripped) return { ok: false, reason: this.fuse.tripReason, decision: 'blocked' };
    // 1. 参数校验
    const validation = validateParams(operation, paramSchema);
    if (!validation.valid) {
      this.stats.recordParamError(sessionId);
      return { ok: false, decision: 'rejected', reason: '参数校验失败', errors: validation.errors, warnings: validation.warnings };
    }
    // 2. 风险分类
    const classification = classifyRisk(operation, context);
    // 3. 熔断检查
    if (!this.fuse.checkOperation(classification.riskLevel)) {
      this.stats.recordFuseTrip(sessionId);
      return { ok: false, decision: 'blocked', reason: this.fuse.tripReason, classification };
    }
    // 4. 决策
    const autoApproveThreshold = RISK_LEVELS[this.tier.autoApproveUpTo]?.level || 1;
    let decision;
    if (classification.riskLevel <= autoApproveThreshold && !context.requireManualApproval) {
      decision = 'approved';
    } else if (classification.riskLevel >= 4 && this.tier.sandboxEnforcement === 'strict') {
      decision = 'rejected';
    } else {
      decision = 'pending_confirmation';
    }
    // 5. 沙盒策略
    const sandboxPolicy = generateSandboxPolicy(classification);
    // 6. 回滚计划
    const rollbackPlan = classification.requireRollbackPlan ? generateRollbackPlan(operation, classification) : null;
    if (rollbackPlan) this.stats.recordRollbackPlan(sessionId);
    // 7. 统计 + 审计
    this.stats.recordOperation(sessionId, classification, decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'pending');
    this.auditLog.push({ timestamp: new Date().toISOString(), sessionId, operation: operation.type, risk: classification.riskName, decision, path: operation.path });
    if (this.auditLog.length > 200) this.auditLog.shift();
    return {
      ok: true,
      decision,
      classification,
      validation,
      sandboxPolicy,
      rollbackPlan,
      requiresConfirmation: decision === 'pending_confirmation',
      confirmationPrompt: decision === 'pending_confirmation' ? buildConfirmationPrompt(operation, classification) : null,
      auditId: this.auditLog.length - 1,
    };
  }
  recordResult(sessionId, auditId, success) {
    if (!success) this.fuse.recordFailure();
    if (this.auditLog[auditId]) this.auditLog[auditId].result = success ? 'success' : 'failure';
  }
  getStats(sessionId) { return this.stats.summary(sessionId); }
  getFuseStatus() { return this.fuse.status(); }
  getAuditLog(limit = 50) { return this.auditLog.slice(-limit); }
  reset() { this.fuse.reset(); this.auditLog = []; }
}

function buildConfirmationPrompt(operation, classification) {
  return [
    `【执行门控·需要确认】`,
    `操作类型：${classification.operationType}`,
    `风险等级：${classification.riskName}（${classification.description}）`,
    operation.path ? `目标路径：${operation.path}` : '',
    operation.command ? `命令：${String(operation.command).slice(0, 200)}` : '',
    classification.adjustments.length > 0 ? `风险调整因子：${classification.adjustments.join('，')}` : '',
    classification.requireRollbackPlan ? '已生成回滚计划' : '',
    ``,
    `是否允许执行此操作？（允许/拒绝）`,
  ].filter(Boolean).join('\n');
}

// ============================================================
// 十一、兼容函数
// ============================================================
export function createExecGatePrompt(objective, intensity = 'medium') {
  const tier = EXECGATE_TIERS[intensity] || EXECGATE_TIERS.medium;
  return [
    `【Think 执行门控·${tier.label}档激活】`,
    `所有工具调用/代码执行/文件操作/网络请求必须经过执行门控：`,
    `1. 风险分类（5级：安全/低/中/高/极高）`,
    `2. 参数强校验（类型/范围/格式/枚举）`,
    `3. 沙盒策略（无/轻/标准/严格/隔离）`,
    `4. 高风险操作需要确认，极高风险需要回滚计划`,
    `5. 三层熔断（操作数/高风险数/失败率）`,
    `自动批准上限：${tier.autoApproveUpTo}，沙盒执行：${tier.sandboxEnforcement}`,
    `目标：${String(objective || '').slice(0, 300)}`,
  ].join('\n');
}
