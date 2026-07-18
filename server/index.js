#!/usr/bin/env node

import './load-env.js';

import express from 'express';
import cors from 'cors';
import {
  createGenerativeAI,
  generateWithProviderFallback,
  getDefaultVisionModel,
  getEnhanceImageModel,
  getPreferredVisionModels,
  isModelNotFoundError,
  validateAiConfig,
  classifyAiError,
  resolveAiProvider,
  logActiveModelConfig,
  resolveModelFamily,
  getPublicAiConfig,
} from './lib/ai-provider.js';
import {
  createTextTranslationService,
  TranslationServiceError,
  classifyGeminiError,
} from './lib/text-translation.js';
import { renderTranslatedImage } from './lib/translate-image-render.js';
import { getLanguageName, normaliseTextPairs } from './lib/normalise-text-pairs.js';
import { enhancementPrompts, getEnhancementModesList, buildEnhancementPrompt } from './lib/enhancement-modes.js';
import { TEXTBOOK_OCR_PROMPT } from './lib/textbook-prompts.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Image Optimizer AI Backend is running!' });
});

// Get available enhancement modes
app.get('/api/enhancement-modes', (req, res) => {
  res.json({ modes: getEnhancementModesList() });
});

app.get('/api/ai-config', (req, res) => {
  const provider = resolveAiProvider();
  res.json(getPublicAiConfig(provider));
});

// Image enhancement endpoint
app.post('/api/enhance-image', async (req, res) => {
  try {
    const { image, mode = 'textbook', intensity = 'medium', modelFamily } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    // Validate mode
    const validMode = enhancementPrompts[mode] ? mode : 'photo';
    const prompt = buildEnhancementPrompt(validMode, intensity);

    try {
      let mimeType = "image/jpeg";
      if (image.includes('data:image/')) {
        const mimeMatch = image.match(/data:image\/([^;]+)/);
        if (mimeMatch) {
          mimeType = `image/${mimeMatch[1]}`;
        }
      }

      const base64Data = image.split(',')[1] || image;
      const family = resolveModelFamily(modelFamily);
      const result = await generateWithProviderFallback({
        model: getEnhanceImageModel(undefined, family),
        parts: [
          prompt,
          { inlineData: { data: base64Data, mimeType } },
        ],
        modelFamily: family,
        purpose: 'enhance',
      });

      const response = await result.response;
      
      // Try to get image from response
      let enhancedImageBase64 = null;
      
      if (response.candidates && response.candidates[0]) {
        const parts = response.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            enhancedImageBase64 = part.inlineData.data;
            break;
          }
        }
      }
      
      // If enhanced image is returned, use it
      if (enhancedImageBase64) {
        return res.json({ 
          enhancedImage: `data:${mimeType};base64,${enhancedImageBase64}`,
          message: `Image enhanced successfully using ${validMode} mode.`,
          mode: validMode
        });
      } else {
        // Return original image with analysis
        const text = response.text();
        return res.json({ 
          enhancedImage: image,
          analysis: text,
          message: `Image processed using ${validMode} mode. Note: Gemini provides analysis, not enhanced images.`,
          mode: validMode
        });
      }

    } catch (error) {
      console.error('AI API error:', error);
      const aiError = classifyAiError(error);
      return res.status(aiError.status).json({
        error: aiError.message,
        message: aiError.message,
        details: aiError.details,
        retryAfter: aiError.retryAfter,
      });
    }

  } catch (error) {
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message || 'Unknown error'
    });
  }
});

