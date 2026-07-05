const MAX_ITEMS_PER_BATCH = 6;
const MAX_CHARS_PER_BATCH = 1800;

import { resolveAiProvider } from './ai-provider.js';

export class TranslationServiceError extends Error {
  constructor(message, { statusCode = 500, details } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const languageNames = {
  en: 'English',
  ru: 'Russian',
  tr: 'Turkish',
  uk: 'Ukrainian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
};

export const getLanguageName = (code) => languageNames[code] || code;

export const sanitizeTexts = (texts) => {
  return texts
    .map((value, index) => {
      if (typeof value !== 'string') {
        return { originalIndex: index, text: '' };
      }

      const normalized = value.replace(/\s+/g, ' ').trim();
      return { originalIndex: index, text: normalized };
    })
    .filter((item) => item.text.length > 0);
};

const chunkTexts = (items) => {
  const batches = [];
  let currentBatch = [];
  let currentCharCount = 0;

  for (const item of items) {
    const nextLength = item.text.length;
    const exceedsItemLimit = currentBatch.length >= MAX_ITEMS_PER_BATCH;
    const exceedsCharLimit = currentBatch.length > 0 && currentCharCount + nextLength > MAX_CHARS_PER_BATCH;

    if (exceedsItemLimit || exceedsCharLimit) {
      batches.push(currentBatch);
      currentBatch = [];
      currentCharCount = 0;
    }

    currentBatch.push(item);
    currentCharCount += nextLength;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const escapeForPrompt = (text) => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
};

const buildPrompt = (items, targetLanguageName) => {
  const instructions = items
    .map((item, idx) => `${idx + 1}. "${escapeForPrompt(item.text)}"`)
    .join('\n');

  return `You are a professional translator. Translate the following texts to ${targetLanguageName}.

CRITICAL REQUIREMENTS:
1. Return ONLY a valid JSON array
2. Maintain the exact same order as the input texts
3. Translate each text accurately and completely
4. Do not add explanations, comments, or markdown

Texts:
${instructions}

Return ONLY this format (JSON array):
["translation1", "translation2", "..."]`;
};

const extractArrayFromResponse = (raw) => {
  const codeBlockMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return raw.trim();
};

export const tryParseJsonArray = (raw, expectedLength) => {
  let parsed = [];

  try {
    parsed = JSON.parse(extractArrayFromResponse(raw));
  } catch (error) {
    const quotedMatches = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (quotedMatches.length >= expectedLength) {
      parsed = quotedMatches.slice(0, expectedLength);
    } else {
      const numberedLines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => /^\d+\./.test(line));

      if (numberedLines.length >= expectedLength) {
        parsed = numberedLines.slice(0, expectedLength).map((line) => line.replace(/^\d+\.\s*["']?|["']?$/g, '').trim());
      } else {
        const fallbackLines = raw
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .filter((line) => !/^[\[\]{}",]*$/.test(line))
          .slice(0, expectedLength);

        parsed = fallbackLines.map((line) => line.replace(/^["']|["']$/g, ''));
      }
    }
  }

  if (!Array.isArray(parsed)) {
    parsed = [];
  }

  const normalized = parsed
    .map((value) => (typeof value === 'string' ? value : String(value ?? '')))
    .map((value) => value.trim());

  if (normalized.length !== expectedLength) {
    while (normalized.length < expectedLength) {
      normalized.push('');
    }
    normalized.length = expectedLength;
  }

  return normalized;
};

const MODEL_RETRY_STATUSES = new Set([404]);
const RETRYABLE_MODEL_MESSAGES = ['not found', 'unsupported', 'unknown model'];

export const classifyGeminiError = (error) => {
  const message = error?.message || '';

  const provider = resolveAiProvider();
  const keyName = provider === 'openrouter' ? 'OpenRouter API key' : 'Gemini API key';

  if (error?.status === 401 || message.includes('API_KEY_INVALID') || message.includes('Permission') || message.toLowerCase().includes('unauthorized')) {
    return new TranslationServiceError(`Invalid or unauthorized ${keyName}`, { statusCode: 401, details: message });
  }

  if (error?.status === 429 || message.includes('429') || message.toLowerCase().includes('quota')) {
    return new TranslationServiceError('Translation quota exceeded. Please wait and try again.', { statusCode: 429, details: message });
  }

  if (error?.status === 503 || message.includes('overloaded') || message.includes('unavailable')) {
    return new TranslationServiceError('Translation service is temporarily unavailable. Please retry shortly.', {
      statusCode: 503,
      details: message,
    });
  }

  if (error?.status === 400 || message.toLowerCase().includes('safety')) {
    return new TranslationServiceError('Translation blocked by safety filters for the provided text.', {
      statusCode: 400,
      details: message,
    });
  }

  const normalizedMessage = message.toLowerCase();
  const shouldRetryModel =
    MODEL_RETRY_STATUSES.has(error?.status) || RETRYABLE_MODEL_MESSAGES.some((needle) => normalizedMessage.includes(needle));

  if (shouldRetryModel) {
    return new TranslationServiceError('Translation model unavailable. Retrying with fallback model.', {
      statusCode: 503,
      details: message,
      modelRetry: true,
    });
  }

  return new TranslationServiceError('Failed to translate texts', { statusCode: 500, details: message });
};

const isBatchSplittableError = (error) => {
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.status === 413 ||
    message.includes('max output tokens') ||
    message.includes('safety') ||
    message.includes('length') ||
    message.includes('too long')
  );
};

const translateBatch = async ({ model, batch, targetLanguageName, generationConfig }) => {
  const prompt = buildPrompt(batch, targetLanguageName);
  const result = await model.generateContent([prompt], { generationConfig });
  const response = await result.response;
  const text = response.text();

  return tryParseJsonArray(text, batch.length);
};

export const performTranslations = async ({ genAI, items, targetLanguageName }) => {
  const generationConfig = {
    temperature: 0.3,
    topP: 0.9,
    topK: 32,
    maxOutputTokens: 2048,
  };

  const preferredModels = [
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-3-pro-image-preview',
  ];

  let lastError;

  for (const modelName of preferredModels) {
    let model;

    try {
      model = genAI.getGenerativeModel({ model: modelName });
    } catch (error) {
      lastError = error;
      console.warn(`[translate-text] Failed to initialise model "${modelName}":`, error?.message || error);
      continue;
    }

    console.info(`[translate-text] Using Gemini model "${modelName}" for translation.`);

    const batches = chunkTexts(items);
    const results = {};

    try {
      for (const batch of batches) {
        try {
          const translations = await translateBatch({ model, batch, targetLanguageName, generationConfig });
          batch.forEach((item, index) => {
            results[item.originalIndex] = translations[index] ?? '';
          });
        } catch (error) {
          const classified = classifyGeminiError(error);

          if (batch.length > 1 && isBatchSplittableError(error)) {
            for (const item of batch) {
              try {
                const singleTranslation = await translateBatch({
                  model,
                  batch: [item],
                  targetLanguageName,
                  generationConfig,
                });
                results[item.originalIndex] = singleTranslation[0] ?? '';
              } catch (singleError) {
                throw classifyGeminiError(singleError);
              }
            }
          } else if (classified.modelRetry) {
          throw classified;
          } else {
            throw classified;
          }
        }
      }

      // ensure every index populated
      items.forEach((item) => {
        if (typeof results[item.originalIndex] !== 'string') {
          results[item.originalIndex] = '';
        }
      });

      return results;
    } catch (error) {
      lastError = error;
      if (error instanceof TranslationServiceError && error.modelRetry) {
        console.warn(`[translate-text] Model "${modelName}" unavailable. Trying next fallback.`);
        continue;
      }
      console.error('[translate-text] Translation failed with non-retryable error:', error);
      throw error;
    }
  }

  throw classifyGeminiError(lastError || new Error('No Gemini translation model available'));
};

export const createTextTranslationService = (genAI) => {
  return {
    async translateTexts({ texts, targetLanguage }) {
      if (!Array.isArray(texts)) {
        throw new TranslationServiceError('Texts must be provided as an array', { statusCode: 400 });
      }

      const targetLanguageName = getLanguageName(targetLanguage);
      const sanitizedItems = sanitizeTexts(texts);
      const translations = Array.from({ length: texts.length }, () => '');

      if (sanitizedItems.length === 0) {
        return {
          translations,
          sanitizedCount: 0,
          targetLanguageName,
        };
      }

      const translationMap = await performTranslations({
        genAI,
        items: sanitizedItems,
        targetLanguageName,
      });

      sanitizedItems.forEach((item) => {
        translations[item.originalIndex] = translationMap[item.originalIndex] ?? '';
      });

      return {
        translations,
        sanitizedCount: sanitizedItems.length,
        targetLanguageName,
      };
    },
  };
};


