import '../load-env.js';

/** @typedef {'gemini' | 'openai'} ModelFamily */

export const MODEL_FAMILIES = /** @type {const} */ (['gemini', 'openai']);

const OPENROUTER_FAMILY_DEFAULTS = {
  gemini: {
    image: 'google/gemini-2.5-flash-image-preview',
    vision: 'google/gemini-2.5-pro',
  },
  openai: {
    image: 'openai/gpt-image-2',
    vision: 'openai/gpt-4o',
  },
};

export const readEnvModel = (key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const parseCommaList = (raw) =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const parseUiModelFamilies = () => {
  const raw = readEnvModel('OPENROUTER_UI_FAMILIES') || 'gemini,openai';
  return parseCommaList(raw)
    .map((f) => f.toLowerCase())
    .filter((f) => MODEL_FAMILIES.includes(/** @type {ModelFamily} */ (f)));
};

export const getDefaultModelFamily = () => {
  const families = parseUiModelFamilies();
  const requested = readEnvModel('OPENROUTER_DEFAULT_FAMILY')?.toLowerCase();
  if (requested && families.includes(/** @type {ModelFamily} */ (requested))) {
    return /** @type {ModelFamily} */ (requested);
  }
  return /** @type {ModelFamily} */ (families[0] || 'gemini');
};

/** @param {string | undefined | null} requested */
export const resolveModelFamily = (requested) => {
  const families = parseUiModelFamilies();
  const normalized = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (normalized && families.includes(/** @type {ModelFamily} */ (normalized))) {
    return /** @type {ModelFamily} */ (normalized);
  }
  return getDefaultModelFamily();
};

const familyEnvKey = (family, task) =>
  family === 'openai'
    ? `OPENROUTER_OPENAI_${task}_MODEL`
    : `OPENROUTER_GEMINI_${task}_MODEL`;

const familyEnvListKey = (family, task) =>
  family === 'openai'
    ? `OPENROUTER_OPENAI_${task}_MODELS`
    : `OPENROUTER_GEMINI_${task}_MODELS`;

/** @param {ModelFamily} family */
export const getOpenRouterImageModel = (family = 'gemini') => {
  const fromFamily = readEnvModel(familyEnvKey(family, 'IMAGE'));
  if (fromFamily) return fromFamily;

  if (family === 'gemini') {
    const legacy = readEnvModel('IMAGE_MODEL');
    if (legacy) return legacy;
  }

  return OPENROUTER_FAMILY_DEFAULTS[family].image;
};

/** @param {ModelFamily} family */
export const getOpenRouterVisionModel = (family = 'gemini') => {
  const fromFamily = readEnvModel(familyEnvKey(family, 'VISION'));
  if (fromFamily) return fromFamily;

  if (family === 'gemini') {
    const legacy = readEnvModel('GEMINI_VISION_MODEL');
    if (legacy) return legacy;
  }

  return OPENROUTER_FAMILY_DEFAULTS[family].vision;
};

/** @param {ModelFamily} family */
export const getOpenRouterImageModels = (family = 'gemini', explicitModel) => {
  if (explicitModel?.trim()) return [explicitModel.trim()];

  const list = readEnvModel(familyEnvListKey(family, 'IMAGE'));
  if (list) return parseCommaList(list);

  const models = [getOpenRouterImageModel(family)];

  // Optional fallback if OpenAI Image API fails (set OPENROUTER_OPENAI_IMAGE_FALLBACK_TO_GEMINI=false to disable)
  const allowGeminiFallback =
    family === 'openai' && readEnvModel('OPENROUTER_OPENAI_IMAGE_FALLBACK_TO_GEMINI') !== 'false';
  if (allowGeminiFallback) {
    const geminiPrimary = getOpenRouterImageModel('gemini');
    if (!models.includes(geminiPrimary)) models.push(geminiPrimary);

    const geminiList = readEnvModel(familyEnvListKey('gemini', 'IMAGE'));
    if (geminiList) {
      for (const slug of parseCommaList(geminiList)) {
        if (!models.includes(slug)) models.push(slug);
      }
    }
  }

  return models;
};

/** @param {ModelFamily} family */
export const getOpenRouterVisionModels = (family = 'gemini', explicitModel) => {
  if (explicitModel?.trim()) return [explicitModel.trim()];

  const list = readEnvModel(familyEnvListKey(family, 'VISION'));
  if (list) return parseCommaList(list);

  const primary = getOpenRouterVisionModel(family);
  return [primary];
};

/**
 * OpenAI GPT Image models use OpenRouter's dedicated Image API (POST /api/v1/images),
 * not chat/completions modalities. Supports input_references for scan editing.
 */
export const usesOpenRouterDedicatedImageApi = (modelSlug) => {
  const slug = (modelSlug || '').toLowerCase();
  if (!slug.startsWith('openai/')) return false;
  return /gpt-image|gpt-5(\.\d+)?-image|gpt-5-image/.test(slug);
};

/** OpenRouter slugs that return image output via chat/completions (Gemini image, Imagen, etc.) */
export const isOpenRouterImageModel = (modelSlug) => {
  if (usesOpenRouterDedicatedImageApi(modelSlug)) return false;
  const slug = (modelSlug || '').toLowerCase();
  return /image|imagen|dall-e|stable-diffusion|flux|midjourney/.test(slug);
};

/** Modalities OpenRouter accepts per model — dall-e/imagen via chat API only */
export const getOpenRouterImageModalities = (modelSlug) => {
  if (usesOpenRouterDedicatedImageApi(modelSlug)) return null;
  const slug = (modelSlug || '').toLowerCase();
  if (/dall-e|imagen/.test(slug)) return ['image'];
  if (isOpenRouterImageModel(modelSlug)) return ['image', 'text'];
  return null;
};

/** OCR / text tasks — lower cap so small OpenRouter balances can afford the request */
export const getOpenRouterVisionMaxTokens = () => {
  const raw = readEnvModel('OPENROUTER_VISION_MAX_TOKENS');
  const parsed = raw ? Number.parseInt(raw, 10) : 2048;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2048;
};

/** Env intent — not affected by missing-key fallback in resolveAiProvider() */
export const getConfiguredAiProvider = () => {
  const configured = readEnvModel('AI_PROVIDER')?.toLowerCase();
  if (configured === 'openrouter' || configured === 'gemini') return configured;
  return null;
};

export const getPublicAiConfig = (resolvedProvider) => {
  const families = parseUiModelFamilies();
  const defaultFamily = getDefaultModelFamily();
  const configuredProvider = getConfiguredAiProvider();
  const uiProvider = configuredProvider || resolvedProvider;

  return {
    provider: resolvedProvider,
    configuredProvider: uiProvider,
    showModelFamilySelector: uiProvider === 'openrouter' && families.length > 1,
    modelFamilies: families.map((id) => ({
      id,
      label: id === 'gemini' ? 'Gemini' : 'OpenAI',
    })),
    defaultModelFamily: defaultFamily,
  };
};

export const logOpenRouterModelConfig = () => {
  for (const family of MODEL_FAMILIES) {
    console.log(`  OpenRouter ${family} image:  ${getOpenRouterImageModel(family)}`);
    console.log(`  OpenRouter ${family} vision: ${getOpenRouterVisionModel(family)}`);
  }
  console.log(`  UI families:               ${parseUiModelFamilies().join(', ')}`);
  console.log(`  Default UI family:         ${getDefaultModelFamily()}`);
};
