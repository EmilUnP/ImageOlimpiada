import '../server/load-env.js';
import { validateAiConfig, classifyAiError } from '../server/lib/ai-provider.js';
import { saveUploadedImage } from './lib/blob-storage.js';
import { renderTranslatedImage } from '../server/lib/translate-image-render.js';

const LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Russian',
  az: 'Azerbaijani',
};

const normaliseTextPairs = (translatedTexts = []) => {
  if (!Array.isArray(translatedTexts) || translatedTexts.length === 0) return [];
  return translatedTexts
    .map((pair) => {
      const original = typeof pair.original === 'string' ? pair.original.trim() : '';
      const translated = typeof pair.translated === 'string' ? pair.translated.trim() : '';
      const boundingBox =
        pair.boundingBox &&
        typeof pair.boundingBox === 'object' &&
        ['x', 'y', 'width', 'height'].every((key) => typeof pair.boundingBox[key] === 'number')
          ? {
              x: pair.boundingBox.x,
              y: pair.boundingBox.y,
              width: pair.boundingBox.width,
              height: pair.boundingBox.height,
            }
          : undefined;

      if (!original || !translated) return null;

      return { original, translated, boundingBox };
    })
    .filter(Boolean);
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
      receivedMethod: req.method,
      allowedMethods: ['POST', 'OPTIONS'],
    });
    return;
  }

  try {
    const {
      image,
      targetLanguage = 'en',
      translatedTexts,
      correctedTexts,
      quality = 'premium',
      fontMatching = 'auto',
      textStyle = 'adaptive',
      preserveFormatting = true,
      enhanceReadability = true,
    } = req.body ?? {};

    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'No image provided' });
      return;
    }

    const textPairs = normaliseTextPairs(translatedTexts);
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    try {
      await saveUploadedImage(image, 'translation', {
        targetLanguage,
        quality,
        fontMatching,
        textStyle,
        preserveFormatting,
        enhanceReadability,
        translatedTextsCount: textPairs.length,
        type: 'translation',
        stage: 'image-translation',
        endpoint: '/api/translate-image',
      });
    } catch (saveError) {
      console.error('translate-image: Error saving uploaded image:', saveError);
    }

    const configError = validateAiConfig();
    if (configError) {
      res.status(configError.status).json(configError.body);
      return;
    }

    console.log('translate-image: Prepared translation request', {
      targetLanguage: targetLangName,
      textPairs: textPairs.length,
      withBoxes: textPairs.filter((p) => p.boundingBox).length,
      quality,
    });

    try {
      const result = await renderTranslatedImage({
        image,
        textPairs,
        targetLanguage,
        targetLangName,
        quality,
        fontMatching,
        textStyle,
        preserveFormatting,
        enhanceReadability,
        correctedTexts,
      });

      res.json({
        translatedImage: result.translatedImage,
        message: result.message,
        targetLanguage: targetLangName,
        method: result.method,
        appliedCount: result.appliedCount,
        skippedCount: result.skippedCount,
        analysis: result.analysis,
        fallback: false,
      });
    } catch (error) {
      console.error('translate-image: AI API error:', error);
      const aiError = classifyAiError(error);
      res.status(aiError.status).json({
        error: aiError.message,
        details: aiError.details,
      });
    }
  } catch (error) {
    console.error('translate-image: Unexpected error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error?.message || 'Unknown error',
    });
  }
}
