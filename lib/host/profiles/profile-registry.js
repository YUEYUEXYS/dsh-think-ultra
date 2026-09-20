// profile/profile-registry.js — Thinker Ultra 四模式独立增强档案注册表
// 【独立容器铁律】四个 profile 各自独立文件、独立运行时容器，互不共享状态。
// 本注册表只负责按 modelGroup + mode 路由到对应 profile，并提供档位查询工具函数。

import flashVelocity from './flash-velocity.js';
import flashApex from './flash-apex.js';
import proVelocity from './pro-velocity.js';
import proApex from './pro-apex.js';

const REGISTRY = {
  'flash-velocity': flashVelocity,
  'flash-apex': flashApex,
  'pro-velocity': proVelocity,
  'pro-apex': proApex,
};

export const ALL_PROFILE_IDS = Object.keys(REGISTRY);

// 按 modelGroup + mode 获取独立 profile（不共用容器，每次返回独立引用）
export function getProfile(modelGroup, mode) {
  const g = modelGroup === 'pro' ? 'pro' : 'flash';
  const m = mode === 'apex' ? 'apex' : 'velocity';
  const id = `${g}-${m}`;
  return REGISTRY[id] || REGISTRY['flash-velocity'];
}

// 按能力值 0-20 获取对应档位配置（从 profile 的 CAPABILITY_TIERS 中查找）
export function getCapabilityTier(profile, capability) {
  const cap = Math.max(0, Math.min(20, Math.round(Number(capability) || 0)));
  for (const tier of profile.CAPABILITY_TIERS) {
    if (cap >= tier.range[0] && cap <= tier.range[1]) return tier;
  }
  return profile.CAPABILITY_TIERS[0];
}

// 获取当前 profile + 能力档位的完整增强上下文（用于注入系统提示词）
export function getEnhancementContext(modelGroup, mode, capability) {
  const profile = getProfile(modelGroup, mode);
  const tier = getCapabilityTier(profile, capability);
  return {
    profileId: profile.PROFILE_ID,
    profileLabel: profile.PROFILE_LABEL,
    modelGroup: profile.MODEL_GROUP,
    mode: profile.MODE,
    capability,
    tierName: tier.name,
    tierNameEn: tier.nameEn,
    thinkDepth: tier.thinkDepth,
    methodology: tier.methodology,
    toolPolicy: tier.toolPolicy,
    multimodal: tier.multimodal,
    qualityBar: tier.qualityBar,
    superThinkTrigger: tier.superThinkTrigger,
    ensemblePatch: tier.ensemblePatch || null,
    superThinkConfig: profile.SUPER_THINK,
    normalThinkConfig: profile.NORMAL_THINK,
    profileToolPolicy: profile.TOOL_POLICY,
    enhancementPrompt: profile.ENHANCEMENT_PROMPT,
  };
}

// 构建档位增强提示词片段（注入到系统提示词，让模型知道当前处于什么档位）
export function buildTierPrompt(ctx) {
  const lines = [];
  lines.push(`【Thinker Ultra · 当前档位】${ctx.profileLabel} · 能力 ${ctx.capability}/20 · ${ctx.tierName}（${ctx.tierNameEn}）`);
  lines.push(`思考深度：${ctx.thinkDepth}`);
  lines.push(`思考方法论：`);
  ctx.methodology.forEach((m, i) => lines.push(`  ${i + 1}. ${m}`));
  lines.push(`工具使用策略：${ctx.toolPolicy}`);
  lines.push(`多模态处理：${ctx.multimodal}`);
  lines.push(`质量基线：${ctx.qualityBar}`);
  if (ctx.ensemblePatch) {
    lines.push(`极境蜂群补丁：${ctx.ensemblePatch.samples}候选 · ${ctx.ensemblePatch.votes}轮投票 · ${ctx.ensemblePatch.reforge}轮回炉 · 交叉验证=${ctx.ensemblePatch.cross ? '开' : '关'}${ctx.ensemblePatch.tile ? ' · 读图网格' + ctx.ensemblePatch.tile : ''}${ctx.ensemblePatch.deep ? ' · 深推' + ctx.ensemblePatch.deep + '层' : ''}`);
  }
  return lines.join('\n');
}

// 单调自证：验证 profile 的 CAPABILITY_TIERS 是单调递增的（高档位包含低档位能力）
export function profileIsMonotone(profile) {
  const tiers = profile.CAPABILITY_TIERS;
  for (let i = 1; i < tiers.length; i++) {
    // 高档位的 methodology 数量应 >= 低档位（补丁叠加）
    if (tiers[i].methodology.length < tiers[i - 1].methodology.length) return false;
    // 高档位 range 应连续
    if (tiers[i].range[0] !== tiers[i - 1].range[1] + 1) return false;
  }
  // 极境 profile 应有 ensemblePatch
  if (profile.MODE === 'apex') {
    for (const tier of tiers) {
      if (!tier.ensemblePatch) return false;
      // 极境高档位候选数应单调递增
      if (tiers.indexOf(tier) > 0 && tier.ensemblePatch.samples < tiers[tiers.indexOf(tier) - 1].ensemblePatch.samples) return false;
    }
  }
  return true;
}

// 全量自证：四个 profile 都单调
export function allProfilesMonotone() {
  return ALL_PROFILE_IDS.every(id => profileIsMonotone(REGISTRY[id]));
}

export default { getProfile, getCapabilityTier, getEnhancementContext, buildTierPrompt, profileIsMonotone, allProfilesMonotone, ALL_PROFILE_IDS };
