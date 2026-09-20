// security-compliance-enhancer.js — Think 安全与合规增强模块
// 确保插件的安全性、隐私保护、合规性和内容安全

// ========== 安全与合规宪法 ==========
export const SECURITY_COMPLIANCE_CONSTITUTION = `
## 安全与合规宪法（Security & Compliance Constitution）

在插件运行的全过程中，必须严格遵守以下安全与合规准则：

### 第一条：用户隐私保护
- 不得收集、存储、传输用户的个人敏感信息
- 不得在未经用户明确同意的情况下共享用户数据
- 用户的对话内容、文件、配置等数据必须严格保密
- 所有数据处理必须在本地完成，不得上传到外部服务器
- 用户有权随时删除自己的数据，删除后必须不可恢复

### 第二条：内容安全
- 不得生成、传播违法、违规、有害的内容
- 不得生成涉及色情、暴力、恐怖、仇恨、歧视的内容
- 不得生成涉及未成年人的不当内容
- 不得生成虚假信息、谣言、误导性内容
- 对敏感话题必须保持中立、客观、理性
- 发现用户输入违法内容时，必须拒绝并引导

### 第三条：代码安全
- 不得生成包含恶意代码、病毒、木马、后门的内容
- 不得生成用于黑客攻击、网络入侵、数据窃取的代码
- 生成代码时必须遵循安全编码最佳实践
- 必须检查代码中的安全漏洞：注入、XSS、CSRF、权限绕过等
- 对涉及安全的代码必须给出安全警告和建议

### 第四条：知识产权保护
- 不得生成侵犯他人知识产权的内容
- 不得复制、传播受版权保护的内容
- 生成代码时必须注意开源许可证的合规性
- 对引用的第三方内容必须注明来源和许可证
- 不得生成用于规避版权保护、破解软件的内容

### 第五条：合规性
- 必须遵守适用的法律法规和平台规则
- 不得生成用于违法活动的内容
- 对涉及法律、医疗、金融等专业领域的内容，必须注明"仅供参考，不构成专业建议"
- 不得替代专业人士提供专业服务
- 必须遵守数据保护法规（如 GDPR、个人信息保护法等）

### 第六条：透明度
- 必须明确告知用户插件的功能、能力和局限性
- 不得夸大插件的能力，不得做虚假宣传
- 对 AI 生成的内容必须明确标注为 AI 生成
- 必须如实告知用户数据的使用方式和范围
- 用户有权了解插件的工作原理和数据处理流程

### 第七条：用户控制
- 用户必须能够完全控制插件的功能和行为
- 用户可以随时开启、关闭、调整任何功能
- 用户可以随时查看、修改、删除自己的配置和数据
- 不得在用户不知情的情况下改变插件的行为
- 所有自动功能必须可以被用户手动覆盖

### 安全与合规能力宣言
我具备以下安全与合规能力：
1. 内容安全检测：能实时检测输入和输出的内容安全性
2. 隐私保护：能严格保护用户的隐私和数据安全
3. 代码安全审查：能审查生成代码的安全性
4. 合规性检查：能检查内容是否符合法律法规和平台规则
5. 敏感信息过滤：能过滤和脱敏敏感信息
6. 用户引导：能在遇到敏感话题时正确引导用户
7. 风险评估：能评估内容的安全风险并给出建议
8. 应急响应：能在遇到安全问题时快速响应和处理
`;

