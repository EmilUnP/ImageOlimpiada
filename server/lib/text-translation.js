const MAX_ITEMS_PER_BATCH = 6;
const MAX_CHARS_PER_BATCH = 1800;

import { resolveAiProvider, getModelsFor } from './ai-provider.js';
import { buildAcademicTextTranslationPrompt } from './textbook-prompts.js';
import { resolveSubject } from './subject-rules.js';
import {
  maskFormulas,
  unmaskFormulas,
  hasTranslatableText,
  normaliseLatexBackslashes,
  parseJsonWithLatex,
  decodeJsonStringBody,
} from './formula-utils.js';

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
  az: 'Azerbaijani',
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
  let parsed = parseJsonWithLatex(extractArrayFromResponse(raw));

  if (parsed === undefined) {
    console.warn('[translate-text] Model output is not valid JSON; using line-based fallback. Output:', raw.slice(0, 500));
    const quotedMatches = [...raw.matchAll(/"((?:[^"\\]|\\.)+)"/g)].map((m) => decodeJsonStringBody(m[1]));
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

const translateBatch = async ({ model, batch, targetLanguageName, subject, generationConfig }) => {
  const prompt = buildAcademicTextTranslationPrompt(batch, targetLanguageName, subject);
  const result = await model.generateContent([prompt], { generationConfig });
  const response = await result.response;
  const text = response.text();

  return tryParseJsonArray(text, batch.length);
};

/**
 * Formulas without Cyrillic are swapped for [[F1]] tokens so the model cannot rewrite them.
 * Blocks that are only formulas/numbers skip the model and come back unchanged.
 */
const prepareItems = (items) => {
  const prepared = items.map((item) => {
    const { masked, formulas } = maskFormulas(item.text);
    return { originalIndex: item.originalIndex, source: item.text, text: masked, formulas };
  });

  return {
    passthrough: prepared.filter((item) => !hasTranslatableText(item.text)),
    toTranslate: prepared.filter((item) => hasTranslatableText(item.text)),
  };
};

export const performTranslations = async ({
  genAI,
  items,
  targetLanguageName,
  modelFamily = 'gemini',
  subject = 'auto',
}) => {
  const generationConfig = {
    temperature: 0.3,
    topP: 0.9,
    topK: 32,
    maxOutputTokens: 2048,
  };

  const { passthrough, toTranslate } = prepareItems(items);
  const passthroughResults = Object.fromEntries(passthrough.map((item) => [item.originalIndex, item.source]));

  if (toTranslate.length === 0) {
    return passthroughResults;
  }

  const family = modelFamily || 'gemini';
  const preferredModels = getModelsFor('vision', family);
  const configuredModel = preferredModels[0];

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

    console.info(`[translate-text] Using model "${modelName}" (${family}) for translation.`);

    if (configuredModel && modelName !== configuredModel) {
      console.warn(
        `[translate-text] ⚠️  Fell back from configured vision model "${configuredModel}" to "${modelName}"`
      );
    }

    const batches = chunkTexts(toTranslate);
    const results = { ...passthroughResults };

    const translateAndRestore = async (batch) => {
      const translations = await translateBatch({ model, batch, targetLanguageName, subject, generationConfig });
      return batch.map((item, index) => ({
        item,
        ...unmaskFormulas(normaliseLatexBackslashes(translations[index] ?? '', item.source), item.formulas),
      }));
    };

    // A lost or invented [[F#]] token means a formula would vanish — retry alone, then fall back to unmasked text
    const settle = async (outcomes) => {
      for (const { item, text, complete } of outcomes) {
        if (complete) {
          results[item.originalIndex] = text;
          continue;
        }

        console.warn(`[translate-text] Formula tokens lost in block ${item.originalIndex + 1}; retrying it alone.`);
        const [retry] = await translateAndRestore([item]);
        if (retry.complete) {
          results[item.originalIndex] = retry.text;
          continue;
        }

        console.warn(`[translate-text] Retry lost formula tokens again; translating block ${item.originalIndex + 1} unmasked.`);
        const [unmasked] = await translateBatch({
          model,
          batch: [{ ...item, text: item.source }],
          targetLanguageName,
          subject,
          generationConfig,
        });
        results[item.originalIndex] = normaliseLatexBackslashes(unmasked ?? '', item.source);
      }
    };

    try {
      for (const batch of batches) {
        let outcomes;
        try {
          outcomes = await translateAndRestore(batch);
        } catch (error) {
          if (batch.length > 1 && isBatchSplittableError(error)) {
            outcomes = [];
            for (const item of batch) {
              try {
                outcomes.push(...(await translateAndRestore([item])));
              } catch (singleError) {
                throw classifyGeminiError(singleError);
              }
            }
          } else {
            throw classifyGeminiError(error);
          }
        }

        try {
          await settle(outcomes);
        } catch (error) {
          throw classifyGeminiError(error);
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
    async translateTexts({ texts, targetLanguage, modelFamily = 'gemini', subject = 'auto' }) {
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
        modelFamily,
        subject: resolveSubject(subject),
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


