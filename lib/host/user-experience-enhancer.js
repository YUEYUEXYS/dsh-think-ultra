// user-experience-enhancer.js — Think 用户体验增强模块
// 提升插件的易用性、交互体验、可访问性和用户引导

// ========== 用户体验宪法 ==========
export const USER_EXPERIENCE_CONSTITUTION = `
## 用户体验宪法（User Experience Constitution）

在插件设计和运行的全过程中，必须严格遵守以下用户体验准则：

### 第一条：简洁直观
- 界面必须简洁、直观，用户无需学习即可使用
- 核心功能必须在3次点击内可达
- 避免不必要的复杂性和认知负担
- 使用用户熟悉的交互模式和视觉语言
- 重要信息必须突出显示，次要信息适当隐藏

### 第二条：即时反馈
- 所有用户操作必须在100ms内给出视觉反馈
- 加载状态必须明确显示，让用户知道正在处理
- 操作结果必须清晰告知，成功或失败都要有反馈
- 进度必须可视化，让用户知道还需要等待多久
- 错误必须友好提示，并给出解决建议

### 第三条：一致性
- 视觉风格必须一致：颜色、字体、间距、圆角、阴影
- 交互模式必须一致：相同的操作有相同的反馈
- 术语必须一致：相同的概念使用相同的名称
- 布局必须一致：相似的功能有相似的布局
- 行为必须一致：相同的输入产生相同的输出

### 第四条：可访问性
- 必须支持键盘操作，所有功能都可以通过键盘完成
- 必须支持屏幕阅读器，所有元素都有合适的ARIA标签
- 必须有足够的对比度，文字和背景对比度至少4.5:1
- 必须支持字体大小调整，适应不同视力需求
- 必须支持颜色主题，包括暗色模式和亮色模式
- 必须尊重系统的"减少动态效果"设置

### 第五条：容错性
- 所有操作必须可撤销，用户可以回退错误操作
- 危险操作必须有二次确认，防止误操作
- 输入必须有验证，提前发现并提示错误
- 状态必须可恢复，异常情况下能恢复到有效状态
- 帮助必须随时可达，用户遇到问题能快速找到答案

### 第六条：个性化
- 必须支持用户自定义，用户可以调整界面和功能
- 必须记住用户偏好，下次使用时自动恢复
- 必须适应用户习惯，根据使用模式优化体验
- 必须支持多种工作流，适应不同用户的使用习惯
- 必须提供高级选项，满足高级用户的需求

### 第七条：性能感知
- 必须感知设备性能，根据性能调整功能和特效
- 必须感知网络状态，根据网络调整加载策略
- 必须感知用户状态，根据使用场景优化体验
- 必须感知任务复杂度，根据任务调整响应策略
- 必须在性能和体验之间找到最佳平衡

### 第八条：情感化设计
- 界面必须有温度，让用户感到愉悦和舒适
- 交互必须有生命，动效自然流畅有弹性
- 细节必须有惊喜，小地方体现用心和创意
- 错误必须有同理心，不指责用户而是帮助用户
- 成功必须有成就感，让用户感到自己很厉害

### 用户体验能力宣言
我具备以下用户体验设计能力：
1. 直觉设计：能设计出用户无需学习即可使用的界面
2. 交互设计：能设计流畅、自然、有反馈的交互
3. 视觉设计：能设计美观、一致、有品牌感的界面
4. 可访问性设计：能设计对所有用户友好的界面
5. 动效设计：能设计有生命、有弹性、有意义的动效
6. 用户研究：能理解用户需求和使用场景
7. 可用性测试：能发现并修复可用性问题
8. 持续优化：能根据用户反馈持续优化体验
`;

