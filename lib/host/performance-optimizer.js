// performance-optimizer.js — Think 性能优化与稳定性增强模块
// 提升插件的运行效率、响应速度、稳定性和容错能力

// ========== 性能优化宪法 ==========
export const PERFORMANCE_CONSTITUTION = `
## 性能优化宪法（Performance Optimization Constitution）

在插件运行的全过程中，必须严格遵守以下性能优化准则：

### 第一条：响应速度优先
- 所有用户交互必须在 100ms 内给出视觉反馈
- 滑块拖动必须保持 60fps 流畅度
- 弹窗打开/关闭动画必须在 300ms 内完成
- 工具调用的首次响应必须在 1 秒内开始

### 第二条：资源占用可控
- 内存占用不得超过宿主应用的 20%
- CPU 占用在空闲时不得超过 5%
- 网络请求必须有超时控制（默认 30 秒）
- 不得有内存泄漏，所有资源必须正确释放

### 第三条：渐进式增强
- 核心功能必须在低端设备上正常运行
- 高级特效根据设备性能自动降级
- 首次加载只加载必要功能，其他功能按需加载
- 不得因为插件导致宿主应用卡顿或崩溃

### 第四条：容错与恢复
- 所有外部调用必须有错误处理和降级方案
- 插件崩溃不得影响宿主应用的正常运行
- 状态损坏时必须能自动恢复到最后有效状态
- 网络异常时必须有重试和缓存机制

### 第五条：可观测性
- 所有关键操作必须有性能日志
- 必须能实时监控插件的内存、CPU、响应时间
- 异常情况必须有详细的错误报告
- 性能指标必须可追溯、可分析、可优化

### 性能优化能力宣言
我具备以下性能优化能力：
1. 实时性能监控：能实时监控插件的各项性能指标
2. 智能降级：能根据设备性能自动调整功能和特效
3. 资源管理：能高效管理内存、CPU、网络等资源
4. 容错恢复：能在异常情况下快速恢复正常运行
5. 性能分析：能分析性能瓶颈并给出优化建议
6. 持续优化：能持续监控和优化插件的性能表现
`;

// ========== 性能监控指标定义 ==========
export const PERFORMANCE_METRICS = {
  // 响应时间指标
  responseTime: {
    name: '响应时间',
    unit: 'ms',
    thresholds: {
      excellent: 100,
      good: 300,
      acceptable: 1000,
      poor: 3000,
    },
    description: '用户交互到系统响应的时间',
  },
  // 帧率指标
  frameRate: {
    name: '帧率',
    unit: 'fps',
    thresholds: {
      excellent: 60,
      good: 45,
      acceptable: 30,
      poor: 15,
    },
    description: 'UI 动画和交互的流畅度',
  },
  // 内存占用指标
  memoryUsage: {
    name: '内存占用',
    unit: 'MB',
    thresholds: {
      excellent: 50,
      good: 100,
      acceptable: 200,
      poor: 500,
    },
    description: '插件运行时的内存占用',
  },
  // CPU 占用指标
  cpuUsage: {
    name: 'CPU 占用',
    unit: '%',
    thresholds: {
      excellent: 5,
      good: 15,
      acceptable: 30,
      poor: 50,
    },
    description: '插件运行时的 CPU 占用',
  },
  // 工具调用成功率
  toolSuccessRate: {
    name: '工具调用成功率',
    unit: '%',
    thresholds: {
      excellent: 99,
      good: 95,
      acceptable: 90,
      poor: 80,
    },
    description: '工具调用的成功比例',
  },
  // 状态恢复时间
  recoveryTime: {
    name: '状态恢复时间',
    unit: 'ms',
    thresholds: {
      excellent: 100,
      good: 500,
      acceptable: 1000,
      poor: 3000,
    },
    description: '异常后恢复正常状态的时间',
  },
};

