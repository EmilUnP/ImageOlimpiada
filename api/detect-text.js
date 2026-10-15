import '../server/load-env.js';
import {
  createGenerativeAI,
  validateAiConfig,
  classifyAiError,
  getModelsFor,
  getTranslationModelFamily,
} from '../server/lib/ai-provider.js';
import { buildOcrPrompt } from '../server/lib/textbook-prompts.js';
import { resolveSubject } from '../server/lib/subject-rules.js';
import { parseDetectedTexts } from '../server/lib/ocr-parse.js';

const GENERATION_CONFIG = {
  temperature: 0.1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
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
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { image, model: requestedModel, subject } = req.body ?? {};
    const modelFamily = getTranslationModelFamily();

    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'No image provided' });
      return;
    }

    const configError = validateAiConfig({ task: 'vision', modelFamily });
    if (configError) {
      res.status(configError.status).json(configError.body);
      return;
    }

    const visionModels = getModelsFor('vision', modelFamily);
    const preferredModel =
      requestedModel && visionModels.includes(requestedModel) ? requestedModel : visionModels[0];

    const prompt = buildOcrPrompt(resolveSubject(subject));
    const genAI = createGenerativeAI();
    const triedModels = new Set();
    let usedModel = preferredModel;
    let responseText = null;
    let lastError = null;

    const mimeType = extractMimeType(image);
    const base64Data = extractBase64Data(image);

    const modelsToTry = [preferredModel, ...visionModels.filter((model) => model !== preferredModel)];

    for (const modelName of modelsToTry) {
      if (triedModels.has(modelName)) continue;
      triedModels.add(modelName);

      try {
        console.log(`[api/detect-text] Attempting Gemini model "${modelName}"`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(
          [
            prompt,
            { inlineData: { data: base64Data, mimeType } },
          ],
          { generationConfig: GENERATION_CONFIG },
        );

        const response = await result.response;
        responseText = response.text();
        usedModel = modelName;

        if (typeof responseText === 'string' && responseText.trim().length > 0) {
          break;
        }

        console.warn(`[api/detect-text] Model "${modelName}" returned empty response. Trying fallback.`);
      } catch (modelError) {
        lastError = modelError;
        const message = modelError?.message || '';
        console.warn(`[api/detect-text] Gemini model "${modelName}" failed: ${message}`);

        const isNotFound = modelError?.status === 404 || message.toLowerCase().includes('not found');
        const isUnsupported = message.toLowerCase().includes('unsupported') || message.toLowerCase().includes('unknown model');

        if (!isNotFound && !isUnsupported) {
          throw modelError;
        }
      }
    }

    if (!responseText || responseText.trim().length === 0) {
      console.error('[api/detect-text] All Gemini models failed to return a response.');
      if (lastError) {
        console.error('[api/detect-text] Last encountered error:', lastError);
      }
      res.status(502).json({
        error: 'Failed to detect text in image',
        details: lastError?.message || 'No response returned from Gemini models',
      });
      return;
    }

    const detectedTexts = parseDetectedTexts(responseText);

    if (detectedTexts.length === 0) {
      console.warn('[api/detect-text] No structured text detected. Returning fallback entry.');
      detectedTexts.push({
        id: 'text-1',
        text: responseText.trim(),
        confidence: 0.6,
      });
    }

    res.status(200).json({
      detectedTexts,
      message: `Detected ${detectedTexts.length} text block(s) using ${usedModel}`,
      model: usedModel,
    });
  } catch (error) {
    console.error('Text detection error:', error);
    res.status(500).json({
      error: 'Failed to detect text in image',
      details: error?.message || 'Unknown error',
    });
  }
}