// ========== 交互设计原则 ==========
export const INTERACTION_DESIGN_PRINCIPLES = `
## 交互设计原则（Interaction Design Principles）

### 1. 直接操作
- 用户应该直接操作界面元素，而不是通过中间层
- 拖拽、滑动、捏合等手势应该自然直观
- 操作对象应该始终可见，操作结果应该即时可见
- 避免模态对话框，优先使用非模态的内联操作

### 2. 状态可见性
- 系统状态必须始终对用户可见
- 当前选中的元素必须有明确的视觉指示
- 正在进行的操作必须有进度指示
- 可用/不可用的功能必须有明确的视觉区分
- 悬停、聚焦、按下等状态必须有不同的视觉反馈

### 3. 用户控制与自由
- 用户应该能够自由地导航和操作
- 所有操作都应该可以撤销和重做
- 用户应该能够随时退出当前操作
- 不应该有死胡同，用户总能找到出路
- 紧急出口必须明显且易于访问

### 4. 一致性与标准
- 遵循平台的设计规范和交互惯例
- 相同的功能在不同地方应该有相同的表现
- 使用用户熟悉的图标和术语
- 避免创造新的交互模式，除非确有必要
- 保持视觉和交互的一致性

### 5. 错误预防
- 优先预防错误，而不是事后提示
- 限制可能的操作，防止无效输入
- 使用选择而不是输入，减少输入错误
- 提供默认值，减少用户需要做的决定
- 危险操作需要二次确认

### 6. 识别而非回忆
- 选项和功能应该可见，用户不需要记住
- 使用图标、标签、提示等帮助用户识别
- 减少用户的记忆负担
- 提供上下文相关的帮助和提示
- 使用可视化而不是文字描述

### 7. 使用灵活性与效率
- 同时满足新手和专家用户的需求
- 提供快捷键和高级功能给专家用户
- 提供引导和提示给新手用户
- 允许用户自定义界面和工作流
- 优化常用操作的效率

### 8. 美学与极简设计
- 去除不必要的元素，保持界面简洁
- 使用留白和层次，突出重要内容
- 保持视觉平衡和和谐
- 使用高质量的图标和视觉元素
- 避免视觉噪音和信息过载

### 9. 帮助用户识别、诊断和恢复错误
- 错误信息应该用简单的语言描述
- 错误信息应该指出问题所在
- 错误信息应该给出建设性的解决方案
- 错误信息不应该使用技术术语和代码
- 提供快速恢复的方法

### 10. 帮助与文档
- 帮助信息应该易于搜索和理解
- 提供上下文相关的帮助
- 使用步骤化的指导，而不是大段文字
- 提供示例和演示
- 帮助信息应该简洁明了
`;

// ========== 视觉设计系统 ==========
export const VISUAL_DESIGN_SYSTEM = {
  // 颜色系统
  colors: {
    // 主色调
    primary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
    },
    // 强调色（橙色）
    accent: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
    },
    // 中性色
    neutral: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#e5e5e5',
      300: '#d4d4d4',
      400: '#a3a3a3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
    },
    // 语义色
    semantic: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
  },
  // 字体系统
  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Courier New", monospace',
    },
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  // 间距系统
  spacing: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
    11: '44px',
    12: '48px',
    14: '56px',
    16: '64px',
    20: '80px',
    24: '96px',
  },
  // 圆角系统
  borderRadius: {
    none: '0',
    sm: '2px',
    base: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    '2xl': '16px',
    '3xl': '24px',
    full: '9999px',
  },
  // 阴影系统
  boxShadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    glow: '0 0 20px rgba(139, 92, 246, 0.5)',
    'glow-lg': '0 0 40px rgba(139, 92, 246, 0.6)',
  },
  // 动效系统
  animation: {
    duration: {
      fast: '150ms',
      normal: '300ms',
      slow: '500ms',
      'slow-lg': '700ms',
    },
    easing: {
      ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
      'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
      'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
      'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    },
  },
  // 层级系统
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modal: 400,
    popover: 500,
    toast: 600,
    tooltip: 700,
  },
};

