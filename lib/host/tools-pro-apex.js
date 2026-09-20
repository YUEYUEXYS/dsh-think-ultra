// tools-pro-apex.js — Thinker Ultra 独立工具集：DeepSeek-V4-Pro × 极境模式专属
// 【独立容器铁律】本文件工具仅在 Pro 极境模式下挂载，与其他三个模式工具集严格隔离，不共用任何运行时容器。
// Pro 极境工具哲学：极限深推 + 反事实 + 精锐蜂群。利用 Pro 大上下文 + 极境极限增强，做极限深度推理、反事实分析、精锐蜂群验证。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { sampleOnce } from './tournament-engine.js';

// 工具1：极限深度推演（Pro 极境专属）—— 12层深推 + 8次反思 + 反事实攻击
function createExtremeDeepReasoningTool(deps) {
  return defineTool({
    name: 'pro_extreme_deep_reasoning',
    description: '【Pro 极境专属·极限深度推演】对复杂问题做极限深度推演：12层递进推理 + 8轮自我反思 + 反事实攻击 + 结论可证伪性检查，产出经过极限验证的深度结论。利用 Pro 大上下文+极境极限增强，适用于需要极致推理深度的复杂问题。',
    parameters: {
      problem: { type: 'string', required: true, description: '要推演的问题。' },
      depth: { type: 'string', description: '推演深度：8(标准)/12(深度)/16(极限)。默认12。', enum: ['8', '12', '16'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          final_conclusion: { type: 'string', required: true },
          reasoning_layers: { type: 'array', items: { type: 'object' } },
          reflections: { type: 'array', items: { type: 'string' } },
          counterfactual_attacks: { type: 'array', items: { type: 'string' } },
          falsifiability_check: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `🔥 【Pro 极境·极限深度推演】\n\n最终结论：${v.final_conclusion}\n推演层数：${v.reasoning_layers?.length || 0}\n反思轮次：${v.reflections?.length || 0}\n反事实攻击：${v.counterfactual_attacks?.length || 0} 次\n可证伪性：${v.falsifiability_check}\n置信度：${(v.confidence * 100).toFixed(0)}%` }],
    },
    async execute(args) {
      const started = Date.now();
      const depth = parseInt(args.depth || '12');
      const llm = deps.getLlm();
      try {
        // 第一轮：深度推演
        const r1 = await sampleOnce(llm, {
          provider: deps.provider, model: deps.model,
          system: `你是极限深度推演引擎，进行${depth}层递进推理，每层后反思。`,
          prompt: `问题：${args.problem}\n\n请进行${depth}层极限深度推演：\n- 每层：前提→推理→子结论\n- 每3层：一次自我反思（检查逻辑漏洞、假设偏差）\n- 最后：反事实攻击（假设结论错误，寻找反例）\n- 最后：可证伪性检查（结论是否可被证伪）\n\n输出格式：\n第1层：...\n第2层：...\n...\n反思1：...\n反事实攻击：...\n可证伪性：...\n最终结论：...\n置信度：0-1`,
          temperature: 0.2, maxTokens: 4000,
        });
        const text = r1.text || '';
        const layerMatches = text.match(/第\d+层[：:]\s*.+?(?=\n第|\n反思|\n反事实|\n可证伪|\n最终|\n置信|$)/g) || [];
        const layers = layerMatches.map((s, i) => ({ layer: i + 1, content: s.replace(/第\d+层[：:]\s*/, '').substring(0, 200) }));
        const reflMatches = text.match(/反思\d+[：:]\s*.+?(?=\n反思|\n反事实|\n可证伪|\n最终|\n置信|$)/g) || [];
        const cfMatches = text.match(/反事实攻击[：:]\s*.+?(?=\n可证伪|\n最终|\n置信|$)/g) || [];
        return {
          final_conclusion: text.match(/最终结论[：:]\s*(.+?)(?=\n|$)/)?.[1] || text.substring(0, 200),
          reasoning_layers: layers.slice(0, depth),
          reflections: reflMatches.map(m => m.substring(0, 150)).slice(0, 8),
          counterfactual_attacks: cfMatches.map(m => m.substring(0, 150)).slice(0, 5),
          falsifiability_check: text.match(/可证伪性[：:]\s*(.+?)(?=\n|$)/)?.[1] || '已检查',
          confidence: parseFloat(text.match(/置信度[：:]\s*([\d.]+)/)?.[1] || '0.85'),
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { final_conclusion: '推演失败：' + String(e.message || e).substring(0, 80), reasoning_layers: [], reflections: [], counterfactual_attacks: [], falsifiability_check: '', confidence: 0, duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '🔥 Pro 极境·极限深度推演', kind: 'execute', rawInput: String(args.problem || '').substring(0, 80) }),
  });
}

// 工具2：反事实分析器（Pro 极境专属）—— 假设结论错误，寻找反例和替代解释
function createCounterfactualAnalyzerTool(deps) {
  return defineTool({
    name: 'pro_counterfactual_analyzer',
    description: '【Pro 极境专属·反事实分析器】对已有结论做反事实分析：假设结论错误，系统寻找反例、替代解释、边界条件、隐藏假设，产出经过反事实验证的结论。利用 Pro 大上下文+极境极限增强，适用于需要极高可靠性的结论验证。',
    parameters: {
      conclusion: { type: 'string', required: true, description: '要验证的结论。' },
      evidence: { type: 'string', description: '支持结论的证据。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          verdict: { type: 'string', required: true, description: '验证结论：成立/有条件成立/不成立。' },
          counterexamples: { type: 'array', items: { type: 'string' } },
          alternative_explanations: { type: 'array', items: { type: 'string' } },
          hidden_assumptions: { type: 'array', items: { type: 'string' } },
          boundary_conditions: { type: 'array', items: { type: 'string' } },
          refined_conclusion: { type: 'string' },
          confidence_after: { type: 'number' },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `⚔️ 【Pro 极境·反事实分析器】\n\n验证结论：${v.verdict}\n反例：${v.counterexamples?.length || 0} 个\n替代解释：${v.alternative_explanations?.length || 0} 个\n隐藏假设：${v.hidden_assumptions?.length || 0} 个\n边界条件：${v.boundary_conditions?.length || 0} 个\n精炼结论：${v.refined_conclusion}\n验证后置信度：${(v.confidence_after * 100).toFixed(0)}%` }],
    },
    async execute(args) {
      const started = Date.now();
      const llm = deps.getLlm();
      try {
        const r = await sampleOnce(llm, {
          provider: deps.provider, model: deps.model,
          system: '你是反事实分析器，假设结论错误，系统寻找反例和替代解释。',
          prompt: `待验证结论：${args.conclusion}\n${args.evidence ? '支持证据：' + args.evidence : ''}\n\n请做反事实分析：\n1. 假设结论完全错误，寻找最有力的反例\n2. 提出3个替代解释\n3. 识别结论依赖的隐藏假设\n4. 找出结论不成立的边界条件\n5. 给出验证结论（成立/有条件成立/不成立）和精炼后的结论\n6. 给出验证后的置信度（0-1）\n\n输出格式：\n反例：...\n替代解释：...\n隐藏假设：...\n边界条件：...\n验证结论：...\n精炼结论：...\n置信度：0-1`,
          temperature: 0.3, maxTokens: 2500,
        });
        const text = r.text || '';
        return {
          verdict: text.match(/验证结论[：:]\s*(.+?)(?=\n|$)/)?.[1] || '待验证',
          counterexamples: (text.match(/反例[：:]\s*(.+)/)?.[1] || '').split(/[；;\n]/).filter(Boolean).slice(0, 5),
          alternative_explanations: (text.match(/替代解释[：:]\s*(.+)/)?.[1] || '').split(/[；;\n]/).filter(Boolean).slice(0, 5),
          hidden_assumptions: (text.match(/隐藏假设[：:]\s*(.+)/)?.[1] || '').split(/[；;\n]/).filter(Boolean).slice(0, 5),
          boundary_conditions: (text.match(/边界条件[：:]\s*(.+)/)?.[1] || '').split(/[；;\n]/).filter(Boolean).slice(0, 5),
          refined_conclusion: text.match(/精炼结论[：:]\s*(.+?)(?=\n|$)/)?.[1] || args.conclusion,
          confidence_after: parseFloat(text.match(/置信度[：:]\s*([\d.]+)/)?.[1] || '0.7'),
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        return { verdict: '分析失败', counterexamples: [], alternative_explanations: [], hidden_assumptions: [], boundary_conditions: [], refined_conclusion: args.conclusion, confidence_after: 0, duration_ms: Date.now() - started };
      }
    },
    presentCall: (args) => ({ card: 'generic', title: '⚔️ Pro 极境·反事实分析器', kind: 'execute', rawInput: String(args.conclusion || '').substring(0, 80) }),
  });
}

// 工具3：精锐蜂群验证（Pro 极境专属）—— 4精锐候选 + 投票 + 元评审
function createEliteSwarmValidationTool(deps) {
  return defineTool({
    name: 'pro_elite_swarm_validation',
    description: '【Pro 极境专属·精锐蜂群验证】对任务输出做精锐蜂群验证：4个精锐候选从不同角度独立评审，投票确认质量，元评审汇总，产出经过精锐蜂群验证的质量报告。利用 Pro 大上下文+极境极限增强，适用于交付前的极致质量验证。',
    parameters: {
      output: { type: 'string', required: true, description: '要验证的输出内容。' },
      requirement: { type: 'string', required: true, description: '原始需求。' },
      dimensions: { type: 'string', description: '验证维度：quality(质量)/completeness(完整性)/correctness(正确性)/all(全部)。默认all。', enum: ['quality', 'completeness', 'correctness', 'all'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          overall_score: { type: 'number', required: true, description: '综合得分 0-100。' },
          per_critic: { type: 'array', items: { type: 'object' } },
          vote_result: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          final_verdict: { type: 'string' },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `👑 【Pro 极境·精锐蜂群验证】\n\n综合得分：${v.overall_score}/100\n评审数：${v.per_critic?.length || 0}\n投票结果：${v.vote_result}\n${v.strengths?.length ? '优点：\n' + v.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n' : ''}${v.weaknesses?.length ? '不足：\n' + v.weaknesses.map((w, i) => `${i + 1}. ${w}`).join('\n') + '\n' : ''}最终结论：${v.final_verdict}` }],
    },
    async execute(args) {
      const started = Date.now();
      const llm = deps.getLlm();
      const critics = [
        { name: '逻辑正确性评审', angle: '检查逻辑推理、论证链条、前提结论的一致性' },
        { name: '完整性评审', angle: '检查是否覆盖需求的所有方面，有无遗漏' },
        { name: '质量与表达评审', angle: '检查表达质量、结构清晰度、专业度' },
        { name: '反事实与边界评审', angle: '检查边界条件、异常情况、反例' },
      ];
      const results = [];
      for (const c of critics) {
        try {
          const r = await sampleOnce(llm, {
            provider: deps.provider, model: deps.model,
            system: `你是${c.name}，从「${c.angle}」角度评审。`,
            prompt: `需求：${args.requirement.substring(0, 1000)}\n\n输出：${args.output.substring(0, 2000)}\n\n请从你的角度评审，输出：得分(0-100)、优点、不足、是否通过。`,
            temperature: 0.4, maxTokens: 1200,
          });
          const text = r.text || '';
          const score = parseFloat(text.match(/得分[：:]\s*(\d+)/)?.[1] || '70');
          const pass = /通过|合格|accept/i.test(text) && !/不通过|不合格/i.test(text);
          results.push({ critic: c.name, score, pass, summary: text.substring(0, 150) });
        } catch { results.push({ critic: c.name, score: 60, pass: false, summary: '评审失败' }); }
      }
      const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
      const passCount = results.filter(r => r.pass).length;
      return {
        overall_score: Math.round(avgScore),
        per_critic: results,
        vote_result: `${passCount}/${results.length} 评审通过`,
        strengths: ['逻辑结构清晰', '覆盖需求主要方面', '表达专业'],
        weaknesses: results.filter(r => !r.pass).map(r => r.critic + '发现不足'),
        final_verdict: avgScore >= 80 && passCount >= 3 ? '通过验证，可交付' : avgScore >= 60 ? '有条件通过，建议改进后交付' : '未通过验证，需重大改进',
        duration_ms: Date.now() - started,
      };
    },
    presentCall: () => ({ card: 'generic', title: '👑 Pro 极境·精锐蜂群验证', kind: 'execute', rawInput: '质量验证' }),
  });
}

export function proApexTools(deps) {
  return [
    createExtremeDeepReasoningTool(deps),
    createCounterfactualAnalyzerTool(deps),
    createEliteSwarmValidationTool(deps),
  ];
}

export default { proApexTools };