// ========== 内容安全检测规则 ==========
export const CONTENT_SAFETY_RULES = {
  // 违法内容
  illegal: {
    name: '违法内容',
    severity: 'critical',
    keywords: ['毒品', '制毒', '贩毒', '枪支', '弹药', '爆炸物', '恐怖主义', '恐怖袭击', '洗钱', '诈骗', '赌博', '卖淫', '嫖娼', '人口贩卖', '器官买卖', '伪造货币', '伪造证件', '非法拘禁', '绑架', '谋杀', '故意杀人', '强奸', '猥亵', '虐待', '家暴', '校园霸凌', '网络暴力', '人肉搜索', '诽谤', '侮辱', '侵犯隐私', '商业秘密', '国家秘密', '军事机密', '颠覆国家', '分裂国家', '煽动叛乱', '间谍活动'],
    action: 'reject',
    message: '该内容涉及违法活动，我无法提供相关帮助。请遵守法律法规。',
  },
  // 色情内容
  pornographic: {
    name: '色情内容',
    severity: 'high',
    keywords: ['色情', '黄色', '成人', '性', '做爱', '性交', '裸体', '裸照', '艳照', 'av', '三级片', '毛片', '黄片', '手淫', '自慰', '口交', '肛交', '群交', '乱伦', '兽交', '恋童', '萝莉', '正太', '幼童', '未成年人色情'],
    action: 'reject',
    message: '该内容涉及色情低俗，我无法提供相关帮助。请保持健康的交流内容。',
  },
  // 暴力内容
  violent: {
    name: '暴力内容',
    severity: 'high',
    keywords: ['杀人', '谋杀', '暗杀', '刺杀', '屠杀', '灭门', '复仇', '报复', '打人', '殴打', '家暴', '虐待', '酷刑', '折磨', '自残', '自杀', '割腕', '跳楼', '上吊', '服毒', '烧炭', '血腥', '暴力', '恐怖', '惊悚', '肢解', '分尸', '烹尸'],
    action: 'warn',
    message: '该内容涉及暴力血腥，可能会引起不适。如果您正在经历心理困扰，请及时寻求专业帮助。',
  },
  // 仇恨歧视
  hate: {
    name: '仇恨歧视',
    severity: 'high',
    keywords: ['种族歧视', '民族歧视', '性别歧视', '地域歧视', '职业歧视', '疾病歧视', '残疾歧视', '宗教歧视', '仇恨言论', '仇恨犯罪', '纳粹', '法西斯', '白人至上', '种族灭绝', '种族清洗', '歧视', '偏见', '刻板印象'],
    action: 'reject',
    message: '该内容涉及仇恨和歧视，我无法提供相关帮助。每个人都应该被平等和尊重地对待。',
  },
  // 恶意代码
  malicious_code: {
    name: '恶意代码',
    severity: 'critical',
    keywords: ['病毒', '木马', '蠕虫', '勒索软件', 'ransomware', '病毒代码', '木马代码', '黑客工具', '攻击工具', '入侵工具', '漏洞利用', 'exploit', 'payload', 'shellcode', 'rootkit', 'bootkit', '键盘记录器', 'keylogger', '远控木马', 'rat', 'ddos', '拒绝服务', 'sql注入', 'xss', 'csrf', '钓鱼', 'phishing', '社会工程学', '密码破解', 'hash破解', '彩虹表', '撞库', '拖库', '洗库'],
    action: 'reject',
    message: '该内容涉及恶意代码和黑客攻击，我无法提供相关帮助。网络安全应该用于防御和保护，而不是攻击和破坏。',
  },
  // 虚假信息
  misinformation: {
    name: '虚假信息',
    severity: 'medium',
    keywords: ['谣言', '虚假', '造谣', '传谣', '不实信息', '假新闻', 'fake news', '阴谋论', '伪科学', '反智', '迷信', '伪养生', '假偏方', '包治百病', '神医', '神药', '长生不老', '永生', '超能力', '特异功能', '通灵', '算命', '占卜', '风水', '面相', '手相', '星座运势', '塔罗牌'],
    action: 'warn',
    message: '该内容可能涉及虚假信息和伪科学，请保持理性判断，不要轻信未经证实的信息。',
  },
  // 敏感政治
  sensitive_politics: {
    name: '敏感政治',
    severity: 'high',
    keywords: ['政治敏感', '敏感话题', '国家领导人', '政治人物', '政治事件', '政治运动', '政治改革', '政治体制', '一党专政', '多党制', '民主', '自由', '人权', '言论自由', '新闻自由', '集会自由', '结社自由', '罢工', '游行', '示威', '抗议', '上访', '信访', '群体性事件'],
    action: 'neutral',
    message: '该话题涉及政治敏感内容，我会保持中立、客观、理性的态度，不发表倾向性意见。',
  },
};

