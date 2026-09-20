// Think constants shared by host and client builds.

export const PLUGIN_NAME = 'thinking-ultra';
export const PLUGIN_VERSION = '0.1.0';

export const API_PREFIX = '/thinking-ultra/api';
export const EVENTS_PATH = '/thinking-ultra/events';

export const CONFIG_FILENAME = 'thinking-ultra.config.json';

export const EFFORT_ULTRA = 'ultra';
export const EFFORT_ULTRA_LABEL = 'Ultra';

export const SLIDER_NOTCHES = 6; // 六档思考滑杆
export const SLIDER_EXTREME_LEVEL = 5; // 绝顶（原v0.14档位，已内置）
export const SLIDER_LABELS = ['低', '中', '高', '超高', '极高', '绝顶']         ;
export const SLIDER_EXTREME_LABEL = '绝顶';

export const SLIDER_DURATION_HINTS = [
  '约 0.5–2h 工况',
  '约 2–4h 工况',
  '约 4–6h 工况',
  '约 10h+ 稳定工况',
  '约 12h+ 工况',
  '约 14h+ 极限工况',
]         ;

export const SLIDER_NAMES = ['长期代码稳定性', 'Agent任务流程稳定性', '长会话记忆稳定性']         ;

export const MODULE_DEFS = [
  { key: 'review', label: '自省复盘增强', desc: '每轮任务结束自我校验，过滤套话，识别逻辑漏洞，回传修正提示' },
  { key: 'branches', label: '多分支推演广度', desc: '并行生成多条推演分支，对比优劣，择优向下执行' },
  { key: 'cache', label: '上下文&KV缓存优化', desc: '过滤冗余重复token，优化长会话KV命中，缓解上下文膨胀' },
  { key: 'snapshot', label: '错误快照回滚熔断', desc: '定时保存状态快照，检测漂移与连续无效输出，自动回滚' },
  { key: 'project', label: '多嵌套项目解析增强', desc: '深度扫描多文件工程，提取依赖与接口，整理项目上下文' },
  { key: 'compat', label: '兼容性适配层', desc: '版本兼容补丁 · 第三方插件隔离 · 异常隔离沙箱', folded: true },
]         ;

export const COMPAT_SUB_DEFS = [
  { key: 'compatVersion', label: 'Harness版本兼容补丁', desc: '适配不同小版本接口差异，参数兼容转换' },
  { key: 'compatIsolation', label: '第三方协同插件隔离', desc: '隔离变量与事件冲突，防止多插件互相干扰' },
  { key: 'compatSandbox', label: '异常隔离沙箱', desc: '捕获全部内部异常，报错不击穿宿主，自动降级原生逻辑' },
]         ;

export const GLOBAL_DEFS = [
  { key: 'cache', label: '增强缓存优化', desc: '全局总开关：控制整套缓存优化模块是否生效' },
  { key: 'autosnapshot', label: '自动迭代快照保存', desc: '自动定时持久化Agent任务快照，为回滚熔断提供状态数据源' },
  { key: 'driftAlert', label: '超长任务漂移告警', desc: '检测长会话偏移，UI告警并输出调试日志标记风险点' },
  { key: 'debugLog', label: '高级调试日志输出', desc: '输出模块状态、压测指标、快照记录、兼容层告警日志' },
]         ;



