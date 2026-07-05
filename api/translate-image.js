import { createGenerativeAI, validateAiConfig, classifyAiError, DEFAULT_IMAGE_MODEL } from '../server/lib/ai-provider.js';
import { saveUploadedImage } from './lib/blob-storage.js';
import { applyTextOverlaysToImage } from '../server/lib/local-image-translation.js';

const LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Russian',
  tr: 'Turkish',
  uk: 'Ukrainian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
};

const QUALITY_INSTRUCTIONS = {
  standard: 'Provide accurate translation with good text rendering.',
  premium:
    'Provide highly accurate translation with excellent text rendering, precise font matching, and perfect positioning. Pay extra attention to details.',
  ultra:
    'Provide perfect translation with pixel-perfect text rendering, exact font matching, perfect positioning, and flawless visual integration. Maximum attention to every detail.',
};

const FONT_INSTRUCTIONS = {
  auto: 'Intelligently match fonts that are visually similar to the original, considering the target language typography.',
  preserve: 'Preserve the exact original fonts as much as possible while adapting characters to the target language.',
  native: 'Use fonts native to the target language while maintaining visual harmony with the original design.',
};

const STYLE_INSTRUCTIONS = {
  exact: 'Preserve the exact original text style, formatting, and visual appearance.',
  natural: 'Adapt the text style to be natural and readable in the target language while maintaining visual coherence.',
  adaptive: 'Balance between preserving original style and adapting to target language conventions for optimal readability.',
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

const buildPrompt = ({
  textPairs,
  correctedTexts,
  targetLangName,
  quality,
  fontMatching,
  textStyle,
  preserveFormatting,
  enhanceReadability,
}) => {
  let prompt = `You are an expert image translation specialist. Replace ALL text in this image with professional-quality translations.\n\n`;

  if (textPairs.length > 0) {
    prompt += `CRITICAL INSTRUCTIONS – FOLLOW EXACTLY:\n`;
    prompt += `You MUST find and replace each of the following text pairs in the image:\n\n`;

    textPairs.forEach((pair, index) => {
      prompt += `${index + 1}. Find the text: "${pair.original}"\n`;
      prompt += `   Replace with: "${pair.translated}"\n`;
      if (pair.boundingBox) {
        prompt += `   Approximate bounding box: x=${Math.round(pair.boundingBox.x)}, y=${Math.round(pair.boundingBox.y)}, width=${Math.round(pair.boundingBox.width)}, height=${Math.round(pair.boundingBox.height)}\n`;
      }
      prompt += `   Maintain identical position, size, font, color, style, and visual effects.\n\n`;
    });

    prompt += `ABSOLUTE RULES:\n`;
    prompt += `- Replace ONLY the listed text entries. Do NOT translate any other content.\n`;
    prompt += `- Use the translations exactly as provided without alterations.\n`;
    prompt += `- Preserve the overall design, colors, and non-text elements exactly.\n\n`;
  } else if (Array.isArray(correctedTexts) && correctedTexts.length > 0) {
    prompt += `The user has verified the following text blocks. Translate each one to ${targetLangName} and replace it in the image:\n`;
    correctedTexts.forEach((text, index) => {
      prompt += `${index + 1}. "${text}"\n`;
    });
    prompt += `\nEnsure accurate translation while preserving text positioning and style.\n\n`;
  } else {
    prompt += `Detect EVERY piece of text in the image and translate it to ${targetLangName}. Preserve layout, style, and formatting exactly.\n\n`;
  }

  prompt += `VISUAL & QUALITY REQUIREMENTS (${quality.toUpperCase()} quality):\n`;
  prompt += `- ${QUALITY_INSTRUCTIONS[quality] || QUALITY_INSTRUCTIONS.premium}\n`;
  prompt += `- ${FONT_INSTRUCTIONS[fontMatching] || FONT_INSTRUCTIONS.auto}\n`;
  prompt += `- ${STYLE_INSTRUCTIONS[textStyle] || STYLE_INSTRUCTIONS.adaptive}\n`;
  if (preserveFormatting) {
    prompt += `- Preserve ALL formatting: bold, italic, underline, color, shadows, gradients, outlines.\n`;
  }
  if (enhanceReadability) {
    prompt += `- Ensure translated text is perfectly legible in ${targetLangName}, with optimal spacing and line breaks.\n`;
  }
  prompt += `- Maintain exact alignment, spacing, text hierarchy, and proportions.\n`;
  prompt += `- Keep the background, images, and non-text design elements untouched.\n\n`;

  prompt += `TECHNICAL OUTPUT REQUIREMENTS:\n`;
  prompt += `- Output must be a high-resolution image matching the original dimensions and quality.\n`;
  prompt += `- The only change should be the translated text. Everything else must remain identical.\n`;
  prompt += `- The final result should look as if it were originally created in ${targetLangName}.\n\n`;

  prompt += `OUTPUT: Return ONLY the translated image with all text localized to ${targetLangName}.`;

  return prompt;
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
    const prompt = buildPrompt({
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
