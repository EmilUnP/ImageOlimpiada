import { createGenerativeAI, validateAiConfig } from '../server/lib/ai-provider.js';
import {
  createTextTranslationService,
  TranslationServiceError,
  classifyGeminiError,
} from '../server/lib/text-translation.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { texts, targetLanguage = 'en' } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'No texts provided' });
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    const genAI = createGenerativeAI();
    const translator = createTextTranslationService(genAI);
    const { translations, sanitizedCount, targetLanguageName } = await translator.translateTexts({
      texts,
      targetLanguage,
    });

    if (sanitizedCount === 0) {
      return res.status(200).json({
        translations,
        message: 'No valid text content received for translation',
      });
    }

    return res.status(200).json({
      translations,
      message: `Translated ${sanitizedCount} text(s) to ${targetLanguageName}`,
    });
  } catch (error) {
    const handledError = error instanceof TranslationServiceError ? error : classifyGeminiError(error);
    console.error('Translation error:', error);

    return res.status(handledError.statusCode).json({
      error: handledError.message,
      details: handledError.details || error.message || 'Unknown error',
    });
  }
}