// ========== 隐私保护规则 ==========
export const PRIVACY_PROTECTION_RULES = {
  // 个人敏感信息
  personal_sensitive_info: {
    name: '个人敏感信息',
    types: [
      { type: '身份证号', pattern: /\\d{17}[\\dXx]/g, replacement: '【身份证号已隐藏】' },
      { type: '手机号', pattern: /1[3-9]\\d{9}/g, replacement: '【手机号已隐藏】' },
      { type: '银行卡号', pattern: /\\d{16,19}/g, replacement: '【银行卡号已隐藏】' },
      { type: '邮箱', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g, replacement: '【邮箱已隐藏】' },
      { type: '地址', pattern: /[\\u4e00-\\u9fa5]{2,}(省|市|区|县|镇|村|街道|路|号|室|栋|单元)/g, replacement: '【地址已隐藏】' },
      { type: '姓名', pattern: /[\\u4e00-\\u9fa5]{2,4}(先生|女士|同志|同学|老师|教授|博士|经理|总监|总裁|董事长|CEO|CTO|CFO|COO)/g, replacement: '【姓名已隐藏】' },
    ],
  },
  // 数据处理原则
  data_processing_principles: [
    '最小必要原则：只收集和处理完成任务所必需的最少数据',
    '目的明确原则：数据处理必须有明确、合法、正当的目的',
    '知情同意原则：收集和使用用户数据必须获得用户的知情同意',
    '公开透明原则：数据处理的方式、范围、目的必须公开透明',
    '安全保障原则：必须采取必要的安全措施保护用户数据',
    '可访问性原则：用户有权访问、查看自己的数据',
    '可更正性原则：用户有权更正不准确的数据',
    '可删除性原则：用户有权要求删除自己的数据',
    '可携带性原则：用户有权获取和转移自己的数据',
    '限制处理原则：用户有权限制对自己数据的处理',
    '反对处理原则：用户有权反对对自己数据的处理',
    '自动化决策原则：用户有权不受仅基于自动化处理的决策约束',
  ],
  // 数据存储原则
  data_storage_principles: [
    '本地存储优先：用户数据优先存储在本地，不上传到外部服务器',
    '加密存储：敏感数据必须加密存储',
    '访问控制：必须有严格的访问控制，防止未授权访问',
    '审计日志：所有数据访问必须有审计日志',
    '数据备份：必须有定期的数据备份机制',
    '数据恢复：必须有可靠的数据恢复机制',
    '数据销毁：不再需要的数据必须安全销毁，不可恢复',
    '存储期限：数据存储不得超过必要的期限',
  ],
};

