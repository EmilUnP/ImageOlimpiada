import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { translateImage, TranslateImageRequest, detectText, DetectTextRequest, translateText, TranslateTextRequest, type ModelFamily } from '@/lib/api';
import { useImageUpload } from './useImageUpload';
import { DetectedText, TranslatedText } from '@/lib/types';

export const useImageTranslation = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [translatedImage, setTranslatedImage] = useState<string | null>(null);
  const [detectedTexts, setDetectedTexts] = useState<DetectedText[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const { fileToBase64 } = useImageUpload();

  const detectTextInImage = useCallback(async (
    base64Image: string,
    model?: string,
    modelFamily?: ModelFamily
  ): Promise<DetectedText[]> => {
    setIsDetecting(true);
    try {
      const request: DetectTextRequest = {
        image: base64Image,
        model,
        modelFamily,
      };

      const data = await detectText(request);

      if (data?.detectedTexts && Array.isArray(data.detectedTexts)) {
        setDetectedTexts(data.detectedTexts);
        return data.detectedTexts;
      }

      toast.error("No text detected in the image");
      return [];
    } catch (error) {
      console.error('Text detection error:', error);
      toast.error("Failed to detect text. Proceeding with translation...");
      return [];
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const translateTexts = useCallback(async (
    texts: string[],
    targetLanguage: string,
    modelFamily?: ModelFamily
  ): Promise<string[]> => {
    try {
      if (!texts || texts.length === 0) {
        toast.error("No texts provided for translation");
        return [];
      }

      const request: TranslateTextRequest = { texts, targetLanguage, modelFamily };
      const data = await translateText(request);

      if (data?.translations && Array.isArray(data.translations)) {
        const hasValid = data.translations.some((t) => t && t.trim().length > 0);
        if (hasValid) {
          return texts.map((_, index) => data.translations![index] || "");
        }
        toast.error("Translation failed - all translations are empty");
        return [];
      }

      toast.error("Failed to get translations - invalid response format");
      return [];
    } catch (error) {
      console.error('Translation error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to translate text";
      toast.error(`Translation error: ${errorMessage}`);
      return [];
    }
  }, []);

  const processTranslation = useCallback(async (
    base64Image: string,
    targetLanguage: string,
    translatedTexts?: TranslatedText[],
    settings?: { quality?: "standard" | "premium" | "ultra"; modelFamily?: ModelFamily }
  ) => {
    setIsProcessing(true);
    try {
      const textPairs = translatedTexts
        ?.map((t) => ({
          original: (t.text || "").trim(),
          translated: (t.translatedText || "").trim(),
        }))
        .filter((pair) => pair.original.length > 0 && pair.translated.length > 0);

      if (!textPairs?.length) {
        toast.error("No translated text to apply");
        return null;
      }

      const request: TranslateImageRequest = {
        image: base64Image,
        targetLanguage,
        translatedTexts: textPairs,
        quality: settings?.quality || "premium",
        modelFamily: settings?.modelFamily,
      };

      const data = await translateImage(request);

      if (data?.method === 'ai-image' && data?.translatedImage) {
        setTranslatedImage(data.translatedImage);
        const langName = data.targetLanguage || targetLanguage;
        toast.success(`Text replaced on image (${langName})`);
        return data.translatedImage;
      }

      toast.error(data?.message || "Could not replace text on image");
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred. Make sure the backend server is running.";
      toast.error(errorMessage);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleImageSelect = useCallback(async (file: File, targetLanguage: string) => {
    const base64Image = await fileToBase64(file);
    setOriginalImage(base64Image);
    setTranslatedImage(null);
    setDetectedTexts([]);
    return base64Image;
  }, [fileToBase64]);

  const reset = useCallback(() => {
    setOriginalImage(null);
    setTranslatedImage(null);
    setDetectedTexts([]);
    setIsProcessing(false);
    setIsDetecting(false);
  }, []);

  return {
    originalImage,
    translatedImage,
    detectedTexts,
    isProcessing,
    isDetecting,
    handleImageSelect,
    detectTextInImage,
    translateTexts,
    processTranslation,
    setDetectedTexts,
    reset,
  };
};