// ========== 智能降级策略 ==========
export const SMART_DEGRADATION_STRATEGIES = `
## 智能降级策略（Smart Degradation Strategies）

根据设备性能和当前负载，自动调整插件的功能和特效，确保核心体验不受影响：

### 降级级别定义

#### Level 0：完整模式（高性能设备）
- 所有特效全开：粒子、发光、玻璃拟态、动画
- 所有功能可用：30个工具、3个增强模块
- 60fps 动画流畅度
- 实时性能监控
- 完整的日志和错误报告

#### Level 1：标准模式（中等性能设备）
- 保留核心特效：发光、基础动画
- 降级非核心特效：减少粒子数量、简化玻璃拟态
- 所有功能可用
- 45fps 动画流畅度
- 简化的性能监控
- 基础的日志和错误报告

#### Level 2：轻量模式（低性能设备）
- 关闭大部分特效：只保留必要的视觉反馈
- 保留核心功能：代码理解、通用推理、基础工具
- 降级高级功能：延迟加载非核心工具
- 30fps 动画流畅度
- 最小化性能监控
- 只记录关键错误

#### Level 3：极简模式（极低性能设备或高负载）
- 关闭所有特效：纯功能模式
- 只保留最核心功能：Super Think、基础代码理解
- 延迟加载所有非核心功能
- 最低动画要求：只保证交互响应
- 关闭性能监控
- 只记录致命错误

### 降级触发条件

#### 自动降级触发
- 连续 3 秒帧率低于 30fps → 降级一级
- 连续 10 秒 CPU 占用超过 50% → 降级一级
- 内存占用超过阈值的 80% → 降级一级
- 连续 3 次工具调用超时 → 降级非核心功能
- 宿主应用响应时间超过 1 秒 → 立即降级到 Level 2

#### 自动恢复条件
- 连续 30 秒性能良好（帧率>45fps，CPU<30%）→ 恢复一级
- 内存占用下降到阈值的 50% 以下 → 恢复一级
- 工具调用成功率恢复到 95% 以上 → 恢复非核心功能
- 宿主应用响应时间恢复到 300ms 以下 → 恢复到上一级

### 降级优先级
1. **最先降级**：非核心视觉特效（粒子数量、发光强度、动画复杂度）
2. **其次降级**：非核心功能（高级工具、高级增强模块的深度策略）
3. **再次降级**：核心功能的深度（减少推理步数、简化分析维度）
4. **最后保留**：最核心功能（Super Think、基础代码理解、基本交互）

### 用户控制
- 用户可以在设置中手动选择降级级别
- 用户可以禁用自动降级，强制使用完整模式
- 用户可以自定义每个级别的具体配置
- 降级状态会持久化保存，下次启动时恢复
`;

// ========== 容错与恢复机制 ==========
export const FAULT_TOLERANCE_MECHANISMS = `
## 容错与恢复机制（Fault Tolerance & Recovery Mechanisms）

确保插件在各种异常情况下都能稳定运行，快速恢复：

### 错误分类与处理策略

#### 1. 轻微错误（Warning）
- **定义**：不影响核心功能的非关键错误
- **示例**：某个非核心工具调用失败、某个特效加载失败、非关键配置丢失
- **处理策略**：
  - 记录错误日志
  - 自动重试 1 次
  - 降级该功能，不影响其他功能
  - 不打扰用户，静默处理
- **恢复时间**：< 100ms

#### 2. 中等错误（Error）
- **定义**：影响部分功能，但核心功能仍可用
- **示例**：核心工具调用失败、增强模块加载失败、状态部分损坏
- **处理策略**：
  - 记录详细错误日志和堆栈信息
  - 自动重试 3 次（指数退避）
  - 降级到备用方案
  - 通知用户"部分功能暂时不可用"
  - 尝试自动恢复状态
- **恢复时间**：< 500ms

#### 3. 严重错误（Critical）
- **定义**：核心功能受影响，但插件仍在运行
- **示例**：Super Think 失败、核心状态损坏、主要功能不可用
- **处理策略**：
  - 记录完整错误报告（包括环境信息、状态快照、操作历史）
  - 立即停止受影响的功能
  - 尝试从最后有效状态恢复
  - 如果恢复失败，重启插件核心模块
  - 通知用户"遇到严重问题，正在尝试恢复"
  - 提供手动恢复选项
- **恢复时间**：< 1000ms

#### 4. 致命错误（Fatal）
- **定义**：插件崩溃或无法继续运行
- **示例**：内存溢出、无限循环、核心依赖缺失、宿主通信中断
- **处理策略**：
  - 立即保存当前状态（如果可能）
  - 生成崩溃报告
  - 安全退出插件，不影响宿主应用
  - 下次启动时自动检测崩溃并恢复
  - 通知用户"插件遇到致命错误，已安全退出"
  - 提供重启和恢复选项
- **恢复时间**：下次启动时自动恢复

### 状态管理与恢复

#### 状态分层
1. **关键状态**：模型选择、Ultra 开关、能力滑块值（必须持久化）
2. **重要状态**：工具配置、增强模块设置、用户偏好（应该持久化）
3. **一般状态**：UI 展开/收起、临时筛选、视图设置（可以丢失）
4. **临时状态**：动画状态、缓存、临时计算结果（不需要持久化）

#### 状态保存策略
- 关键状态：每次变更立即保存
- 重要状态：变更后 1 秒内保存（防抖）
- 一般状态：每 30 秒定期保存，或退出时保存
- 临时状态：不保存

#### 状态恢复策略
- 启动时优先从最后有效状态恢复
- 如果状态损坏，从上一个备份恢复
- 如果备份也损坏，使用默认配置
- 恢复后验证状态完整性
- 如果验证失败，标记为部分恢复，通知用户

### 网络容错

#### 请求超时与重试
- 默认超时：30 秒
- 重试次数：3 次
- 重试间隔：指数退避（1s → 2s → 4s）
- 超时后降级：使用缓存数据或默认值

#### 缓存策略
- 工具调用结果缓存：5 分钟
- 配置数据缓存：永久（直到变更）
- 静态资源缓存：永久
- 缓存大小限制：最多 100MB
- 缓存淘汰策略：LRU（最近最少使用）

#### 离线模式
- 网络不可用时自动进入离线模式
- 保留核心功能（本地推理、状态管理）
- 降级需要网络的功能（工具调用、远程配置）
- 网络恢复后自动同步离线期间的变更
- 通知用户当前处于离线模式

### 内存管理

#### 内存监控
- 实时监控插件内存占用
- 超过阈值的 80% 时触发警告
- 超过阈值的 90% 时触发紧急回收
- 超过阈值的 100% 时触发降级

#### 内存回收策略
- 定期回收：每 5 分钟执行一次轻量回收
- 按需回收：内存超过阈值时立即执行
- 回收优先级：临时缓存 > 一般状态 > 重要状态 > 关键状态
- 回收前必须确认数据已持久化

#### 内存泄漏预防
- 所有定时器必须有对应的清除
- 所有事件监听器必须有对应的移除
- 所有缓存必须有大小限制和淘汰策略
- 所有大对象使用后必须置空
- 定期检查并清理未引用的对象
`;