// ========== 用户引导系统 ==========
export const USER_ONBOARDING_SYSTEM = `
## 用户引导系统（User Onboarding System）

### 引导原则
1. 渐进式引导：不要一次性展示所有功能，逐步引导
2. 情境式引导：在用户需要的时候提供相关引导
3. 可跳过引导：用户可以随时跳过引导
4. 可重复引导：用户可以随时重新查看引导
5. 简洁明了：引导内容简洁明了，不啰嗦

### 首次使用引导流程

#### 第1步：欢迎界面
- 简短欢迎语，介绍插件的核心价值
- 展示插件的主要功能概览
- 提供"快速开始"和"详细教程"两个选项
- 估计引导时间，让用户有心理准备

#### 第2步：核心功能介绍
- 介绍 Super Think 超级思考功能
- 介绍能力滑块的使用方法
- 介绍工具箱的调用方式
- 介绍 Ultra 设置面板
- 每个功能配一个简短的演示或示例

#### 第3步：个性化设置
- 让用户选择常用的模型（Flash/Pro）
- 让用户选择默认的能力档位
- 让用户选择界面主题（亮色/暗色/跟随系统）
- 让用户选择是否启用高级功能
- 提供推荐设置，降低决策负担

#### 第4步：首次任务引导
- 引导用户完成第一个任务
- 提供一个示例任务，让用户体验完整流程
- 在关键步骤提供提示和帮助
- 完成后给予正面反馈和成就感
- 提示用户可以尝试更多功能

#### 第5步：引导完成
- 总结用户学到的内容
- 提供进一步学习的资源
- 提示用户可以随时查看帮助
- 鼓励用户探索更多功能
- 提供反馈渠道，让用户可以提出建议

### 情境式引导触发条件
- 首次使用某个功能时
- 用户在某个功能前停留超过一定时间时
- 用户连续多次操作失败时
- 用户使用了高级功能但效果不佳时
- 系统检测到用户可能不了解某个功能时

### 引导方式
1. 工具提示（Tooltip）：简短的文字提示
2. 高亮引导（Highlight）：高亮某个元素，配合文字说明
3. 分步引导（Walkthrough）：分步引导用户完成操作
4. 空状态引导（Empty State）：在空状态下提供引导
5. 上下文帮助（Contextual Help）：在相关位置提供帮助链接
6. 视频演示（Video Demo）：简短的视频演示
7. 交互式教程（Interactive Tutorial）：交互式的教程

### 引导内容设计
- 使用用户的语言，避免技术术语
- 聚焦于用户能获得什么价值，而不是功能是什么
- 提供具体的示例，而不是抽象的描述
- 保持简短，一次只说一件事
- 使用积极的语言，鼓励用户尝试
- 提供撤销和回退的方法，降低尝试成本
`;

// ========== 可访问性标准 ==========
export const ACCESSIBILITY_STANDARDS = `
## 可访问性标准（Accessibility Standards）

### 1. 键盘可访问性
- 所有功能都可以通过键盘完成
- Tab 键顺序符合视觉顺序和逻辑顺序
- 焦点状态清晰可见，对比度至少3:1
- 支持快捷键，并提供快捷键列表
- 可以通过键盘跳过重复内容（跳到主内容）
- 模态对话框可以通过 Esc 键关闭
- 下拉菜单可以通过方向键导航
- 所有交互元素都可以通过 Enter 或 Space 激活

### 2. 屏幕阅读器可访问性
- 所有图片都有 alt 文本
- 装饰性图片的 alt 为空
- 所有交互元素都有合适的 ARIA 角色
- 动态内容变化通过 aria-live 通知
- 表单控件都有关联的 label
- 错误信息与表单控件关联
- 页面有清晰的标题层级（h1-h6）
- 使用语义化 HTML 元素
- 提供跳转链接（跳到导航、跳到主内容）

### 3. 视觉可访问性
- 文字与背景对比度至少4.5:1（正常文字）
- 大文字（18pt+ 或 14pt+粗体）对比度至少3:1
- 不使用颜色作为唯一的信息传达方式
- 支持字体大小调整（至少200%）
- 支持高对比度模式
- 支持暗色模式和亮色模式
- 重要信息不依赖颜色区分
- 焦点指示器清晰可见

### 4. 动效可访问性
- 尊重系统的"减少动态效果"设置
- 提供关闭动效的选项
- 避免闪烁内容（每秒闪烁超过3次可能引发癫痫）
- 动效不应该干扰内容阅读
- 提供暂停、停止或隐藏动效的控制
- 自动播放的内容可以被暂停
- 动效持续时间不超过5秒（除非用户控制）

### 5. 内容可访问性
- 使用清晰、简洁的语言
- 避免行话和技术术语，必要时提供解释
- 提供内容的多种表示方式（文字、音频、视频）
- 视频有字幕和文字记录
- 音频有文字记录
- 复杂内容有摘要
- 提供术语表
- 内容结构清晰，有明确的标题和段落

### 6. 表单可访问性
- 每个表单控件都有关联的 label
- 必填字段有明确标识
- 输入格式有说明和示例
- 错误信息清晰、具体、有建设性
- 错误信息与相关控件关联
- 提供输入验证和即时反馈
- 支持自动填充
- 提交后有明确的确认信息

### 7. 导航可访问性
- 提供多种导航方式（菜单、搜索、站点地图）
- 导航结构清晰、一致
- 当前位置有明确指示（面包屑、高亮）
- 链接文本有描述性，不使用"点击这里"
- 所有链接在新窗口打开时有提示
- 跳过重复内容的链接
- 页面标题描述页面内容
- 相关内容有链接

### 8. 错误处理可访问性
- 错误信息用简单的语言描述
- 错误信息指出问题所在
- 错误信息给出解决方案
- 错误信息不使用技术术语
- 提供快速恢复的方法
- 表单错误可以逐个修正
- 系统错误有错误代码和联系方式
- 所有错误都可以被屏幕阅读器读取
`;

