import '../load-env.js';

/**
 * Every model name comes from .env (see .env.example) — there are no built-in defaults.
 *
 * One key pattern per provider:
 *   gemini (Google API directly):  GEMINI_<TASK>_MODEL
 *   openrouter:                    OPENROUTER_<FAMILY>_<TASK>_MODEL   (FAMILY = GEMINI | OPENAI)
 * TASK: VISION (OCR + text translation), IMAGE (translate image), ENHANCE_IMAGE (enhance; falls back to IMAGE).
 * Optional fallbacks: the same key ending in _MODELS (comma-separated), tried after the primary.
 */

/** @typedef {'gemini' | 'openai'} ModelFamily */
/** @typedef {'vision' | 'image' | 'enhance'} ModelTask */

export const MODEL_FAMILIES = /** @type {const} */ (['gemini', 'openai']);

const MODEL_TASKS = /** @type {const} */ (['vision', 'enhance', 'image']);

const TASK_ENV_NAMES = {
  vision: 'VISION',
  image: 'IMAGE',
  enhance: 'ENHANCE_IMAGE',
};

const TASK_LABELS = {
  vision: 'OCR / text translation',
  image: 'translate-image',
  enhance: 'enhance',
};

const FAMILY_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI',
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
  const normalized = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (normalized && MODEL_FAMILIES.includes(/** @type {ModelFamily} */ (normalized))) {
    return /** @type {ModelFamily} */ (normalized);
  }
  return getDefaultModelFamily();
};

/**
 * Translation (OCR, text translation, image render) is not user-selectable:
 * it always uses TRANSLATION_MODEL_FAMILY from .env (gemini | openai), OpenAI when unset.
 * Only applies with OpenRouter — direct Gemini always uses the GEMINI_* keys.
 * @returns {ModelFamily}
 */
export const getTranslationModelFamily = () => {
  const configured = readEnvModel('TRANSLATION_MODEL_FAMILY')?.toLowerCase();
  return MODEL_FAMILIES.includes(/** @type {ModelFamily} */ (configured))
    ? /** @type {ModelFamily} */ (configured)
    : 'openai';
};

const envPrefix = (provider, family) =>
  provider === 'openrouter' ? `OPENROUTER_${family === 'openai' ? 'OPENAI' : 'GEMINI'}` : 'GEMINI';

/** The .env key holding the primary model for a provider / family / task */
export const getModelEnvKey = (provider, family, task) =>
  `${envPrefix(provider, family)}_${TASK_ENV_NAMES[task]}_MODEL`;

const dedupe = (list) => [...new Set(list)];

const readTaskChain = (provider, family, task) => {
  const key = getModelEnvKey(provider, family, task);
  const list = readEnvModel(`${key}S`);
  const chain = [readEnvModel(key), ...(list ? parseCommaList(list) : [])].filter(Boolean);

  // Legacy alias for the OpenRouter Gemini image model
  if (chain.length === 0 && provider === 'openrouter' && family === 'gemini' && task === 'image') {
    const legacy = readEnvModel('IMAGE_MODEL');
    if (legacy) chain.push(legacy);
  }

  return dedupe(chain);
};

/**
 * Models to try, in order — empty when .env does not configure the task.
 * @param {'gemini' | 'openrouter'} provider
 * @param {ModelFamily} family
 * @param {ModelTask} task
 */
export const getModelChain = (provider, family, task) => {
  const chain = readTaskChain(provider, family, task);

  if (task === 'enhance' && chain.length === 0) {
    return readTaskChain(provider, family, 'image');
  }

  // Opt-in: let OpenAI image edits fall back to the Gemini image models (OPENROUTER_OPENAI_IMAGE_FALLBACK_TO_GEMINI=true)
  if (
    provider === 'openrouter' &&
    family === 'openai' &&
    task === 'image' &&
    readEnvModel('OPENROUTER_OPENAI_IMAGE_FALLBACK_TO_GEMINI') === 'true'
  ) {
    return dedupe([...chain, ...readTaskChain(provider, 'gemini', 'image')]);
  }

  return chain;
};

/** What to set in .env when a task has no model, or null when it is configured */
export const describeMissingModel = (provider, family, task) => {
  if (getModelChain(provider, family, task).length > 0) return null;

  const key = getModelEnvKey(provider, family, task);
  const alternative = task === 'enhance' ? ` or ${getModelEnvKey(provider, family, 'image')}` : '';
  return `No ${TASK_LABELS[task]} model configured. Set ${key}${alternative} in .env (see .env.example).`;
};

/**
 * Models that use OpenRouter's dedicated Image API (POST /api/v1/images),
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

  const translationFamily = getTranslationModelFamily();

  return {
    provider: resolvedProvider,
    configuredProvider: uiProvider,
    showModelFamilySelector: uiProvider === 'openrouter' && families.length > 1,
    modelFamilies: families.map((id) => ({
      id,
      label: FAMILY_LABELS[id] || id,
    })),
    defaultModelFamily: defaultFamily,
    translationModelLabel: uiProvider === 'openrouter' ? FAMILY_LABELS[translationFamily] : 'Gemini',
  };
};

/** Startup log of every model chain read from .env, flagging gaps */
export const logModelConfig = (provider) => {
  const families =
    provider === 'openrouter' ? dedupe([...parseUiModelFamilies(), getTranslationModelFamily()]) : ['gemini'];

  console.log('[ai-provider] ── Model configuration (.env) ──');
  console.log(`  Provider:           ${provider}`);

  for (const family of families) {
    for (const task of MODEL_TASKS) {
      const chain = getModelChain(provider, family, task);
      const label = provider === 'openrouter' ? `${family} ${task}` : task;
      console.log(`  ${`${label}:`.padEnd(20)}${chain.length ? chain.join(' → ') : `⚠️  not set — ${describeMissingModel(provider, family, task)}`}`);

      if (provider === 'openrouter') {
        for (const model of chain.filter((m) => !m.includes('/'))) {
          console.warn(`  ⚠️  "${model}" is not an OpenRouter slug (expected provider/model, e.g. google/…)`);
        }
      }
    }
  }

  if (provider === 'openrouter') {
    const translationFamily = getTranslationModelFamily();
    console.log(`  Translation:        ${translationFamily} only (TRANSLATION_MODEL_FAMILY)`);
    for (const task of ['vision', 'image']) {
      const missing = describeMissingModel(provider, translationFamily, task);
      if (missing) console.warn(`  ⚠️  Translation will fail: ${missing}`);
    }
    console.log(`  Enhance UI families: ${parseUiModelFamilies().join(', ')} (default ${getDefaultModelFamily()})`);
  }
  console.log('[ai-provider] ─────────────────────────────────');
};