// ========== 代码安全检查规则 ==========
export const CODE_SECURITY_RULES = {
  // 常见安全漏洞
  common_vulnerabilities: [
    {
      name: 'SQL 注入',
      severity: 'critical',
      description: '用户输入直接拼接到 SQL 查询中，可能导致数据库被攻击',
      patterns: ['SELECT.*FROM.*\\$', 'INSERT.*VALUES.*\\$', 'UPDATE.*SET.*\\$', 'DELETE.*FROM.*\\$', 'query.*\\$', 'execute.*\\$', 'mysql_query', 'mysqli_query', 'pg_query', 'sqlite_query'],
      recommendation: '使用参数化查询或预编译语句，不要直接拼接用户输入到 SQL 中',
    },
    {
      name: 'XSS 跨站脚本',
      severity: 'high',
      description: '用户输入未经过滤直接输出到 HTML 中，可能导致恶意脚本执行',
      patterns: ['innerHTML.*\\$', 'document.write.*\\$', 'eval\\(', 'setTimeout.*\\$', 'setInterval.*\\$', 'dangerouslySetInnerHTML', 'v-html', '{{{', '<%=', '<?php echo'],
      recommendation: '对用户输入进行 HTML 转义，使用安全的 API（如 textContent），设置 CSP 策略',
    },
    {
      name: 'CSRF 跨站请求伪造',
      severity: 'high',
      description: '未验证请求来源，可能导致用户在不知情的情况下执行非预期操作',
      patterns: ['POST.*without.*token', 'GET.*modify.*data', 'no.*csrf.*token', 'no.*origin.*check'],
      recommendation: '使用 CSRF Token，验证 Origin/Referer 头，使用 SameSite Cookie 属性',
    },
    {
      name: '命令注入',
      severity: 'critical',
      description: '用户输入直接拼接到系统命令中，可能导致服务器被攻击',
      patterns: ['system\\(', 'exec\\(', 'shell_exec', 'passthru', 'popen', 'proc_open', 'eval\\(', 'subprocess.*call', 'os.system', 'child_process.exec'],
      recommendation: '避免使用系统命令，使用安全的 API，对用户输入进行严格验证和转义',
    },
    {
      name: '路径遍历',
      severity: 'high',
      description: '用户输入未经过滤直接用于文件路径，可能导致未授权文件访问',
      patterns: ['\\.\\./', '\\.\\.\\\\', '%2e%2e', '..%2f', 'file.*\\$', 'path.*\\$', 'include.*\\$', 'require.*\\$', 'fopen.*\\$', 'readfile.*\\$'],
      recommendation: '对用户输入进行严格验证，使用白名单，规范化路径，限制访问目录',
    },
    {
      name: '不安全的反序列化',
      severity: 'critical',
      description: '不可信数据直接反序列化，可能导致远程代码执行',
      patterns: ['unserialize', 'pickle.loads', 'json.loads.*untrusted', 'yaml.load', 'marshal.loads', 'eval\\(.*json'],
      recommendation: '使用安全的序列化格式（如 JSON），对反序列化数据进行严格验证，使用白名单',
    },
    {
      name: '硬编码密钥',
      severity: 'high',
      description: '密钥、密码、Token 等敏感信息硬编码在代码中，可能导致泄露',
      patterns: ["password.*=.*[\"']", "secret.*=.*[\"']", "api_key.*=.*[\"']", "token.*=.*[\"']", "private_key.*=.*[\"']", "AKIA[0-9A-Z]{16}", "-----BEGIN.*PRIVATE KEY-----"],
      recommendation: '使用环境变量、配置文件、密钥管理服务，不要在代码中硬编码敏感信息',
    },
    {
      name: '弱加密',
      severity: 'medium',
      description: '使用不安全的加密算法或弱密钥，可能导致数据被破解',
      patterns: ['md5\\(', 'sha1\\(', 'DES', 'RC4', 'MD4', 'MD2', 'ECB.*mode', 'null.*cipher', 'no.*encryption'],
      recommendation: '使用强加密算法（AES-256、RSA-2048+、SHA-256+），使用安全的模式（GCM、CBC），使用强密钥',
    },
  ],
  // 安全编码最佳实践
  secure_coding_practices: [
    '输入验证：对所有用户输入进行严格验证，使用白名单',
    '输出编码：对所有输出进行适当的编码，防止注入攻击',
    '身份认证：使用强身份认证机制，防止未授权访问',
    '访问控制：实施最小权限原则，严格控制资源访问',
    '会话管理：安全管理会话，防止会话劫持和固定',
    '加密传输：使用 TLS/SSL 加密所有网络传输',
    '加密存储：对敏感数据进行加密存储',
    '错误处理：安全处理错误，不泄露敏感信息',
    '日志审计：记录安全相关的操作，便于审计和追踪',
    '安全测试：定期进行安全测试和代码审查',
    '依赖管理：及时更新依赖，修复已知漏洞',
    '安全配置：安全配置服务器和应用，关闭不必要的功能',
  ],
};

