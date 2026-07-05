import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { enhanceImage, EnhanceImageRequest, type ModelFamily } from '@/lib/api';
import { useImageUpload } from './useImageUpload';

export interface ProcessedImage {
  id: string;
  original: string;
  enhanced: string | null;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

export const useImageEnhancement = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchImages, setBatchImages] = useState<ProcessedImage[]>([]);
  const { fileToBase64 } = useImageUpload();

  const processImage = useCallback(async (
    base64Image: string,
    mode: string,
    intensity: string,
    modelFamily?: ModelFamily
  ) => {
    setIsProcessing(true);
    try {
      const request: EnhanceImageRequest = {
        image: base64Image,
        mode,
        intensity,
        modelFamily,
      };

      const data = await enhanceImage(request);

      if (data?.enhancedImage) {
        setEnhancedImage(data.enhancedImage);
        const modeName = data.mode ? data.mode.charAt(0).toUpperCase() + data.mode.slice(1) : '';
        toast.success(`Image enhanced successfully using ${modeName} mode!`);
        return data.enhancedImage;
      } else {
        toast.error("No processed image received");
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred. Make sure the backend server is running.";
      toast.error(errorMessage);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleImageSelect = useCallback(async (
    file: File,
    mode: string,
    intensity: string,
    modelFamily?: ModelFamily
  ) => {
    const base64Image = await fileToBase64(file);
    setOriginalImage(base64Image);
    setEnhancedImage(null);
    await processImage(base64Image, mode, intensity, modelFamily);
  }, [fileToBase64, processImage]);

  const reset = useCallback(() => {
    setOriginalImage(null);
    setEnhancedImage(null);
    setIsProcessing(false);
    setBatchImages([]);
  }, []);

  return {
    originalImage,
    enhancedImage,
    isProcessing,
    batchImages,
    setBatchImages,
    processImage,
    handleImageSelect,
    reset,
    setIsProcessing,
  };
};