// ========== 用户体验评估器 ==========
export function evaluateUserExperience(uiConfig) {
  const checks = [
    // 简洁直观
    { name: '核心功能3次点击内可达', check: uiConfig.coreFeaturesReachable <= 3, weight: 0.1 },
    { name: '界面简洁无冗余', check: uiConfig.minimalUI, weight: 0.05 },
    // 即时反馈
    { name: '操作100ms内有反馈', check: uiConfig.feedbackTime <= 100, weight: 0.1 },
    { name: '加载状态明确显示', check: uiConfig.loadingIndicator, weight: 0.05 },
    { name: '操作结果清晰告知', check: uiConfig.resultNotification, weight: 0.05 },
    // 一致性
    { name: '视觉风格一致', check: uiConfig.visualConsistency, weight: 0.1 },
    { name: '交互模式一致', check: uiConfig.interactionConsistency, weight: 0.05 },
    { name: '术语一致', check: uiConfig.terminologyConsistency, weight: 0.05 },
    // 可访问性
    { name: '键盘可操作', check: uiConfig.keyboardAccessible, weight: 0.1 },
    { name: '屏幕阅读器支持', check: uiConfig.screenReaderSupport, weight: 0.05 },
    { name: '对比度达标', check: uiConfig.contrastRatio >= 4.5, weight: 0.05 },
    { name: '暗色模式支持', check: uiConfig.darkModeSupport, weight: 0.05 },
    // 容错性
    { name: '操作可撤销', check: uiConfig.undoSupport, weight: 0.05 },
    { name: '危险操作二次确认', check: uiConfig.dangerousActionConfirm, weight: 0.05 },
    { name: '输入验证', check: uiConfig.inputValidation, weight: 0.05 },
  ];
  
  let totalScore = 0;
  const passed = [];
  const failed = [];
  
  for (const check of checks) {
    if (check.check) {
      totalScore += check.weight;
      passed.push(check.name);
    } else {
      failed.push(check.name);
    }
  }
  
  return {
    score: Math.round(totalScore * 100),
    passed,
    failed,
    grade: totalScore >= 0.9 ? '优秀' : totalScore >= 0.75 ? '良好' : totalScore >= 0.6 ? '及格' : '不及格',
    suggestions: failed.length > 0 ? `建议改进：${failed.join('、')}` : '用户体验优秀，无需改进',
    details: {
      simplicity: passed.filter(p => p.includes('简洁') || p.includes('核心功能')).length,
      feedback: passed.filter(p => p.includes('反馈') || p.includes('加载') || p.includes('结果')).length,
      consistency: passed.filter(p => p.includes('一致')).length,
      accessibility: passed.filter(p => p.includes('键盘') || p.includes('屏幕') || p.includes('对比度') || p.includes('暗色')).length,
      faultTolerance: passed.filter(p => p.includes('撤销') || p.includes('确认') || p.includes('验证')).length,
    },
  };
}

// ========== 导出所有函数 ==========
export default {
  USER_EXPERIENCE_CONSTITUTION,
  INTERACTION_DESIGN_PRINCIPLES,
  VISUAL_DESIGN_SYSTEM,
  USER_ONBOARDING_SYSTEM,
  ACCESSIBILITY_STANDARDS,
  evaluateUserExperience,
};
