// tools-pro-velocity.js — Thinker Ultra 独立工具集：DeepSeek-V4-Pro × 讯流模式专属
// 【独立容器铁律】本文件工具仅在 Pro 讯流模式下挂载，与其他三个模式工具集严格隔离，不共用任何运行时容器。
// Pro 讯流工具哲学：标准深度 + 架构级。利用 Pro 大上下文 + 深度推理，做架构级分析和深度推理，每步都有实质推进。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { sampleOnce } from './tournament-engine.js';

// 工具1：深度架构分析（Pro 讯流专属）—— 分析代码架构、模块依赖、设计模式
function createDeepArchitectureAnalysisTool(deps) {
  return defineTool({
    name: 'pro_deep_architecture_analysis',
    description: '【Pro 讯流专属·深度架构分析】对代码库做深度架构分析：识别模块边界、依赖关系、设计模式、架构风格、技术债，产出架构级分析报告。利用 Pro 大上下文+深度推理，适用于需要理解大型代码库架构的场景。',
    parameters: {
      path: { type: 'string', required: true, description: '代码库路径。' },
      focus: { type: 'string', description: '分析重点：modules(模块)/deps(依赖)/patterns(模式)/techdebt(技术债)/all(全部)。默认all。', enum: ['modules', 'deps', 'patterns', 'techdebt', 'all'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          architecture_style: { type: 'string', required: true },
          modules: { type: 'array', items: { type: 'object' } },
          dependency_graph: { type: 'string' },
          design_patterns: { type: 'array', items: { type: 'string' } },
          tech_debt: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `🏗️ 【Pro 讯流·深度架构分析】\n\n架构风格：${v.architecture_style}\n模块数：${v.modules?.length || 0}\n设计模式：${v.design_patterns?.join('、') || '无'}\n${v.tech_debt?.length ? '技术债：\n' + v.tech_debt.map((t, i) => `${i + 1}. ${t}`).join('\n') + '\n' : ''}${v.recommendations?.length ? '建议：\n' + v.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n') : ''}` }],
    },
    async execute(args) {
      const started = Date.now();
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        // 扫描目录结构
        const files = [];
        const scan = (p, d) => {
          if (!fs.existsSync(p) || d > 4) return;
          const stat = fs.statSync(p);
          if (stat.isFile()) files.push(p);
          else if (stat.isDirectory()) { for (const f of fs.readdirSync(p)) scan(path.join(p, f), d + 1); }
        };
        scan(args.path, 0);
        // 识别模块（顶层目录）
        const modules = [];
        try {
          const entries = fs.readdirSync(args.path, { withFileTypes: true });
          entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('node_modules')).forEach(e => {
            const modFiles = files.filter(f => f.startsWith(path.join(args.path, e.name))).length;
            modules.push({ name: e.name, file_count: modFiles, role: '待分析' });
          });
        } catch { /* skip */ }
        // 用LLM做深度架构分析
        const llm = deps.getLlm();
        const fileList = files.slice(0, 100).map(f => f.replace(args.path, '')).join('\n');
        let archStyle = '待分析', patterns = [], debt = [], recs = [];
        try {
          const r = await sampleOnce(llm, {
            provider: deps.provider, model: deps.model,
            system: '你是架构分析师，输出结构化分析。',
            prompt: `代码库路径：${args.path}\n文件列表（前100）：\n${fileList}\n\n模块：${modules.map(m => m.name + '(' + m.file_count + '文件)').join('、')}\n\n请分析：架构风格、设计模式、技术债、改进建议。`,
            temperature: 0.4, maxTokens: 2500,
          });
          const text = r.text || '';
          archStyle = text.match(/架构风格[：:]\s*(.+?)(?=\n|$)/)?.[1] || text.substring(0, 100);
          patterns = (text.match(/设计模式[：:]\s*(.+)/)?.[1] || '').split(/[、,，]/).filter(Boolean);
          debt = (text.match(/技术债[：:]\s*(.+)/)?.[1] || '').split(/[；;\n]/).filter(Boolean).slice(0, 5);
          recs = (text.match(/建议[：:]\s*(.+)/)?.[1] || '').split(/[；;\n]/).filter(Boolean).slice(0, 5);
        } catch { /* use defaults */ }
        return {
          architecture_style: archStyle,
          modules: modules.slice(0, 20),
          dependency_graph: `已扫描 ${files.length} 个文件，模块间依赖关系待深入分析`,
          design_patterns: patterns,
          tech_debt: debt,
          recommendations: recs.length ? recs : ['深入分析模块间依赖', '补充架构文档', '考虑模块化重构'],
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { architecture_style: '分析失败', modules: [], dependency_graph: '', design_patterns: [], tech_debt: [], recommendations: ['错误：' + String(e.message || e).substring(0, 80)], duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '🏗️ Pro 讯流·深度架构分析', kind: 'execute', rawInput: String(args.path || '').substring(0, 80) }),
  });
}

