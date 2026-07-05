import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LanguageSelector } from "./LanguageSelector";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { ImageComparison } from "@/components/shared/ImageComparison";
import { TextDetectionAndTranslation } from "./TextDetectionAndTranslation";
import type { DetectedText, TranslatedText } from "@/lib/types";
import { BackButton } from "@/components/shared/BackButton";
import { useImageTranslation } from "@/hooks/useImageTranslation";
import { downloadImage } from "@/lib/utils";
import { toast } from "sonner";
import { LANGUAGES } from "@/lib/constants";

const DEFAULT_TRANSLATION_SETTINGS = {
  quality: "premium" as const,
  fontMatching: "auto" as const,
  textStyle: "adaptive" as const,
  preserveFormatting: true,
  enhanceReadability: true,
};

interface TranslationWorkflowProps {
  onBack: () => void;
}

export const TranslationWorkflow = ({ onBack }: TranslationWorkflowProps) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");
  const [showTextDetection, setShowTextDetection] = useState(false);
  const [isTranslatingText, setIsTranslatingText] = useState(false);

  const {
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
  } = useImageTranslation();

  const handleImageUpload = async (file: File) => {
    const base64Image = await handleImageSelect(file, selectedLanguage);

    if (base64Image) {
      const texts = await detectTextInImage(base64Image);
      if (texts.length > 0) {
        setShowTextDetection(true);
      } else {
        toast.error("No text detected in the image");
      }
    }
  };

  const handleTranslateTexts = async (texts: DetectedText[]): Promise<TranslatedText[]> => {
    setIsTranslatingText(true);
    try {
      const translations = await translateTexts(
        texts.map((t) => t.text),
        selectedLanguage
      );

      if (!translations.length) {
        return [];
      }

      return texts.map((text, index) => ({
        ...text,
        translatedText: translations[index] || "",
      }));
    } catch (error) {
      console.error("Translation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to translate text");
      return [];
    } finally {
      setIsTranslatingText(false);
    }
  };

  const handleApplyTranslation = async (finalTranslatedTexts: TranslatedText[]) => {
    setShowTextDetection(false);
    if (originalImage) {
      await processTranslation(
        originalImage,
        selectedLanguage,
        finalTranslatedTexts,
        DEFAULT_TRANSLATION_SETTINGS
      );
    }
  };

  const handleDownload = () => {
    if (!translatedImage) return;
    downloadImage(translatedImage, "translated-image.png");
    toast.success("Image downloaded!");
  };

  const languageName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;

  return (
    <>
      <BackButton onClick={onBack} variant="floating" />

      {!originalImage ? (
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Translate Image Text</h2>
            <p className="text-sm text-muted-foreground">
              Choose a language, upload your image, and review the translation
            </p>
          </div>
          <LanguageSelector
            language={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
            disabled={isProcessing || isDetecting}
          />
          <ImageUpload
            onImageSelect={handleImageUpload}
            disabled={isProcessing || isDetecting}
            label="Upload Image"
            description="Drag and drop or click to select an image with text"
          />
          {isDetecting && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Detecting text...</span>
            </div>
          )}
        </div>
      ) : showTextDetection ? (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Review & Translate</h2>
            <p className="text-sm text-muted-foreground">
              Edit detected text if needed, then translate to {languageName}
            </p>
          </div>
          <TextDetectionAndTranslation
            image={originalImage}
            detectedTexts={detectedTexts}
            targetLanguage={selectedLanguage}
            targetLanguageName={languageName}
            onTextsUpdate={setDetectedTexts}
            onTranslate={handleTranslateTexts}
            onApply={handleApplyTranslation}
            isTranslating={isTranslatingText}
            isApplying={isProcessing}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Translated Image</h2>
            <p className="text-sm text-muted-foreground">Translated to {languageName}</p>
          </div>
          <ImageComparison
            originalImage={originalImage}
            enhancedImage={translatedImage}
            isProcessing={isProcessing}
            onDownload={handleDownload}
            originalLabel="Original"
            processedLabel="Translated"
          />
        </div>
      )}
    </>
  );
};
