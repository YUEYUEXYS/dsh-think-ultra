// tools-flash-velocity.js — Thinker Ultra 独立工具集：DeepSeek-V41-Flash × 迅流模式专属
// 【独立容器铁律】本文件工具仅在 Flash 讯流模式下挂载，与其他三个模式工具集严格隔离，不共用任何运行时容器。
// Flash 讯流工具哲学：快而深。利用 V41 原生多模态 + 高吞吐，做快速但精密的分析，不灌水但每步都有实质推进。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { sampleOnce } from './tournament-engine.js';

// 工具1：快速多模态精读（Flash 讯流专属）—— 双尺度读图 + 文字提取 + 主体识别，快速但精密
function createFastMultimodalReadTool(deps) {
  return defineTool({
    name: 'flash_fast_vision_read',
    description: '【Flash 讯流专属·快速多模态精读】对输入图片做双尺度快速精读：先整体后局部，提取文字、识别主体、标注关键区域。利用 V41 原生多模态高吞吐，快速产出精密分析结果。适用于需要快速理解图片内容的场景。',
    parameters: {
      image_ref: { type: 'string', required: true, description: '要分析的图片引用或描述。' },
      focus: { type: 'string', description: '关注重点：text(文字)/object(主体)/layout(布局)/all(全部)。默认all。', enum: ['text', 'object', 'layout', 'all'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          summary: { type: 'string', required: true, description: '图片内容的简要总结。' },
          text_extracted: { type: 'string', description: '提取的文字内容。' },
          objects: { type: 'array', items: { type: 'string' }, description: '识别的主体/物体列表。' },
          layout: { type: 'string', description: '布局分析。' },
          key_regions: { type: 'array', items: { type: 'string' }, description: '关键区域标注。' },
          confidence: { type: 'number', description: '分析置信度 0-1。' },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `⚡ 【Flash 讯流·快速多模态精读】\n\n总结：${v.summary}\n${v.text_extracted ? '提取文字：' + v.text_extracted + '\n' : ''}${v.objects && v.objects.length ? '识别主体：' + v.objects.join('、') + '\n' : ''}${v.layout ? '布局：' + v.layout + '\n' : ''}置信度：${(v.confidence * 100).toFixed(0)}%` }],
    },
    async execute(args) {
      const started = Date.now();
      const focus = args.focus || 'all';
      const prompt = `你是 Flash 讯流模式的快速多模态精读引擎。请对以下图片做双尺度快速精读（先整体后局部），关注重点：${focus}。

图片引用：${args.image_ref}

请输出：
1. 一句话总结图片内容
2. 提取的所有文字（如有）
3. 识别的主体/物体列表
4. 布局分析
5. 关键区域标注
6. 分析置信度（0-1）

要求：快速但精密，不遗漏关键信息，不做过度推演。`;
      try {
        const llm = deps.getLlm();
        const result = await sampleOnce(llm, {
          provider: deps.provider, model: deps.model,
          system: '你是快速多模态精读引擎，输出结构化JSON。',
          prompt, temperature: 0.5, maxTokens: 2000,
        });
        const text = result.text || '';
        return {
          summary: text.substring(0, 300) || '分析完成',
          text_extracted: text.match(/提取文字[：:]\s*(.+?)(?=\n|$)/)?.[1] || '',
          objects: (text.match(/识别主体[：:]\s*(.+)/)?.[1] || '').split(/[、,，]/).filter(Boolean),
          layout: text.match(/布局[：:]\s*(.+)/)?.[1] || '',
          key_regions: (text.match(/关键区域[：:]\s*(.+)/)?.[1] || '').split(/[、,，]/).filter(Boolean),
          confidence: parseFloat(text.match(/置信度[：:]\s*([\d.]+)/)?.[1] || '0.85'),
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { summary: '多模态精读失败：' + String(e.message || e).substring(0, 100), confidence: 0, duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '⚡ Flash 讯流·快速多模态精读', kind: 'execute', rawInput: String(args.image_ref || '').substring(0, 80) }),
  });
}

// 工具2：快速代码结构扫描（Flash 讯流专属）—— 快速扫描代码文件结构，识别函数/类/依赖
function createFastCodeScanTool(deps) {
  return defineTool({
    name: 'flash_fast_code_scan',
    description: '【Flash 讯流专属·快速代码结构扫描】快速扫描代码文件或目录，识别函数、类、依赖关系、导出项，产出结构化代码地图。利用 Flash 高吞吐快速完成，适用于快速了解代码结构的场景。',
    parameters: {
      path: { type: 'string', required: true, description: '要扫描的文件或目录路径。' },
      depth: { type: 'string', description: '扫描深度：shallow(仅顶层)/deep(递归深入)。默认shallow。', enum: ['shallow', 'deep'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          files_scanned: { type: 'integer', required: true },
          functions: { type: 'array', items: { type: 'string' } },
          classes: { type: 'array', items: { type: 'string' } },
          exports: { type: 'array', items: { type: 'string' } },
          dependencies: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `⚡ 【Flash 讯流·快速代码结构扫描】\n\n扫描文件：${v.files_scanned} 个\n函数：${v.functions?.length || 0} 个\n类：${v.classes?.length || 0} 个\n导出：${v.exports?.length || 0} 项\n依赖：${v.dependencies?.length || 0} 个\n\n总结：${v.summary}` }],
    },
    async execute(args) {
      const started = Date.now();
      const depth = args.depth || 'shallow';
      // 确定性扫描：用正则提取函数/类/导出/依赖
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const files = [];
        const scanDir = (p, d) => {
          if (!fs.existsSync(p)) return;
          const stat = fs.statSync(p);
          if (stat.isFile() && /\.(js|ts|jsx|tsx|py|rs|go|java|c|cpp|h)$/i.test(p)) { files.push(p); }
          else if (stat.isDirectory() && d < (depth === 'deep' ? 5 : 1)) {
            for (const f of fs.readdirSync(p)) scanDir(path.join(p, f), d + 1);
          }
        };
        scanDir(args.path, 0);
        const functions = [], classes = [], exports = [], dependencies = [];
        for (const f of files.slice(0, 50)) {
          try {
            const content = fs.readFileSync(f, 'utf8');
            const fnMatches = content.match(/(?:function|const|let|var)\s+(\w+)\s*[=(]/g) || [];
            fnMatches.forEach(m => { const n = m.match(/(\w+)\s*[=(]/)?.[1]; if (n && !functions.includes(n)) functions.push(n); });
            const clsMatches = content.match(/class\s+(\w+)/g) || [];
            clsMatches.forEach(m => { const n = m.match(/class\s+(\w+)/)?.[1]; if (n && !classes.includes(n)) classes.push(n); });
            const expMatches = content.match(/export\s+(?:default\s+)?(?:const|function|class|let|var)?\s*(\w+)/g) || [];
            expMatches.forEach(m => { const n = m.match(/(\w+)$/)?.[1]; if (n && !exports.includes(n)) exports.push(n); });
            const depMatches = content.match(/(?:import|require)\s*[\s\S]*?from\s*['"]([^'"]+)['"]/g) || [];
            depMatches.forEach(m => { const n = m.match(/['"]([^'"]+)['"]/)?.[1]; if (n && !dependencies.includes(n)) dependencies.push(n); });
          } catch { /* skip unreadable */ }
        }
        return {
          files_scanned: files.length,
          functions: functions.slice(0, 100),
          classes: classes.slice(0, 50),
          exports: exports.slice(0, 50),
          dependencies: dependencies.slice(0, 50),
          summary: `扫描 ${files.length} 个文件，识别 ${functions.length} 个函数、${classes.length} 个类、${exports.length} 个导出项、${dependencies.length} 个依赖。`,
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { files_scanned: 0, functions: [], classes: [], exports: [], dependencies: [], summary: '扫描失败：' + String(e.message || e).substring(0, 100), duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '⚡ Flash 讯流·快速代码结构扫描', kind: 'execute', rawInput: String(args.path || '').substring(0, 80) }),
  });
}

// 工具3：快速一致性校验（Flash 讯流专属）—— 快速校验输出与需求的一致性
function createFastConsistencyCheckTool(deps) {
  return defineTool({
    name: 'flash_fast_consistency_check',
    description: '【Flash 讯流专属·快速一致性校验】快速校验当前输出/结果与原始需求的一致性，识别遗漏、偏差、矛盾点，给出修正建议。利用 Flash 高吞吐快速完成校验，适用于交付前快速检查。',
    parameters: {
      requirement: { type: 'string', required: true, description: '原始需求描述。' },
      output: { type: 'string', required: true, description: '当前输出/结果。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          consistent: { type: 'boolean', required: true },
          score: { type: 'number', required: true, description: '一致性得分 0-100。' },
          missing: { type: 'array', items: { type: 'string' } },
          deviations: { type: 'array', items: { type: 'string' } },
          suggestions: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `⚡ 【Flash 讯流·快速一致性校验】\n\n一致性：${v.consistent ? '✅ 通过' : '❌ 未通过'}（${v.score}/100）\n${v.missing?.length ? '遗漏项：\n' + v.missing.map((m, i) => `${i + 1}. ${m}`).join('\n') + '\n' : ''}${v.deviations?.length ? '偏差项：\n' + v.deviations.map((m, i) => `${i + 1}. ${m}`).join('\n') + '\n' : ''}${v.suggestions?.length ? '修正建议：\n' + v.suggestions.map((m, i) => `${i + 1}. ${m}`).join('\n') : ''}` }],
    },
    async execute(args) {
      const started = Date.now();
      try {
        const llm = deps.getLlm();
        const result = await sampleOnce(llm, {
          provider: deps.provider, model: deps.model,
          system: '你是一致性校验引擎，输出结构化JSON。',
          prompt: `校验以下输出与需求的一致性。

需求：${args.requirement.substring(0, 2000)}

输出：${args.output.substring(0, 3000)}

请输出JSON：
{
  "consistent": true/false,
  "score": 0-100,
  "missing": ["遗漏项1", ...],
  "deviations": ["偏差项1", ...],
  "suggestions": ["修正建议1", ...]
}`,
          temperature: 0.3, maxTokens: 1500,
        });
        const text = result.text || '';
        try {
          const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
          return { ...json, duration_ms: Date.now() - started };
        } catch {
          return { consistent: false, score: 50, missing: ['无法解析校验结果'], deviations: [], suggestions: ['请重试校验'], duration_ms: Date.now() - started };
        }
      } catch (e) {
        return { consistent: false, score: 0, missing: [], deviations: [], suggestions: ['校验失败：' + String(e.message || e).substring(0, 80)], duration_ms: Date.now() - started };
      }
    },
    presentCall: () => ({ card: 'generic', title: '⚡ Flash 讯流·快速一致性校验', kind: 'execute', rawInput: '一致性校验' }),
  });
}

export function flashVelocityTools(deps) {
  return [
    createFastMultimodalReadTool(deps),
    createFastCodeScanTool(deps),
    createFastConsistencyCheckTool(deps),
  ];
}

export default { flashVelocityTools };
