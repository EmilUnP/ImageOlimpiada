import '../load-env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const getOpenRouterDefaultImageModel = () =>
  process.env.IMAGE_MODEL?.trim() || 'gemini-2.5-flash-image-preview';

const readEnvModel = (key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

/**
 * Google AI Studio — image IN + image OUT (enhance / translate image).
 * Verified via ListModels API (Nano Banana family).
 */
export const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',           // Nano Banana — stable default
  'gemini-3.1-flash-image',           // Nano Banana 2
  'gemini-3.1-flash-lite-image',      // Nano Banana 2 Lite — cheaper
  'gemini-3-pro-image',               // Nano Banana Pro
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
];

/**
 * Google AI Studio — image IN + text OUT (OCR, text translation).
 * Multimodal flash models; NOT image-generation models.
 */
export const GEMINI_VISION_MODELS = [
  'gemini-2.5-pro',                   // best OCR / academic translation quality
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
];

/** OpenRouter-only names → Google direct API equivalents */
const OPENROUTER_TO_GEMINI_DIRECT = {
  'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image',
};

export const normalizeDirectImageModel = (modelName) =>
  OPENROUTER_TO_GEMINI_DIRECT[modelName] || modelName;

export const getDefaultImageModel = (provider = resolveAiProvider()) =>
  provider === 'openrouter'
    ? getOpenRouterDefaultImageModel()
    : readEnvModel('GEMINI_IMAGE_MODEL') || GEMINI_IMAGE_MODELS[0];

export const getDefaultVisionModel = () =>
  readEnvModel('GEMINI_VISION_MODEL') || GEMINI_VISION_MODELS[0];

/** Vision models to try — env model first, then fallbacks (deduped) */
export const getPreferredVisionModels = () => {
  const envModel = readEnvModel('GEMINI_VISION_MODEL');
  if (envModel) {
    return [envModel, ...GEMINI_VISION_MODELS.filter((m) => m !== envModel)];
  }
  return [...GEMINI_VISION_MODELS];
};

/** Image models to try — env model first, then fallbacks (deduped) */
export const getPreferredImageModels = (explicitModel) => {
  const envModel = readEnvModel('GEMINI_IMAGE_MODEL');
  const primary = (explicitModel?.trim() || envModel || '').trim() || null;

  if (primary) {
    const normalized = normalizeDirectImageModel(primary);
    return [normalized, ...GEMINI_IMAGE_MODELS.filter((m) => m !== normalized)];
  }
  return [...GEMINI_IMAGE_MODELS];
};

export const logActiveModelConfig = () => {
  const provider = resolveAiProvider();
  const vision = getPreferredVisionModels();
  const image = getPreferredImageModels();
  console.log('[ai-provider] ── Active model configuration ──');
  console.log(`  Provider:        ${provider}`);
  console.log(`  GEMINI_VISION_MODEL (env): ${readEnvModel('GEMINI_VISION_MODEL') || '(not set)'}`);
  console.log(`  GEMINI_IMAGE_MODEL (env):  ${readEnvModel('GEMINI_IMAGE_MODEL') || '(not set)'}`);
  console.log(`  OCR / translate chain:     ${vision.slice(0, 4).join(' → ')}`);
  console.log(`  Image edit chain:          ${image.slice(0, 4).join(' → ')}`);
  console.log('[ai-provider] ─────────────────────────────────');
};

/** Pick image model for translate-image based on quality tier */
export const getImageModelForQuality = (quality = 'premium', provider = resolveAiProvider()) => {
  const envModel = readEnvModel('GEMINI_IMAGE_MODEL');
  if (envModel) {
    return provider === 'gemini' ? normalizeDirectImageModel(envModel) : envModel;
  }

  if (quality === 'ultra') return 'gemini-3-pro-image';
  if (quality === 'premium') return 'gemini-3.1-flash-image';
  return getDefaultImageModel(provider);
};

/** @deprecated use getDefaultImageModel() */
export const DEFAULT_IMAGE_MODEL = GEMINI_IMAGE_MODELS[0];