// Text detection endpoint
app.post('/api/detect-text', async (req, res) => {
  try {
    const { image, model: requestedModel, modelFamily } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    const family = resolveModelFamily(modelFamily);
    const provider = resolveAiProvider();
    const availableModels = getPreferredVisionModels(family, provider);
    const configuredVisionModel = process.env.GEMINI_VISION_MODEL?.trim();

    const modelName =
      requestedModel && availableModels.includes(requestedModel)
        ? requestedModel
        : getDefaultVisionModel(provider, family);

    const prompt = TEXTBOOK_OCR_PROMPT;

    // Initialize Google Generative AI
    const genAI = createGenerativeAI();
    // Note: getGenerativeModel doesn't validate the model until generateContent is called
    // So we'll handle model errors in the API call catch block
    const model = genAI.getGenerativeModel({ model: modelName });
    let actualModelName = modelName;
    console.log(`Attempting to use model: ${modelName} for text detection`);

    try {
      // Determine MIME type from base64 string
      let mimeType = "image/jpeg";
      if (image.includes('data:image/')) {
        const mimeMatch = image.match(/data:image\/([^;]+)/);
        if (mimeMatch) {
          mimeType = `image/${mimeMatch[1]}`;
        }
      }
      
      const base64Data = image.split(',')[1] || image;
      
      // Use generation config for better JSON output
      const generationConfig = {
        temperature: 0.1, // Low temperature for more deterministic, accurate text detection
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      };
      
      let result;
      let response;
      let text;
      
      try {
        result = await model.generateContent(
          [
            prompt,
            { inlineData: { data: base64Data, mimeType } }
          ],
          { generationConfig }
        );
        response = await result.response;
        text = response.text();
      } catch (apiError) {
        if (isModelNotFoundError(apiError)) {
          console.warn(`Model ${actualModelName} failed:`, apiError.message);

          for (const fallbackName of availableModels.filter((m) => m !== actualModelName)) {
            try {
              const fallbackModel = genAI.getGenerativeModel({ model: fallbackName });
              result = await fallbackModel.generateContent(
                [prompt, { inlineData: { data: base64Data, mimeType } }],
                { generationConfig }
              );
              response = await result.response;
              text = response.text();
              actualModelName = fallbackName;
              console.log(`Successfully used fallback model: ${fallbackName}`);
              if (configuredVisionModel && fallbackName !== configuredVisionModel) {
                console.warn(
                  `[detect-text] ⚠️  Fell back from GEMINI_VISION_MODEL="${configuredVisionModel}" to "${fallbackName}"`
                );
              }
              break;
            } catch (fallbackError) {
              console.warn(`Fallback ${fallbackName} failed:`, fallbackError.message);
            }
          }

          if (!text) throw apiError;
        } else {
          throw apiError;
        }
      }
      
      // Try to parse JSON from response with multiple strategies
      let detectedTexts = [];
      try {
        // Strategy 1: Extract JSON from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (jsonMatch) {
          detectedTexts = JSON.parse(jsonMatch[1]);
        } else {
          // Strategy 2: Find JSON array in the text
          const arrayMatch = text.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            detectedTexts = JSON.parse(arrayMatch[0]);
          } else {
            // Strategy 3: Try parsing the entire response as JSON
            detectedTexts = JSON.parse(text.trim());
          }
        }
      } catch (parseError) {
        console.warn('JSON parsing failed, attempting fallback extraction:', parseError.message);
        // Fallback: Try to extract structured data from text response
        // Look for patterns like: "text": "...", "confidence": ...
        try {
          const textMatches = Array.from(text.matchAll(/"text"\s*:\s*"([^"]+)"/g));
          const confidenceMatches = Array.from(text.matchAll(/"confidence"\s*:\s*([\d.]+)/g));
          
          const texts = textMatches.map(m => m[1]);
          const confidences = confidenceMatches.map(m => parseFloat(m[1]));
          
          if (texts.length > 0) {
            detectedTexts = texts.map((text, index) => ({
              text: text,
              confidence: confidences[index] || 0.7,
            }));
          } else {
            // Last resort: Split by lines and create basic text blocks
            const lines = text.split('\n')
              .filter(line => line.trim().length > 0)
              .filter(line => !line.match(/^[\[\]{}",\s]*$/)) // Filter out JSON structure lines
              .slice(0, 50); // Limit to 50 lines
            
            detectedTexts = lines.map((line, index) => ({
              id: `text-${index + 1}`,
              text: line.trim().replace(/^["']|["']$/g, ''), // Remove quotes
              confidence: 0.7,
            }));
          }
        } catch (fallbackError) {
          console.error('Fallback extraction also failed:', fallbackError);
          detectedTexts = [];
        }
      }

      // Ensure we have an array with proper structure
      if (!Array.isArray(detectedTexts)) {
        detectedTexts = [];
      }

      // Add IDs and ensure proper structure
      detectedTexts = detectedTexts.map((item, index) => ({
        id: item.id || `text-${index + 1}`,
        text: item.text || String(item),
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
        boundingBox: item.boundingBox || undefined,
      }));

            return res.json({ 
              detectedTexts,
              message: `Detected ${detectedTexts.length} text block(s) using ${actualModelName}`,
              model: actualModelName,
            });

    } catch (error) {
      console.error('Gemini API error:', error);
      return res.status(500).json({ 
        error: 'Failed to detect text in image',
        details: error.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Text detection error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
});

// Text translation endpoint (translates text only, not images)
app.post('/api/translate-text', async (req, res) => {
  try {
    const { texts, targetLanguage = 'en', modelFamily } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'No texts provided' });
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    const genAI = createGenerativeAI();
    const translator = createTextTranslationService(genAI);

    try {
      const { translations, sanitizedCount, targetLanguageName } = await translator.translateTexts({
        texts,
        targetLanguage,
        modelFamily: resolveModelFamily(modelFamily),
      });

      if (sanitizedCount === 0) {
        return res.json({
          translations,
          message: 'No valid text content received for translation',
        });
      }

      return res.json({
        translations,
        message: `Translated ${sanitizedCount} text(s) to ${targetLanguageName}`,
      });
    } catch (error) {
      const handledError = error instanceof TranslationServiceError ? error : classifyGeminiError(error);
      console.error('Gemini API error:', error);
      return res.status(handledError.statusCode).json({
        error: handledError.message,
        details: handledError.details || error.message || 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Text translation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message || 'Unknown error',
    });
  }
});

// Image text translation endpoint
app.post('/api/translate-image', async (req, res) => {
  try {
    const {
      image,
      targetLanguage = 'en',
      translatedTexts: translatedTextPairs,
      correctedTexts,
      quality = 'premium',
      modelFamily,
    } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    const targetLangName = getLanguageName(targetLanguage);
    const textPairs = normaliseTextPairs(translatedTextPairs);

    try {
      const result = await renderTranslatedImage({
        image,
        textPairs,
        targetLanguage,
        targetLangName,
        quality,
        correctedTexts,
        modelFamily: resolveModelFamily(modelFamily),
      });

      if (result.method !== 'ai-image' || !result.translatedImage) {
        return res.status(422).json({
          error: result.message || 'Could not replace text on image',
          method: result.method,
        });
      }

      return res.json({
        translatedImage: result.translatedImage,
        message: result.message,
        targetLanguage: targetLangName,
        method: result.method,
        appliedCount: result.appliedCount,
      });
    } catch (error) {
      console.error('AI API error:', error);
      const aiError = classifyAiError(error);
      return res.status(aiError.status).json({
        error: aiError.message,
        message: aiError.message,
        details: aiError.details,
        retryAfter: aiError.retryAfter,
      });
    }

  } catch (error) {
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message || 'Unknown error'
    });
  }
});

app.listen(PORT, () => {
  logActiveModelConfig();
  const provider = resolveAiProvider();
  console.log(`Backend running at http://localhost:${PORT} (${provider})`);
  console.log(`Frontend: http://localhost:8080`);
});