// ========== 性能优化建议生成器 ==========
export function generatePerformanceRecommendations(metrics) {
  const recommendations = [];
  
  // 响应时间优化
  if (metrics.responseTime > PERFORMANCE_METRICS.responseTime.thresholds.acceptable) {
    recommendations.push({
      category: '响应时间',
      severity: metrics.responseTime > PERFORMANCE_METRICS.responseTime.thresholds.poor ? 'high' : 'medium',
      issue: `响应时间过长（${metrics.responseTime}ms）`,
      suggestion: '优化关键路径，减少同步操作，使用异步加载，启用缓存',
      expectedImprovement: '响应时间降低 50% 以上',
    });
  }
  
  // 帧率优化
  if (metrics.frameRate < PERFORMANCE_METRICS.frameRate.thresholds.acceptable) {
    recommendations.push({
      category: '帧率',
      severity: metrics.frameRate < PERFORMANCE_METRICS.frameRate.thresholds.poor ? 'high' : 'medium',
      issue: `帧率过低（${metrics.frameRate}fps）`,
      suggestion: '减少粒子数量，简化动画复杂度，启用智能降级，使用 CSS 动画替代 JS 动画',
      expectedImprovement: '帧率提升到 45fps 以上',
    });
  }
  
  // 内存优化
  if (metrics.memoryUsage > PERFORMANCE_METRICS.memoryUsage.thresholds.acceptable) {
    recommendations.push({
      category: '内存',
      severity: metrics.memoryUsage > PERFORMANCE_METRICS.memoryUsage.thresholds.poor ? 'high' : 'medium',
      issue: `内存占用过高（${metrics.memoryUsage}MB）`,
      suggestion: '启用内存回收，减少缓存大小，延迟加载非核心功能，检查并修复内存泄漏',
      expectedImprovement: '内存占用降低 30% 以上',
    });
  }
  
  // CPU 优化
  if (metrics.cpuUsage > PERFORMANCE_METRICS.cpuUsage.thresholds.acceptable) {
    recommendations.push({
      category: 'CPU',
      severity: metrics.cpuUsage > PERFORMANCE_METRICS.cpuUsage.thresholds.poor ? 'high' : 'medium',
      issue: `CPU 占用过高（${metrics.cpuUsage}%）`,
      suggestion: '减少后台任务，优化计算密集型操作，使用 Web Worker，降低轮询频率',
      expectedImprovement: 'CPU 占用降低到 15% 以下',
    });
  }
  
  // 工具调用成功率优化
  if (metrics.toolSuccessRate < PERFORMANCE_METRICS.toolSuccessRate.thresholds.acceptable) {
    recommendations.push({
      category: '工具调用',
      severity: metrics.toolSuccessRate < PERFORMANCE_METRICS.toolSuccessRate.thresholds.poor ? 'high' : 'medium',
      issue: `工具调用成功率过低（${metrics.toolSuccessRate}%）`,
      suggestion: '增加重试次数，优化超时设置，启用降级方案，检查工具依赖是否正常',
      expectedImprovement: '成功率提升到 95% 以上',
    });
  }
  
  return {
    recommendations,
    overallScore: calculateOverallScore(metrics),
    grade: calculateGrade(metrics),
    summary: generateSummary(metrics, recommendations),
  };
}