/** OpenRouter defaults to 32768 max_tokens — too expensive for image output */
const OPENROUTER_IMAGE_MAX_TOKENS = 4096;

const OPENROUTER_MODEL_MAP = {
  'gemini-2.5-flash-image': 'google/gemini-2.5-flash-image-preview',
  'gemini-3-pro-image-preview': 'google/gemini-3-pro-image-preview',
  'gemini-3-pro-image': 'google/gemini-3-pro-image-preview',
  'gemini-3.1-flash-image': 'google/gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image-preview': 'google/gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image-preview': 'google/gemini-2.5-flash-image-preview',
  'gemini-2.0-flash': 'google/gemini-2.0-flash',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
};

const isPlaceholderKey = (key) => !key || key === 'your_api_key_here';

const isValidGeminiKey = (key) =>
  typeof key === 'string' &&
  (key.startsWith('AIza') || key.startsWith('AQ.')) &&
  key.length > 10;

const getImageModelsForProvider = (provider, explicitModel) => {
  if (provider === 'openrouter') {
    if (explicitModel) return [explicitModel];
    return [getOpenRouterDefaultImageModel()];
  }

  return getPreferredImageModels(explicitModel);
};

export const isModelNotFoundError = (error) =>
  error?.status === 404 ||
  /not found for API|not supported for generateContent|is not found/i.test(error?.message || '');

export const resolveAiProvider = () => {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const hasOpenRouterKey = !isPlaceholderKey(openRouterKey);
  const hasGeminiKey = !isPlaceholderKey(geminiKey);

  if (explicit === 'openrouter') {
    if (hasOpenRouterKey || isOpenRouterKey(geminiKey)) return 'openrouter';
    if (hasGeminiKey) {
      console.warn(
        '[ai-provider] AI_PROVIDER=openrouter but OPENROUTER_API_KEY is missing. Falling back to Gemini.'
      );
      return 'gemini';
    }
    return 'openrouter';
  }

  if (explicit === 'gemini') {
    return 'gemini';
  }

  if (hasOpenRouterKey && !hasGeminiKey) {
    return 'openrouter';
  }

  if (isOpenRouterKey(geminiKey) && !hasGeminiKey) {
    return 'openrouter';
  }

  if (hasOpenRouterKey && isPlaceholderKey(geminiKey)) {
    return 'openrouter';
  }

  if (geminiKey?.startsWith('sk-or-')) {
    return 'openrouter';
  }

  return 'gemini';
};

const isOpenRouterKey = (key) => typeof key === 'string' && key.startsWith('sk-or-');

export const getAiApiKey = (provider = resolveAiProvider()) => {
  if (provider === 'openrouter') {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!isPlaceholderKey(openRouterKey)) return openRouterKey;

    const geminiKey = process.env.GEMINI_API_KEY;
    if (isOpenRouterKey(geminiKey)) return geminiKey;

    return null;
  }

  const key = process.env.GEMINI_API_KEY;
  return isPlaceholderKey(key) ? null : key;
};

export const validateAiConfig = () => {
  const provider = resolveAiProvider();
  const apiKey = getAiApiKey(provider);

  if (!apiKey) {
    return {
      status: 500,
      body: {
        error:
          provider === 'openrouter'
            ? 'AI service not configured. Set OPENROUTER_API_KEY (starts with sk-or-) or change AI_PROVIDER=gemini'
            : 'AI service not configured. Please set GEMINI_API_KEY environment variable',
        instructions:
          provider === 'openrouter'
            ? 'Get your API key from https://openrouter.ai/keys — do not use a Google Gemini key with OpenRouter'
            : 'Get your API key from https://aistudio.google.com/app/apikey and add it to environment variables',
      },
    };
  }

  if (provider === 'gemini' && isOpenRouterKey(apiKey)) {
    return {
      status: 500,
      body: {
        error: 'GEMINI_API_KEY looks like an OpenRouter key (sk-or-).',
        instructions: 'Set AI_PROVIDER=openrouter with OPENROUTER_API_KEY, or use a Google key (AIza... or AQ....) from https://aistudio.google.com/app/apikey',
      },
    };
  }

  if (provider === 'gemini' && !isValidGeminiKey(apiKey)) {
    return {
      status: 500,
      body: {
        error: 'GEMINI_API_KEY format is not recognized.',
        instructions:
          'Use a Google AI Studio key from https://aistudio.google.com/app/apikey — standard keys start with AIza, newer auth keys start with AQ.',
      },
    };
  }

  return null;
};

