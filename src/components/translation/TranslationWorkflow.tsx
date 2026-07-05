import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { OptionGrid } from "@/components/shared/OptionGrid";
import { OutputPanel } from "@/components/shared/OutputPanel";
import { TextDetectionAndTranslation } from "./TextDetectionAndTranslation";
import type { DetectedText, TranslatedText } from "@/lib/types";
import { useImageTranslation } from "@/hooks/useImageTranslation";
import { LANGUAGES } from "@/lib/constants";
import { downloadImage } from "@/lib/utils";
import { toast } from "sonner";

const DEFAULT_TRANSLATION_SETTINGS = {
  quality: "premium" as const,
  fontMatching: "auto" as const,
  textStyle: "adaptive" as const,
  preserveFormatting: true,
  enhanceReadability: true,
};

export const TranslationWorkflow = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [showTextReview, setShowTextReview] = useState(false);
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

  const languageName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;

  const handleImageUpload = async (file: File) => {
    const base64Image = await handleImageSelect(file, selectedLanguage);
    if (!base64Image) return;

    const texts = await detectTextInImage(base64Image);
    if (texts.length > 0) {
      setShowTextReview(true);
    } else {
      toast.error("No text detected in the image");
    }
  };

  const handleTranslateTexts = async (texts: DetectedText[]): Promise<TranslatedText[]> => {
    setIsTranslatingText(true);
    try {
      const translations = await translateTexts(
        texts.map((t) => t.text),
        selectedLanguage
      );
      if (!translations.length) return [];

      return texts.map((text, index) => ({
        ...text,
        translatedText: translations[index] || "",
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to translate text");
      return [];
    } finally {
      setIsTranslatingText(false);
    }
  };

  const handleApplyTranslation = async (finalTranslatedTexts: TranslatedText[]) => {
    setShowTextReview(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Languages className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Text Translation</h1>
          <p className="text-sm text-muted-foreground">
            Translate Russian book questions to {languageName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_minmax(260px,320px)] gap-5">
        <section className="rounded-xl border border-border/60 bg-card/50 p-4">
          <OptionGrid
            title="Language"
            items={LANGUAGES.map(({ code, name, emoji }) => ({ id: code, name, emoji }))}
            selectedId={selectedLanguage}
            onSelect={setSelectedLanguage}
            disabled={isProcessing || isDetecting || showTextReview}
          />
        </section>

        <section className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold">Workspace</h3>

          {!originalImage || showTextReview ? (
            <>
              {!showTextReview && (
                <>
                  <ImageUpload
                    onImageSelect={handleImageUpload}
                    disabled={isProcessing || isDetecting}
                    label="Upload book page"
                    description="Russian math, physics, chemistry, or history question"
                  />
                  {isDetecting && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Detecting text...
                    </div>
                  )}
                </>
              )}

              {showTextReview && originalImage && (
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
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Translation complete. View the result on the right or upload a new image to start over.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-card/50 p-4">
          <OutputPanel
            description={`Translated to ${languageName}`}
            image={translatedImage}
            isProcessing={isProcessing}
            processingLabel="Applying translation..."
            emptyLabel="Upload a book page to see the translation"
            onDownload={translatedImage ? handleDownload : undefined}
          />
        </section>
      </div>
    </div>
  );
};
