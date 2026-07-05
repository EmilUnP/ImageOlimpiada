import { saveUploadedImage } from './lib/blob-storage.js';
import { createGenerativeAI, validateAiConfig, classifyAiError, DEFAULT_IMAGE_MODEL } from '../server/lib/ai-provider.js';

// Enhancement mode prompts
const enhancementPrompts = {
  document: {
    prompt: `Enhance this document image to high quality. Remove noise, yellowing, and scanning artifacts. Sharpen text edges, improve contrast between text and background, correct perspective, and make it crystal clear while preserving all original content, layout, and formatting. Output a professional, clean document image.`,
    description: "Perfect for scanned documents, receipts, and text-based images"
  },
  photo: {
    prompt: `Enhance this photograph to high quality. Improve sharpness, reduce noise and grain, enhance colors and contrast naturally, correct exposure, and bring out fine details. Maintain natural skin tones and realistic colors. Output a professional, vibrant photo without over-processing.`,
    description: "Enhance general photographs with natural, professional results"
  },
  portrait: {
    prompt: `Enhance this portrait photo to high quality. Improve skin texture naturally, reduce noise, enhance eye clarity and detail, improve lighting balance, and bring out natural colors. Maintain realistic skin tones and avoid over-smoothing. Output a professional portrait with natural beauty.`,
    description: "Optimized for portraits and people photos"
  },
  lowlight: {
    prompt: `Enhance this low-light image to high quality. Brighten the image naturally, reduce noise and grain, improve visibility of dark areas, enhance details in shadows, and correct color balance. Maintain realistic lighting without creating artifacts. Output a clear, well-lit image.`,
    description: "Brighten and enhance dark or low-light images"
  },
  art: {
    prompt: `Enhance this artwork or illustration to high quality. Preserve artistic style and colors, reduce noise and compression artifacts, sharpen fine details, improve color vibrancy, and enhance overall clarity. Maintain the original artistic intent and aesthetic. Output a high-quality digital art piece.`,
    description: "Enhance artwork, illustrations, and digital art"
  },
  old: {
    prompt: `Restore and enhance this old or vintage image to high quality. Remove scratches, dust, and age-related damage. Reduce yellowing and fading, restore natural colors, improve contrast, and sharpen details. Preserve the vintage character while making it look professionally restored. Output a restored, high-quality image.`,
    description: "Restore old photos and vintage images"
  },
  landscape: {
    prompt: `Enhance this landscape image to high quality. Improve overall sharpness, enhance natural colors and saturation, improve sky and foreground contrast, reduce haze, and bring out fine details in both near and far objects. Maintain realistic natural beauty. Output a stunning, vibrant landscape photo.`,
    description: "Enhance landscape and nature photography"
  },
  product: {
    prompt: `Enhance this product image to high quality. Improve sharpness and clarity, enhance colors accurately, remove background noise, improve lighting balance, and make the product stand out professionally. Maintain accurate color representation for e-commerce. Output a professional product photo.`,
    description: "Perfect for product photography and e-commerce"
  }
};

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
    const { image, mode = 'photo', intensity = 'medium' } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Save uploaded image for analysis
    try {
      await saveUploadedImage(image, 'enhancement', {
        mode,
        intensity,
        type: 'enhancement',
        endpoint: '/api/enhance-image'
      });
    } catch (saveError) {
      // Don't fail the request if saving fails, just log it
      console.error('Error saving uploaded image:', saveError);
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    // Validate mode
    const validMode = enhancementPrompts[mode] ? mode : 'photo';
    const enhancementConfig = enhancementPrompts[validMode];

    // Adjust prompt based on intensity
    let intensityModifier = '';
    if (intensity === 'low') {
      intensityModifier = ' Apply subtle enhancements only.';
    } else if (intensity === 'high') {
      intensityModifier = ' Apply aggressive enhancements for maximum quality improvement.';
    } else {
      intensityModifier = ' Apply balanced, moderate enhancements.';
    }

    const prompt = enhancementConfig.prompt + intensityModifier;

    const genAI = createGenerativeAI();
    const model = genAI.getGenerativeModel({ model: DEFAULT_IMAGE_MODEL });

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
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType } }
      ]);

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
        return res.status(200).json({ 
          enhancedImage: `data:${mimeType};base64,${enhancedImageBase64}`,
          message: `Image enhanced successfully using ${validMode} mode.`,
          mode: validMode
        });
      } else {
        // Return original image with analysis
        const text = response.text();
        return res.status(200).json({ 
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
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message || 'Unknown error'
    });
  }
}

