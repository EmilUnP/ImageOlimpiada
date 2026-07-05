import { generateWithProviderFallback, getImageModelForQuality } from './ai-provider.js';
import { buildImageTextReplacementPrompt } from './textbook-prompts.js';

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
  quality = 'premium',
  correctedTexts,
  modelFamily = 'gemini',
}) {
  const pairs = textPairs.filter((p) => p.original?.trim() && p.translated?.trim());
  const hasPairs = pairs.length > 0;
  const hasCorrected = Array.isArray(correctedTexts) && correctedTexts.length > 0;

  if (!hasPairs && !hasCorrected) {
    return {
      translatedImage: null,
      method: 'none',
      message: 'No translated text provided. Run OCR and translation first.',
    };
  }

  const imageModel = getImageModelForQuality(quality, undefined, modelFamily);
  const { mimeType, data } = parseBase64Image(image);

  if (!data) {
    return {
      translatedImage: null,
      method: 'none',
      message: 'Invalid image data.',
    };
  }

  const prompt = buildImageTextReplacementPrompt({
    textPairs: pairs,
    correctedTexts,
    targetLangName: targetLangName || targetLanguage,
  });

  console.log('[translate-image]', {
    model: imageModel,
    replacements: pairs.length,
    targetLanguage,
  });

  const result = await generateWithProviderFallback({
    model: imageModel,
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