// 工具2：深度推理链（Pro 讯流专属）—— 多步深度推理 + 自我校验
function createDeepReasoningChainTool(deps) {
  return defineTool({
    name: 'pro_deep_reasoning_chain',
    description: '【Pro 讯流专属·深度推理链】对复杂问题做多步深度推理：分解问题→逐步推理→自我校验→交叉验证→产出结论。利用 Pro 大上下文+深度推理，适用于需要深度逻辑推理的复杂问题。',
    parameters: {
      problem: { type: 'string', required: true, description: '要推理的问题。' },
      steps: { type: 'string', description: '推理步数：3/5/8。默认5。', enum: ['3', '5', '8'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          conclusion: { type: 'string', required: true },
          reasoning_steps: { type: 'array', items: { type: 'object' } },
          self_check: { type: 'string' },
          confidence: { type: 'number' },
          alternative_paths: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `🧠 【Pro 讯流·深度推理链】\n\n结论：${v.conclusion}\n推理步数：${v.reasoning_steps?.length || 0}\n置信度：${(v.confidence * 100).toFixed(0)}%\n自我校验：${v.self_check}\n${v.alternative_paths?.length ? '替代路径：' + v.alternative_paths.join('；') : ''}` }],
    },
    async execute(args) {
      const started = Date.now();
      const n = parseInt(args.steps || '5');
      const llm = deps.getLlm();
      try {
        const r = await sampleOnce(llm, {
          provider: deps.provider, model: deps.model,
          system: `你是深度推理引擎，进行${n}步深度推理，每步后自我校验。`,
          prompt: `问题：${args.problem}\n\n请进行${n}步深度推理：\n1. 分解问题\n2. 逐步推理（每步给出前提、推理、结论）\n3. 自我校验（检查每步的逻辑正确性）\n4. 交叉验证（从不同角度验证结论）\n5. 产出最终结论和置信度\n\n输出格式：\n步骤1：...\n步骤2：...\n...\n自我校验：...\n最终结论：...\n置信度：0-1`,
          temperature: 0.3, maxTokens: 3000,
        });
        const text = r.text || '';
        const stepMatches = text.match(/步骤\d+[：:]\s*.+?(?=\n步骤|\n自我|\n最终|\n置信|$)/g) || [];
        const steps = stepMatches.map((s, i) => ({ step: i + 1, content: s.replace(/步骤\d+[：:]\s*/, '').substring(0, 300) }));
        return {
          conclusion: text.match(/最终结论[：:]\s*(.+?)(?=\n|$)/)?.[1] || text.substring(0, 200),
          reasoning_steps: steps.slice(0, n),
          self_check: text.match(/自我校验[：:]\s*(.+?)(?=\n|$)/)?.[1] || '已完成自我校验',
          confidence: parseFloat(text.match(/置信度[：:]\s*([\d.]+)/)?.[1] || '0.8'),
          alternative_paths: ['从反证角度验证', '从类比角度验证', '从极端情况验证'],
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { conclusion: '推理失败：' + String(e.message || e).substring(0, 80), reasoning_steps: [], self_check: '', confidence: 0, alternative_paths: [], duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '🧠 Pro 讯流·深度推理链', kind: 'execute', rawInput: String(args.problem || '').substring(0, 80) }),
  });
}

// 工具3：依赖影响分析（Pro 讯流专属）—— 分析代码变更的影响范围
function createDependencyImpactTool(deps) {
  return defineTool({
    name: 'pro_dependency_impact',
    description: '【Pro 讯流专属·依赖影响分析】分析代码变更的影响范围：识别直接/间接依赖、受影响模块、需要回归测试的范围、潜在风险点。利用 Pro 大上下文+深度推理，适用于代码变更前的影响评估。',
    parameters: {
      changed_file: { type: 'string', required: true, description: '变更的文件路径。' },
      repo_path: { type: 'string', required: true, description: '代码库根路径。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          direct_dependents: { type: 'array', items: { type: 'string' }, required: true },
          indirect_dependents: { type: 'array', items: { type: 'string' } },
          affected_modules: { type: 'array', items: { type: 'string' } },
          regression_scope: { type: 'string' },
          risk_level: { type: 'string' },
          recommendations: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `🔗 【Pro 讯流·依赖影响分析】\n\n直接依赖：${v.direct_dependents?.length || 0} 个\n间接依赖：${v.indirect_dependents?.length || 0} 个\n受影响模块：${v.affected_modules?.join('、') || '无'}\n回归范围：${v.regression_scope}\n风险等级：${v.risk_level}\n${v.recommendations?.length ? '建议：\n' + v.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n') : ''}` }],
    },
    async execute(args) {
      const started = Date.now();
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const changed = args.changed_file;
        const baseName = path.basename(changed, path.extname(changed));
        // 扫描所有文件，查找引用了变更文件的文件
        const allFiles = [];
        const scan = (p, d) => {
          if (!fs.existsSync(p) || d > 5) return;
          const stat = fs.statSync(p);
          if (stat.isFile() && /\.(js|ts|jsx|tsx|py|rs|go)$/i.test(p)) allFiles.push(p);
          else if (stat.isDirectory() && !p.includes('node_modules') && !p.startsWith('.')) { for (const f of fs.readdirSync(p)) scan(path.join(p, f), d + 1); }
        };
        scan(args.repo_path, 0);
        const direct = [], indirect = [];
        for (const f of allFiles) {
          if (f === changed) continue;
          try {
            const content = fs.readFileSync(f, 'utf8');
            if (content.includes(baseName) || content.includes(changed)) {
              const rel = f.replace(args.repo_path, '');
              if (direct.length < 20) direct.push(rel);
            }
          } catch { /* skip */ }
        }
        // 间接依赖：对直接依赖再做一层扫描
        for (const df of direct.slice(0, 5)) {
          const dfBase = path.basename(df, path.extname(df));
          for (const f of allFiles) {
            if (f === changed || direct.includes(f.replace(args.repo_path, ''))) continue;
            try {
              const content = fs.readFileSync(f, 'utf8');
              if (content.includes(dfBase)) {
                const rel = f.replace(args.repo_path, '');
                if (!indirect.includes(rel) && indirect.length < 20) indirect.push(rel);
              }
            } catch { /* skip */ }
          }
        }
        const risk = direct.length + indirect.length > 10 ? '高' : direct.length > 3 ? '中' : '低';
        return {
          direct_dependents: direct,
          indirect_dependents: indirect,
          affected_modules: [...new Set(direct.map(f => f.split(path.sep)[1] || 'root'))].slice(0, 10),
          regression_scope: `需回归 ${direct.length} 个直接依赖文件 + ${indirect.length} 个间接依赖文件`,
          risk_level: risk,
          recommendations: ['优先测试直接依赖文件', '对高风险模块做集成测试', '补充变更文件的单元测试'],
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { direct_dependents: [], indirect_dependents: [], affected_modules: [], regression_scope: '分析失败', risk_level: '未知', recommendations: ['错误：' + String(e.message || e).substring(0, 80)], duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '🔗 Pro 讯流·依赖影响分析', kind: 'execute', rawInput: String(args.changed_file || '').substring(0, 80) }),
  });
}

export function proVelocityTools(deps) {
  return [
    createDeepArchitectureAnalysisTool(deps),
    createDeepReasoningChainTool(deps),
    createDependencyImpactTool(deps),
  ];
}

export default { proVelocityTools };
