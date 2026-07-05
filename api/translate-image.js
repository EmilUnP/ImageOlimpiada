import { createGenerativeAI, validateAiConfig, classifyAiError, DEFAULT_IMAGE_MODEL } from '../server/lib/ai-provider.js';
import { saveUploadedImage } from './lib/blob-storage.js';
import { applyTextOverlaysToImage } from '../server/lib/local-image-translation.js';
import { buildTextbookImageTranslationPrompt } from '../server/lib/textbook-prompts.js';

const LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Russian',
  az: 'Azerbaijani',
};

const extractMimeType = (base64Image, fallback = 'image/jpeg') => {
  if (typeof base64Image !== 'string') return fallback;
  const match = base64Image.match(/data:image\/([^;]+);base64,/i);
  return match ? `image/${match[1]}` : fallback;
};

const extractBase64Data = (base64Image) => {
  if (typeof base64Image !== 'string') return '';
  const parts = base64Image.split(',');
  return parts.length > 1 ? parts[1] : parts[0];
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

      return {
        original,
        translated,
        boundingBox,
      };
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

    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const prompt = buildTextbookImageTranslationPrompt({
      textPairs,
      correctedTexts,
      targetLangName,
      quality,
      fontMatching,
      textStyle,
      preserveFormatting,
      enhanceReadability,
    });

    console.log('translate-image: Prepared translation request', {
      targetLanguage: targetLangName,
      textPairs: textPairs.length,
      correctedTexts: Array.isArray(correctedTexts) ? correctedTexts.length : 0,
      quality,
      fontMatching,
      textStyle,
      preserveFormatting,
      enhanceReadability,
    });

    const genAI = createGenerativeAI();
    const model = genAI.getGenerativeModel({ model: DEFAULT_IMAGE_MODEL });

    const mimeType = extractMimeType(image);
    const base64Data = extractBase64Data(image);

    try {
      const result = await model.generateContent([prompt, { inlineData: { data: base64Data, mimeType } }]);
      const response = await result.response;

      let translatedImageBase64 = null;

      if (response.candidates && response.candidates[0]) {
        const parts = response.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            translatedImageBase64 = part.inlineData.data;
            break;
          }
        }
      }

      if (!translatedImageBase64 && textPairs.length > 0) {
        console.warn('translate-image: Gemini did not return an image. Attempting fallback overlay renderer.');
        try {
          const fallbackImage = await applyTextOverlaysToImage(image, textPairs);
          if (fallbackImage) {
            res.json({
              translatedImage: fallbackImage,
              message: `Applied ${textPairs.length} translation(s) using fallback renderer.`,
              targetLanguage: targetLangName,
              fallback: true,
            });
            return;
          }
        } catch (fallbackError) {
          console.error('translate-image: Fallback renderer failed:', fallbackError);
        }
      }

      if (translatedImageBase64) {
        res.json({
          translatedImage: `data:${mimeType};base64,${translatedImageBase64}`,
          message: `Image text translated successfully to ${targetLangName}.`,
          targetLanguage: targetLangName,
        });
        return;
      }

      const analysis = response.text();
      res.json({
        translatedImage: image,
        analysis,
        message: 'Translation processed. Gemini returned analysis instead of an edited image.',
        targetLanguage: targetLangName,
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
