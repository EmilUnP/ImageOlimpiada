import { generateWithProviderFallback, getModelsFor } from './ai-provider.js';
import { buildImageTextReplacementPrompt } from './textbook-prompts.js';
import { resolveSubject } from './subject-rules.js';
import { normaliseForCompare } from './formula-utils.js';

const parseBase64Image = (base64Image) => {
  if (typeof base64Image !== 'string' || !base64Image.trim()) {
    return { mimeType: 'image/jpeg', data: '' };
  }

  const match = base64Image.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }

  const parts = base64Image.split(',');
  return { mimeType: 'image/jpeg', data: parts.length > 1 ? parts[1] : parts[0] };
};

const extractImageFromResponse = (response, mimeType) => {
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      const outMime = part.inlineData.mimeType || mimeType;
      return `data:${outMime};base64,${part.inlineData.data}`;
    }
  }
  return null;
};

/**
 * Replace text on a scanned image using the AI image model.
 * The model must erase original text and render exact translations in the same style — no overlays.
 */
export async function renderTranslatedImage({
  image,
  textPairs = [],
  targetLanguage = 'en',
  targetLangName,
  correctedTexts,
  modelFamily = 'gemini',
  subject = 'auto',
}) {
  const validPairs = textPairs.filter((p) => p.original?.trim() && p.translated?.trim());
  // Formula/number-only blocks come back unchanged — sending them as "X → X" makes the image
  // model erase and redraw them, which flattens subscripts and fractions. Protect them instead.
  const isUnchanged = (p) => normaliseForCompare(p.original) === normaliseForCompare(p.translated);
  const pairs = validPairs.filter((p) => !isUnchanged(p));
  const protectedTexts = validPairs.filter(isUnchanged).map((p) => p.original);
  const hasPairs = pairs.length > 0;
  const hasCorrected = Array.isArray(correctedTexts) && correctedTexts.length > 0;

  if (!hasPairs && !hasCorrected) {
    if (protectedTexts.length > 0) {
      return {
        translatedImage: image,
        method: 'unchanged',
        message: 'Only formulas and numbers found — nothing to replace, image kept as is.',
        appliedCount: 0,
      };
    }
    return {
      translatedImage: null,
      method: 'none',
      message: 'No translated text provided. Run OCR and translation first.',
    };
  }

  const { mimeType, data } = parseBase64Image(image);

  if (!data) {
    return {
      translatedImage: null,
      method: 'none',
      message: 'Invalid image data.',
    };
  }

  const resolvedSubject = resolveSubject(subject);
  const prompt = buildImageTextReplacementPrompt({
    textPairs: pairs,
    protectedTexts,
    correctedTexts,
    targetLangName: targetLangName || targetLanguage,
    subject: resolvedSubject,
  });

  console.log('[translate-image]', {
    models: getModelsFor('image', modelFamily),
    replacements: pairs.length,
    protectedFormulas: protectedTexts.length,
    subject: resolvedSubject,
    targetLanguage,
  });

  const result = await generateWithProviderFallback({
    parts: [prompt, { inlineData: { data, mimeType } }],
    modelFamily,
  });

  const response = await result.response;
  const translatedImage = extractImageFromResponse(response, mimeType);

  if (!translatedImage) {
    console.warn('[translate-image] Model returned no image output');
    return {
      translatedImage: null,
      method: 'none',
      message: 'Image model did not return an edited image. Try again or check GEMINI_IMAGE_MODEL in .env.',
    };
  }

  console.log('[translate-image] Done — in-place text replacement');
  return {
    translatedImage,
    method: 'ai-image',
    message: `Text replaced on image (${targetLangName || targetLanguage}).`,
    appliedCount: pairs.length || correctedTexts?.length || 0,
  };
}
