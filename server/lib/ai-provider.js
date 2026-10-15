import '../load-env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  resolveModelFamily,
  getModelChain,
  describeMissingModel,
  logModelConfig,
  getOpenRouterVisionMaxTokens,
  getOpenRouterImageModalities,
  usesOpenRouterDedicatedImageApi,
} from './model-config.js';

export {
  readEnvModel,
  resolveModelFamily,
  getTranslationModelFamily,
  isOpenRouterImageModel,
  getPublicAiConfig,
  getOpenRouterVisionMaxTokens,
  getOpenRouterImageModalities,
  usesOpenRouterDedicatedImageApi,
} from './model-config.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_IMAGES_API_URL = 'https://openrouter.ai/api/v1/images';

/**
 * Models to try, in order, for a task with the active provider — read from .env only.
 * @param {'vision' | 'image' | 'enhance'} task
 */
export const getModelsFor = (task, modelFamily, provider = resolveAiProvider()) =>
  getModelChain(provider, resolveModelFamily(modelFamily), task);

export const logActiveModelConfig = () => logModelConfig(resolveAiProvider());

/** OpenRouter defaults to 32768 max_tokens — too expensive for image output */
const OPENROUTER_IMAGE_MAX_TOKENS = 4096;

const isPlaceholderKey = (key) => !key || key === 'your_api_key_here';

const isValidGeminiKey = (key) =>
  typeof key === 'string' &&
  (key.startsWith('AIza') || key.startsWith('AQ.')) &&
  key.length > 10;

export const isModelNotFoundError = (error) =>
  error?.status === 404 ||
  /not found for API|not supported for generateContent|is not found|no endpoints found|output modalities/i.test(
    error?.message || ''
  );

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

/**
 * API key checks, plus — when `task` is given — that .env names a model for it.
 * @param {{ task?: 'vision' | 'image' | 'enhance', modelFamily?: string }} [options]
 */
export const validateAiConfig = ({ task, modelFamily } = {}) => {
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

  if (task) {
    const missingModel = describeMissingModel(provider, resolveModelFamily(modelFamily), task);
    if (missingModel) {
      return {
        status: 500,
        body: {
          error: missingModel,
          instructions: 'Model names are read only from .env — see .env.example for every key.',
        },
      };
    }
  }

  return null;
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

const buildGeminiLikeResponseFromImageApi = (imageApiData) => {
  const item = imageApiData?.data?.[0];
  const b64 = item?.b64_json;
  const mimeType = item?.media_type || 'image/png';
  const parts = b64 ? [{ inlineData: { mimeType, data: b64 } }] : [{ text: '' }];

  return {
    text: () => '',
    candidates: [{ content: { parts } }],
  };
};

const openRouterHeaders = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  // Shown on OpenRouter activity / rankings
  'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
  'X-Title': process.env.APP_NAME || process.env.OPENROUTER_APP_TITLE || 'AI Image Optimizer',
});

class OpenRouterModel {
  constructor(apiKey, modelName) {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async generateViaImageApi(prompt, imageData, mimeType) {
    const body = {
      model: this.modelName,
      prompt,
      output_format: 'png',
      input_references: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageData}` },
        },
      ],
    };

    body.quality = 'high';

    console.log(`[ai-provider] OpenRouter Image API → ${this.modelName} (with reference image)`);

    const response = await fetch(OPENROUTER_IMAGES_API_URL, {
      method: 'POST',
      headers: openRouterHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || `OpenRouter Image API error: ${response.status}`;
      const error = new Error(errMsg);
      error.status = response.status;
      throw error;
    }

    if (!data?.data?.[0]?.b64_json) {
      const error = new Error('OpenRouter Image API returned no image data');
      error.status = 502;
      throw error;
    }

    return {
      response: Promise.resolve(buildGeminiLikeResponseFromImageApi(data)),
    };
  }

  async generateContent(parts, options = {}) {
    const { text, imageData, mimeType } = parseGeminiParts(parts);

    if (usesOpenRouterDedicatedImageApi(this.modelName)) {
      if (!imageData) {
        const error = new Error(
          `${this.modelName} requires a reference image. Use the OpenRouter Image API with input_references.`
        );
        error.status = 400;
        throw error;
      }
      return this.generateViaImageApi(text, imageData, mimeType);
    }

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

    const modalities = getOpenRouterImageModalities(this.modelName);
    if (modalities) {
      body.modalities = modalities;
      if (body.max_tokens === undefined) {
        body.max_tokens = OPENROUTER_IMAGE_MAX_TOKENS;
      }
    } else if (body.max_tokens === undefined || body.max_tokens > getOpenRouterVisionMaxTokens()) {
      body.max_tokens = getOpenRouterVisionMaxTokens();
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: openRouterHeaders(this.apiKey),
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

/**
 * Image output (enhance / translate image): walk the primary provider's .env model chain,
 * then the other provider's own chain when it has a key.
 */
export async function generateWithProviderFallback({
  parts,
  generationConfig = {},
  modelFamily = 'gemini',
  purpose = 'image',
}) {
  const primary = resolveAiProvider();
  const family = resolveModelFamily(modelFamily);
  const task = purpose === 'enhance' ? 'enhance' : 'image';

  const alternate = primary === 'openrouter' ? 'gemini' : 'openrouter';
  const providers = [primary];
  if (getAiApiKey(alternate)) providers.push(alternate);

  const config = { maxOutputTokens: OPENROUTER_IMAGE_MAX_TOKENS, ...generationConfig };
  let lastError;

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];
    const apiKey = getAiApiKey(provider);
    if (!apiKey) continue;

    const models = getModelChain(provider, family, task);
    if (models.length === 0) {
      console.warn(`[ai-provider] Skipping ${provider}: ${describeMissingModel(provider, family, task)}`);
      continue;
    }

    for (let mi = 0; mi < models.length; mi++) {
      const modelName = models[mi];

      try {
        if (pi > 0 && mi === 0) {
          console.warn(`[ai-provider] Retrying with ${provider} / ${modelName} after ${primary} failed`);
        } else if (mi > 0) {
          console.warn(`[ai-provider] Trying fallback model ${modelName} on ${provider}`);
        } else {
          console.log(`[ai-provider] Using ${provider} / ${modelName} [${purpose}]`);
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

  throw lastError || new Error(describeMissingModel(primary, family, task) || 'No AI provider available');
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
          ? 'Model not available for your Google API key. Check the GEMINI_*_MODEL names in .env against ListModels for your account.'
          : /output modalities/i.test(message)
            ? 'This model cannot output images. Use an image-editing model in the OPENROUTER_*_IMAGE_MODEL keys in .env.'
            : 'Model not available on OpenRouter. Check the OPENROUTER_*_MODEL slugs in .env.',
      details: message,
    };
  }

  return {
    status: 500,
    message: 'Failed to process request',
    details: message || 'Unknown error',
  };
};