const toOpenRouterModel = (modelName) => {
  if (modelName.includes('/')) return modelName;
  return OPENROUTER_MODEL_MAP[modelName] || `google/${modelName}`;
};

const parseGeminiParts = (parts) => {
  let text = '';
  let imageData = null;
  let mimeType = 'image/jpeg';

  for (const part of parts) {
    if (typeof part === 'string') {
      text += part;
    } else if (part?.inlineData) {
      imageData = part.inlineData.data;
      mimeType = part.inlineData.mimeType || mimeType;
    }
  }

  return { text, imageData, mimeType };
};

const buildGeminiLikeResponse = (openRouterData) => {
  const message = openRouterData?.choices?.[0]?.message || {};
  let textContent = '';

  if (typeof message.content === 'string') {
    textContent = message.content;
  } else if (Array.isArray(message.content)) {
    textContent = message.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('');
  }

  const parts = [];
  if (textContent) {
    parts.push({ text: textContent });
  }

  if (Array.isArray(message.images)) {
    for (const image of message.images) {
      const url = image?.image_url?.url || image?.url || '';
      const match = url.match(/data:([^;]+);base64,(.+)/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
  }

  return {
    text: () => textContent,
    candidates: [{ content: { parts: parts.length > 0 ? parts : [{ text: textContent }] } }],
  };
};

class OpenRouterModel {
  constructor(apiKey, modelName) {
    this.apiKey = apiKey;
    this.modelName = toOpenRouterModel(modelName);
  }

  async generateContent(parts, options = {}) {
    const { text, imageData, mimeType } = parseGeminiParts(parts);
    const content = [{ type: 'text', text }];

    if (imageData) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${imageData}` },
      });
    }

    const body = {
      model: this.modelName,
      messages: [{ role: 'user', content: imageData ? content : text }],
    };

    if (options.generationConfig) {
      const { temperature, topP, maxOutputTokens } = options.generationConfig;
      if (temperature !== undefined) body.temperature = temperature;
      if (topP !== undefined) body.top_p = topP;
      if (maxOutputTokens !== undefined) body.max_tokens = maxOutputTokens;
    }

    if (this.modelName.includes('image')) {
      body.modalities = ['image', 'text'];
      if (body.max_tokens === undefined) {
        body.max_tokens = OPENROUTER_IMAGE_MAX_TOKENS;
      }
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
        'X-Title': 'Vision AI',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || `OpenRouter API error: ${response.status}`;
      const error = new Error(errMsg);
      error.status = response.status;
      throw error;
    }

    return {
      response: Promise.resolve(buildGeminiLikeResponse(data)),
    };
  }
}

class OpenRouterClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  getGenerativeModel({ model }) {
    return new OpenRouterModel(this.apiKey, model);
  }
}

export const createGenerativeAI = (provider = resolveAiProvider()) => {
  const apiKey = getAiApiKey(provider);

  if (provider === 'openrouter') {
    console.log('[ai-provider] Using OpenRouter');
    return new OpenRouterClient(apiKey);
  }

  console.log('[ai-provider] Using Google Gemini directly');
  return new GoogleGenerativeAI(apiKey);
};

const isRetryableProviderError = (error) => {
  const message = error?.message || '';
  return (
    [401, 402, 429].includes(error?.status) ||
    /credits|afford|quota|rate limit|billing|payment/i.test(message)
  );
};

/** Try primary provider, then fall back; try multiple image models per provider on 404 */
export async function generateWithProviderFallback({ model, parts, generationConfig = {} }) {
  const primary = resolveAiProvider();
  const resolvedModel = model?.trim() || getDefaultImageModel(primary);
  const envImageModel = readEnvModel('GEMINI_IMAGE_MODEL');

  const alternate = primary === 'openrouter' ? 'gemini' : 'openrouter';
  const providers = [primary];
  if (getAiApiKey(alternate)) providers.push(alternate);

  const config = { maxOutputTokens: OPENROUTER_IMAGE_MAX_TOKENS, ...generationConfig };
  let lastError;

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];
    const apiKey = getAiApiKey(provider);
    if (!apiKey) continue;

    const models = getImageModelsForProvider(provider, resolvedModel);

    for (let mi = 0; mi < models.length; mi++) {
      const modelName = models[mi];
      const fromEnv = envImageModel && modelName === normalizeDirectImageModel(envImageModel);

      try {
        if (pi > 0 && mi === 0) {
          console.warn(`[ai-provider] Retrying with ${provider} after ${primary} failed`);
        } else if (mi > 0) {
          console.warn(`[ai-provider] Trying fallback model ${modelName} on ${provider}`);
        } else {
          console.log(
            `[ai-provider] Using ${provider} / ${modelName}${fromEnv ? ' (GEMINI_IMAGE_MODEL from .env)' : model ? '' : ' (default chain)'}`
          );
        }

        const client =
          provider === 'openrouter'
            ? new OpenRouterClient(apiKey)
            : new GoogleGenerativeAI(apiKey);
        const genModel = client.getGenerativeModel({ model: modelName });
        return await genModel.generateContent(parts, { generationConfig: config });
      } catch (error) {
        lastError = error;
        const hasMoreModels = mi < models.length - 1;
        const hasMoreProviders = pi < providers.length - 1;

        if (isModelNotFoundError(error) && hasMoreModels) {
          console.warn(`[ai-provider] Model ${modelName} not available: ${error.message}`);
          continue;
        }

        if (isRetryableProviderError(error) && hasMoreProviders) {
          console.warn(`[ai-provider] ${provider} error (${error.status || '?'}): ${error.message}`);
          break;
        }

        throw error;
      }
    }
  }

  throw lastError || new Error('No AI provider available');
};

export const classifyAiError = (error) => {
  const message = error?.message || '';
  const provider = resolveAiProvider();
  const keyName = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'GEMINI_API_KEY';

  if (
    error?.status === 401 ||
    message.includes('API_KEY_INVALID') ||
    message.includes('Unauthorized') ||
    message.toLowerCase().includes('invalid api key')
  ) {
    return {
      status: 401,
      message: `Invalid API key. Please check your ${keyName}.`,
    };
  }

  if (
    error?.status === 402 ||
    message.toLowerCase().includes('credits') ||
    message.toLowerCase().includes('afford') ||
    message.toLowerCase().includes('billing') ||
    message.toLowerCase().includes('payment required')
  ) {
    return {
      status: 402,
      message:
        provider === 'openrouter'
          ? 'OpenRouter credits too low for image generation. Add credits at openrouter.ai/settings/credits, or set AI_PROVIDER=gemini in .env to use your Google API key directly.'
          : 'AI billing or quota limit reached. Check your API plan and credits.',
      details: message,
    };
  }

  if (
    error?.status === 429 ||
    message.includes('429') ||
    message.toLowerCase().includes('quota') ||
    message.toLowerCase().includes('rate limit')
  ) {
    return {
      status: 429,
      message: 'API quota exceeded. You have used up your free tier limit.',
      retryAfter: '42 seconds',
    };
  }

  if (isModelNotFoundError(error)) {
    return {
      status: 404,
      message:
        provider === 'gemini'
          ? `Image model not available. Set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image in .env (see ListModels for your account).`
          : 'Image model not available. Check IMAGE_MODEL in .env or OpenRouter model list.',
      details: message,
    };
  }

  return {
    status: 500,
    message: 'Failed to process request',
    details: message || 'Unknown error',
  };
};
