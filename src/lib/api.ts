export const getApiUrl = (): string => {
  return import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
};

export interface EnhanceImageRequest {
  image: string;
  mode: string;
  intensity: string;
}

export interface EnhanceImageResponse {
  enhancedImage?: string;
  mode?: string;
  message?: string;
  analysis?: string;
  error?: string;
}

export interface TranslateTextRequest {
  texts: string[];
  targetLanguage: string;
}

export interface TranslateTextResponse {
  translations?: string[];
  message?: string;
  error?: string;
}

export interface TranslateImageRequest {
  image: string;
  targetLanguage: string;
  translatedTexts?: Array<{
    original: string;
    translated: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  correctedTexts?: string[];
  quality?: "standard" | "premium" | "ultra";
  fontMatching?: "auto" | "preserve" | "native";
  textStyle?: "exact" | "natural" | "adaptive";
  preserveFormatting?: boolean;
  enhanceReadability?: boolean;
}

export interface TranslateImageResponse {
  translatedImage?: string;
  targetLanguage?: string;
  message?: string;
  analysis?: string;
  error?: string;
}

export interface DetectTextRequest {
  image: string;
  model?: string; // Optional: specify model to use
}

export interface DetectedTextItem {
  id: string;
  text: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DetectTextResponse {
  detectedTexts?: DetectedTextItem[];
  message?: string;
  error?: string;
}

export const enhanceImage = async (request: EnhanceImageRequest): Promise<EnhanceImageResponse> => {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/enhance-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to process image. Error: ${response.status}`);
  }

  return await response.json();
};

export const translateImage = async (request: TranslateImageRequest): Promise<TranslateImageResponse> => {
  const API_URL = getApiUrl();
  const url = `${API_URL}/api/translate-image`;
  
  console.log('translateImage: Making request to:', url);
  console.log('translateImage: Request method: POST');
  console.log('translateImage: Request body size:', JSON.stringify(request).length, 'bytes');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    console.log('translateImage: Response status:', response.status);
    console.log('translateImage: Response ok:', response.ok);

    if (!response.ok) {
      let errorMessage = `Failed to translate image. Status: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        console.error('translateImage: Error data:', errorData);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        try {
          const errorText = await response.text();
          console.error('translateImage: Error text:', errorText);
          errorMessage = errorText || errorMessage;
        } catch (textError) {
          console.error('translateImage: Could not read error response');
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('translateImage: Success, received data');
    return data;
  } catch (error) {
    console.error('translateImage: Fetch error:', error);
    if (error instanceof Error) {
      // Check if it's a network error
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Network error: Could not reach the server. Please check your connection and try again.');
      }
      throw error;
    }
    throw new Error(`Failed to translate image: ${String(error)}`);
  }
};

export const detectText = async (request: DetectTextRequest): Promise<DetectTextResponse> => {
  const API_URL = getApiUrl();
  const url = `${API_URL}/api/detect-text`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      let errorMessage = `Failed to detect text. Status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to detect text: ${String(error)}`);
  }
};

export const translateText = async (request: TranslateTextRequest): Promise<TranslateTextResponse> => {
  const API_URL = getApiUrl();
  const url = `${API_URL}/api/translate-text`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      let errorMessage = `Failed to translate text. Status: ${response.status}`;
      try {
        const errorData = await response.json();
        const details = [errorData.error, errorData.details, errorData.instructions]
          .filter((value) => typeof value === 'string' && value.trim().length > 0)
          .join(' - ');
        if (details.length > 0) {
          errorMessage = details;
        }
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to translate text: ${String(error)}`);
  }
};

