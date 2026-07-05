import '../server/load-env.js';
import { validateAiConfig, classifyAiError } from '../server/lib/ai-provider.js';
import { saveUploadedImage } from './lib/blob-storage.js';
import { renderTranslatedImage } from '../server/lib/translate-image-render.js';
import { getLanguageName, normaliseTextPairs } from '../server/lib/normalise-text-pairs.js';

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
    } = req.body ?? {};

    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'No image provided' });
      return;
    }

    const textPairs = normaliseTextPairs(translatedTexts);
    const targetLangName = getLanguageName(targetLanguage);

    try {
      await saveUploadedImage(image, 'translation', {
        targetLanguage,
        quality,
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
      quality,
    });

    try {
      const result = await renderTranslatedImage({
        image,
        textPairs,
        targetLanguage,
        targetLangName,
        quality,
        correctedTexts,
      });

      if (result.method !== 'ai-image' || !result.translatedImage) {
        res.status(422).json({
          error: result.message || 'Could not replace text on image',
          method: result.method,
        });
        return;
      }

      res.json({
        translatedImage: result.translatedImage,
        message: result.message,
        targetLanguage: targetLangName,
        method: result.method,
        appliedCount: result.appliedCount,
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
