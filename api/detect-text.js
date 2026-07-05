import { createGenerativeAI, validateAiConfig, classifyAiError, DEFAULT_IMAGE_MODEL } from '../server/lib/ai-provider.js';
import { saveUploadedImage } from './lib/blob-storage.js';

const AVAILABLE_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-3-pro-image-preview',
  'gemini-2.0-flash',
];

const FALLBACK_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const GENERATION_CONFIG = {
  temperature: 0.1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

const TEXT_DETECTION_PROMPT = `You are an expert OCR (Optical Character Recognition) specialist. Analyze this image and detect ALL text content with maximum accuracy.

CRITICAL REQUIREMENTS:
1. Detect EVERY piece of text in the image, including:
   - Headers, titles, subtitles
   - Body text, paragraphs, sentences
   - Labels, captions, annotations
   - Buttons, menus, navigation text
   - Watermarks or copyright notices
   - Numbers, dates, prices, codes
   - Text in multiple languages, fonts, sizes, or orientations
2. For each text block, provide:
   - The EXACT text content as it appears (preserve casing, punctuation, spacing)
   - A confidence score between 0.0 and 1.0
   - Bounding box coordinates if possible (x, y, width, height in pixels)
3. Return ONLY valid JSON using this exact structure:
[
  {
    "id": "text-1",
    "text": "exact text content here",
    "confidence": 0.95,
    "boundingBox": {
      "x": 100,
      "y": 50,
      "width": 200,
      "height": 30
    }
  }
]

IMPORTANT:
- Return only JSON. No markdown, commentary, or extra text.
- If bounding boxes are unavailable, omit the "boundingBox" field entirely.
- Order results in natural reading order.`;

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

const parseDetectedTexts = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return [];

  const codeBlockMatch = rawText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i);
  const arrayMatch = rawText.match(/\[[\s\S]*\]/);
  let jsonToParse = null;

  if (codeBlockMatch) {
    jsonToParse = codeBlockMatch[1];
  } else if (arrayMatch) {
    jsonToParse = arrayMatch[0];
  }

  let parsed = [];
  if (jsonToParse) {
    try {
      parsed = JSON.parse(jsonToParse);
    } catch (error) {
      console.warn('Failed to parse JSON array from Gemini response. Falling back to heuristic parsing.', error);
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    const textMatches = [...rawText.matchAll(/"text"\s*:\s*"([^"]+)"/g)];
    if (textMatches.length > 0) {
      parsed = textMatches.map((match, index) => ({
        id: `text-${index + 1}`,
        text: match[1],
        confidence: 0.7,
      }));
    } else {
      const lines = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !/^[\[\]{}",]*$/.test(line))
        .slice(0, 50);

      parsed = lines.map((line, index) => ({
        id: `text-${index + 1}`,
        text: line.replace(/^["']|["']$/g, ''),
        confidence: 0.7,
      }));
    }
  }

  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.length > 0 ? item.id : `text-${index + 1}`,
      text: typeof item.text === 'string' ? item.text : '',
      confidence:
        typeof item.confidence === 'number' && Number.isFinite(item.confidence)
          ? Math.max(0, Math.min(1, item.confidence))
          : 0.7,
      boundingBox:
        item.boundingBox &&
        typeof item.boundingBox === 'object' &&
        ['x', 'y', 'width', 'height'].every((key) => typeof item.boundingBox[key] === 'number')
          ? {
              x: item.boundingBox.x,
              y: item.boundingBox.y,
              width: item.boundingBox.width,
              height: item.boundingBox.height,
            }
          : undefined,
    }))
    .filter((item) => item.text && item.text.trim().length > 0);
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
    const { image, model: requestedModel } = req.body ?? {};

    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'No image provided' });
      return;
    }

    try {
      await saveUploadedImage(image, 'translation', {
        model: requestedModel || 'default',
        type: 'translation',
        stage: 'text-detection',
        endpoint: '/api/detect-text',
      });
    } catch (saveError) {
      console.error('Error saving uploaded image for analysis:', saveError);
    }

    const configError = validateAiConfig();
    if (configError) {
      res.status(configError.status).json(configError.body);
      return;
    }

    const preferredModel =
      requestedModel && AVAILABLE_MODELS.includes(requestedModel) ? requestedModel : AVAILABLE_MODELS[0];

    const genAI = createGenerativeAI();
    const triedModels = new Set();
    let usedModel = preferredModel;
    let responseText = null;
    let lastError = null;

    const mimeType = extractMimeType(image);
    const base64Data = extractBase64Data(image);

    const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter((model) => model !== preferredModel)];

    for (const modelName of modelsToTry) {
      if (triedModels.has(modelName)) continue;
      triedModels.add(modelName);

      try {
        console.log(`[api/detect-text] Attempting Gemini model "${modelName}"`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(
          [
            TEXT_DETECTION_PROMPT,
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