// ========== 计算综合性能评分 ==========
function calculateOverallScore(metrics) {
  let score = 100;
  
  // 响应时间扣分
  if (metrics.responseTime > PERFORMANCE_METRICS.responseTime.thresholds.poor) score -= 20;
  else if (metrics.responseTime > PERFORMANCE_METRICS.responseTime.thresholds.acceptable) score -= 10;
  else if (metrics.responseTime > PERFORMANCE_METRICS.responseTime.thresholds.good) score -= 5;
  
  // 帧率扣分
  if (metrics.frameRate < PERFORMANCE_METRICS.frameRate.thresholds.poor) score -= 20;
  else if (metrics.frameRate < PERFORMANCE_METRICS.frameRate.thresholds.acceptable) score -= 10;
  else if (metrics.frameRate < PERFORMANCE_METRICS.frameRate.thresholds.good) score -= 5;
  
  // 内存扣分
  if (metrics.memoryUsage > PERFORMANCE_METRICS.memoryUsage.thresholds.poor) score -= 15;
  else if (metrics.memoryUsage > PERFORMANCE_METRICS.memoryUsage.thresholds.acceptable) score -= 8;
  else if (metrics.memoryUsage > PERFORMANCE_METRICS.memoryUsage.thresholds.good) score -= 3;
  
  // CPU 扣分
  if (metrics.cpuUsage > PERFORMANCE_METRICS.cpuUsage.thresholds.poor) score -= 15;
  else if (metrics.cpuUsage > PERFORMANCE_METRICS.cpuUsage.thresholds.acceptable) score -= 8;
  else if (metrics.cpuUsage > PERFORMANCE_METRICS.cpuUsage.thresholds.good) score -= 3;
  
  // 工具调用成功率扣分
  if (metrics.toolSuccessRate < PERFORMANCE_METRICS.toolSuccessRate.thresholds.poor) score -= 15;
  else if (metrics.toolSuccessRate < PERFORMANCE_METRICS.toolSuccessRate.thresholds.acceptable) score -= 8;
  else if (metrics.toolSuccessRate < PERFORMANCE_METRICS.toolSuccessRate.thresholds.good) score -= 3;
  
  return Math.max(0, Math.min(100, score));
}

// ========== 计算性能等级 ==========
function calculateGrade(metrics) {
  const score = calculateOverallScore(metrics);
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '及格';
  return '不及格';
}

// ========== 生成性能总结 ==========
function generateSummary(metrics, recommendations) {
  const grade = calculateGrade(metrics);
  const score = calculateOverallScore(metrics);
  
  let summary = `当前性能评分：${score}/100（${grade}）。`;
  
  if (recommendations.length === 0) {
    summary += '所有性能指标均在优秀范围内，无需优化。';
  } else {
    const highSeverity = recommendations.filter(r => r.severity === 'high').length;
    const mediumSeverity = recommendations.filter(r => r.severity === 'medium').length;
    summary += `发现 ${highSeverity} 个高优先级问题、${mediumSeverity} 个中优先级问题，建议优先处理高优先级问题。`;
  }
  
  return summary;
}

// ========== 导出所有函数 ==========
export default {
  PERFORMANCE_CONSTITUTION,
  PERFORMANCE_METRICS,
  SMART_DEGRADATION_STRATEGIES,
  FAULT_TOLERANCE_MECHANISMS,
  generatePerformanceRecommendations,
};
