export const getApiUrl = (): string => {
  // In dev, use same origin so Vite proxies /api → localhost:3001
  return import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');
};

const wrapNetworkError = (error: unknown, action: string): Error => {
  if (error instanceof TypeError && /fetch|network|failed/i.test(error.message)) {
    return new Error(
      `Cannot reach the API server. Run "npm run dev" (starts frontend + backend) or "npm run dev:backend" in a separate terminal.`
    );
  }
  if (error instanceof Error) return error;
  return new Error(`${action}: ${String(error)}`);
};

/**
 * Error text from a failed response. Our API answers with JSON, but Vercel's own
 * timeout / payload errors come back as plain text.
 */
const readErrorMessage = async (
  response: Response,
  fallback: string,
  fields: string[] = ['error'],
): Promise<string> => {
  const body = await response.text().catch(() => '');
  try {
    const data = JSON.parse(body);
    const message = fields
      .map((field) => data?.[field])
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(' - ');
    if (message) return message;
  } catch {
    // not JSON — fall through to the status-based messages
  }

  if (response.status === 504) {
    return 'The AI took too long to answer and the server stopped waiting. Please try again — a smaller or cropped image is faster.';
  }
  if (response.status === 413) {
    return 'Image is too large to upload (server limit is about 4.5 MB). Please use a smaller image.';
  }
  return body.trim().slice(0, 300) || fallback;
};

export type ModelFamily = "gemini" | "openai";

/** Steers OCR, translation and render rules for formulas and terminology */
export type Subject = "auto" | "math" | "physics" | "chemistry" | "biology" | "general";

export interface AiConfigResponse {
  provider: "gemini" | "openrouter";
  configuredProvider?: "gemini" | "openrouter";
  showModelFamilySelector: boolean;
  modelFamilies: Array<{ id: ModelFamily; label: string }>;
  defaultModelFamily: ModelFamily;
  /** Translation always uses this family — set by TRANSLATION_MODEL_FAMILY in .env */
  translationModelLabel?: string;
}

export const fetchAiConfig = async (): Promise<AiConfigResponse> => {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/ai-config`);
  if (!response.ok) {
    throw new Error("Failed to load AI configuration");
  }
  return response.json();
};

export interface EnhanceImageRequest {
  image: string;
  mode: string;
  intensity: string;
  modelFamily?: ModelFamily;
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
  subject?: Subject;
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
  }>;
  correctedTexts?: string[];
  subject?: Subject;
}

export interface TranslateImageResponse {
  translatedImage?: string;
  targetLanguage?: string;
  message?: string;
  analysis?: string;
  method?: 'ai-image' | 'unchanged' | 'none';
  /** Set when the result was returned but may not match the original perfectly */
  warning?: string;
  appliedCount?: number;
  error?: string;
}

export interface DetectTextRequest {
  image: string;
  model?: string;
  subject?: Subject;
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
  try {
    const response = await fetch(`${API_URL}/api/enhance-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Failed to process image. Error: ${response.status}`));
    }

    return await response.json();
  } catch (error) {
    throw wrapNetworkError(error, 'Failed to enhance image');
  }
};

export const translateImage = async (request: TranslateImageRequest): Promise<TranslateImageResponse> => {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/translate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to translate image. Status: ${response.status} ${response.statusText}`)
    );
  }

  return await response.json();
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
      throw new Error(await readErrorMessage(response, `Failed to detect text. Status: ${response.status}`));
    }

    return await response.json();
  } catch (error) {
    throw wrapNetworkError(error, 'Failed to detect text');
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
      throw new Error(
        await readErrorMessage(response, `Failed to translate text. Status: ${response.status}`, [
          'error',
          'details',
          'instructions',
        ])
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to translate text: ${String(error)}`);
  }
};