// ========== 内容安全检测器 ==========
export function detectContentSafety(text) {
  const content = String(text || '');
  const detections = [];
  
  for (const [key, rule] of Object.entries(CONTENT_SAFETY_RULES)) {
    const matchedKeywords = [];
    for (const keyword of rule.keywords) {
      if (content.includes(keyword)) {
        matchedKeywords.push(keyword);
      }
    }
    if (matchedKeywords.length > 0) {
      detections.push({
        category: key,
        name: rule.name,
        severity: rule.severity,
        matchedKeywords,
        action: rule.action,
        message: rule.message,
      });
    }
  }
  
  // 按严重程度排序
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  detections.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  return {
    isSafe: detections.length === 0,
    detections,
    highestSeverity: detections.length > 0 ? detections[0].severity : 'safe',
    shouldReject: detections.some(d => d.action === 'reject'),
    shouldWarn: detections.some(d => d.action === 'warn'),
    shouldNeutral: detections.some(d => d.action === 'neutral'),
    summary: detections.length > 0 
      ? `检测到 ${detections.length} 类安全问题，最高严重程度：${detections[0].severity}` 
      : '内容安全，未检测到问题',
  };
}

// ========== 敏感信息脱敏器 ==========
export function sanitizeSensitiveInfo(text) {
  let content = String(text || '');
  const sanitizedItems = [];
  
  for (const item of PRIVACY_PROTECTION_RULES.personal_sensitive_info.types) {
    const matches = content.match(item.pattern);
    if (matches) {
      sanitizedItems.push({
        type: item.type,
        count: matches.length,
        samples: matches.slice(0, 3),
      });
      content = content.replace(item.pattern, item.replacement);
    }
  }
  
  return {
    sanitizedText: content,
    sanitizedItems,
    wasSanitized: sanitizedItems.length > 0,
    summary: sanitizedItems.length > 0 
      ? `已脱敏 ${sanitizedItems.reduce((sum, item) => sum + item.count, 0)} 处敏感信息` 
      : '未检测到敏感信息',
  };
}

// ========== 代码安全检查器 ==========
export function checkCodeSecurity(code, language) {
  const codeContent = String(code || '');
  const vulnerabilities = [];
  
  for (const vuln of CODE_SECURITY_RULES.common_vulnerabilities) {
    const matchedPatterns = [];
    for (const pattern of vuln.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(codeContent)) {
          matchedPatterns.push(pattern);
        }
      } catch (e) {
        // 忽略无效的正则表达式
      }
    }
    if (matchedPatterns.length > 0) {
      vulnerabilities.push({
        name: vuln.name,
        severity: vuln.severity,
        description: vuln.description,
        matchedPatterns,
        recommendation: vuln.recommendation,
      });
    }
  }
  
  // 按严重程度排序
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  vulnerabilities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  return {
    isSecure: vulnerabilities.length === 0,
    vulnerabilities,
    highestSeverity: vulnerabilities.length > 0 ? vulnerabilities[0].severity : 'safe',
    criticalCount: vulnerabilities.filter(v => v.severity === 'critical').length,
    highCount: vulnerabilities.filter(v => v.severity === 'high').length,
    mediumCount: vulnerabilities.filter(v => v.severity === 'medium').length,
    summary: vulnerabilities.length > 0 
      ? `检测到 ${vulnerabilities.length} 个安全漏洞：${vulnerabilities.filter(v => v.severity === 'critical').length} 个严重、${vulnerabilities.filter(v => v.severity === 'high').length} 个高危、${vulnerabilities.filter(v => v.severity === 'medium').length} 个中危` 
      : '代码安全，未检测到常见漏洞',
    bestPractices: CODE_SECURITY_RULES.secure_coding_practices,
  };
}

// ========== 导出所有函数 ==========
export default {
  SECURITY_COMPLIANCE_CONSTITUTION,
  CONTENT_SAFETY_RULES,
  PRIVACY_PROTECTION_RULES,
  CODE_SECURITY_RULES,
  detectContentSafety,
  sanitizeSensitiveInfo,
  checkCodeSecurity,
};
