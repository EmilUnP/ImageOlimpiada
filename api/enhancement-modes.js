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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const modes = Object.keys(enhancementPrompts).map(key => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      description: enhancementPrompts[key].description
    }));
    
    return res.status(200).json({ modes });
  } catch (error) {
    console.error('Error fetching enhancement modes:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

