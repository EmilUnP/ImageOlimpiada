import { generateWithProviderFallback, getModelsFor } from './ai-provider.js';
import { buildImageTextReplacementPrompt } from './textbook-prompts.js';
import { resolveSubject } from './subject-rules.js';
import { normaliseForCompare } from './formula-utils.js';
import { prepareForImageEdit, mergeEditedImage } from './image-fidelity.js';

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
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || mimeType };
    }
  }
  return null;
};

/**
 * Replace text on a scanned image using the AI image model.
 * The model must erase original text and render exact translations in the same style — no overlays.
 * Its answer is then merged back onto the original so only the replaced text regions change.
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

  // Padding / merge need a decodable image; without it the model output is returned as before
  let prepared = null;
  try {
    prepared = await prepareForImageEdit({ data, mimeType });
  } catch (error) {
    console.warn('[translate-image] Could not prepare image for the fidelity merge — sending it unchanged:', error.message);
  }

  const resolvedSubject = resolveSubject(subject);
  const prompt = buildImageTextReplacementPrompt({
    textPairs: pairs,
    protectedTexts,
    correctedTexts,
    targetLangName: targetLangName || targetLanguage,
    subject: resolvedSubject,
    paddedCanvas: Boolean(prepared?.layout.padded),
  });

  console.log('[translate-image]', {
    models: getModelsFor('image', modelFamily),
    replacements: pairs.length,
    protectedFormulas: protectedTexts.length,
    subject: resolvedSubject,
    targetLanguage,
    canvas: prepared ? `${prepared.layout.canvasWidth}x${prepared.layout.canvasHeight}` : 'original',
  });

  const result = await generateWithProviderFallback({
    parts: [prompt, { inlineData: prepared ? { data: prepared.data, mimeType: prepared.mimeType } : { data, mimeType } }],
    modelFamily,
  });

  const response = await result.response;
  const edited = extractImageFromResponse(response, mimeType);

  if (!edited) {
    console.warn('[translate-image] Model returned no image output');
    return {
      translatedImage: null,
      method: 'none',
      message: 'Image model did not return an edited image. Try again or check GEMINI_IMAGE_MODEL in .env.',
    };
  }

  const message = `Text replaced on image (${targetLangName || targetLanguage}).`;
  const appliedCount = pairs.length || correctedTexts?.length || 0;

  if (prepared) {
    try {
      const merged = await mergeEditedImage({ prepared, editedData: edited.data });
      console.log('[translate-image] Done — merged text edits onto the original', merged.stats);
      return {
        translatedImage: merged.dataUrl,
        method: 'ai-image',
        message,
        warning: merged.warning,
        appliedCount,
      };
    } catch (error) {
      console.error('[translate-image] Fidelity merge failed — returning the raw model output:', error);
    }
  }

  return {
    translatedImage: `data:${edited.mimeType};base64,${edited.data}`,
    method: 'ai-image',
    message,
    warning: prepared
      ? 'Could not merge the edit onto the original, so the raw model output is shown — it may differ from the original outside the text.'
      : undefined,
    appliedCount,
  };
}
