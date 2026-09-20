// Think v0.11-RC2 - Model Capability Registry
// 多模型能力映射、参数预设、档位调度入口

const MODEL_PRESETS = {
  'deepseek-v4-flash': {
    key: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    tier: 'flash',
    contextWindow: 128000,
    maxOutput: 8192,
    capabilities: {
      longChainReasoning: 3,
      contextRetention: 3,
      taskDecomposition: 3,
      lowTokenDensity: 5,
      multiAgentEfficiency: 4,
      extremeFaultTolerance: 3,
    },
    sliderDefaults: { code: 1, flow: 1, memory: 1, guard: 2, throttle: 2, fuse: 2, reasoning: 1, comprehension: 1, depth: 0, vision: 0 },
    temperature: 0.7,
    topP: 0.9,
  },
  'deepseek-v4-pro': {
    key: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    tier: 'pro',
    contextWindow: 128000,
    maxOutput: 8192,
    capabilities: {
      coreReasoning: 5,
      taskDispatch: 4,
      faultSelfHealing: 4,
      resourceControl: 4,
      longChainCompletion: 5,
    },
    sliderDefaults: { code: 2, flow: 2, memory: 2, guard: 3, throttle: 1, fuse: 3, reasoning: 2, comprehension: 1, depth: 0, vision: 0 },
    temperature: 0.6,
    topP: 0.92,
  },
  'deepseek-v4-ultra': {
    key: 'deepseek-v4-ultra',
    label: 'DeepSeek V4 Ultra',
    tier: 'ultra',
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: {
      coreReasoning: 5,
      longChainReasoning: 5,
      contextRetention: 5,
      taskDecomposition: 5,
      multiAgentEfficiency: 5,
      extremeFaultTolerance: 5,
    },
    sliderDefaults: { code: 4, flow: 4, memory: 4, guard: 4, throttle: 1, fuse: 4, reasoning: 4, comprehension: 3, depth: 2, vision: 1 },
    temperature: 0.5,
    topP: 0.95,
  },
};

const registry = new Map();
let activeModel = null;

export function registerModel(key) {
  if (!MODEL_PRESETS[key]) return null;
  const preset = MODEL_PRESETS[key];
  registry.set(key, { ...preset, registeredAt: Date.now() });
  return preset;
}

export function getModelPreset(key) {
  return registry.get(key) || MODEL_PRESETS[key] || null;
}

export function setActiveModel(key) {
  if (!MODEL_PRESETS[key]) return false;
  activeModel = key;
  if (!registry.has(key)) registerModel(key);
  return true;
}

export function getActiveModel() {
  return activeModel;
}

export function listModels() {
  return Object.values(MODEL_PRESETS).map((m) => ({
    key: m.key,
    label: m.label,
    tier: m.tier,
  }));
}

export function getCapabilityScore(modelKey, capability) {
  const preset = getModelPreset(modelKey);
  if (!preset || !preset.capabilities) return 0;
  return preset.capabilities[capability] || 0;
}

export function getSliderDefaults(modelKey) {
  const preset = getModelPreset(modelKey);
  return preset ? { ...preset.sliderDefaults } : null;
}

export function getInferenceParams(modelKey, overrides = {}) {
  const preset = getModelPreset(modelKey);
  if (!preset) return { temperature: 0.7, topP: 0.9 };
  return {
    temperature: overrides.temperature ?? preset.temperature,
    topP: overrides.topP ?? preset.topP,
    maxOutput: overrides.maxOutput ?? preset.maxOutput,
  };
}

for (const key of Object.keys(MODEL_PRESETS)) {
  registerModel(key);
}

export default {
  registerModel,
  getModelPreset,
  setActiveModel,
  getActiveModel,
  listModels,
  getCapabilityScore,
  getSliderDefaults,
  getInferenceParams,
};
