import { useState, useMemo } from "react";
import { Languages, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { OptionGrid } from "@/components/shared/OptionGrid";
import { OutputPanel } from "@/components/shared/OutputPanel";
import { Panel } from "@/components/shared/Panel";
import { WorkflowHeader } from "@/components/shared/WorkflowHeader";
import { StepIndicator, getStepStatus } from "@/components/shared/StepIndicator";
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
    reset,
  } = useImageTranslation();

  const languageName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;

  const steps = useMemo(() => {
    const uploadDone = !!originalImage;
    const reviewDone = !!translatedImage;
    const onReview = showTextReview && !translatedImage;

    return [
      { number: 1, label: "Upload", status: getStepStatus(uploadDone, !uploadDone) },
      { number: 2, label: "Review", status: getStepStatus(reviewDone, onReview) },
      { number: 3, label: "Result", status: getStepStatus(reviewDone, uploadDone && !reviewDone && !onReview) },
    ];
  }, [originalImage, showTextReview, translatedImage]);

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

  const handleStartOver = () => {
    reset();
    setShowTextReview(false);
  };

  const handleDownload = () => {
    if (!translatedImage) return;
    downloadImage(translatedImage, "translated-image.png");
    toast.success("Image downloaded");
  };

  return (
    <div className="space-y-5">
      <WorkflowHeader
        icon={<Languages className="h-5 w-5" />}
        iconClassName="bg-accent/10 text-accent"
        title="Text Translation"
        subtitle={`Russian book questions → ${languageName}`}
      />

      <StepIndicator steps={steps} className="pb-1" />

      <div className="grid grid-cols-1 xl:grid-cols-[200px_minmax(0,1fr)_minmax(240px,300px)] gap-4">
        <Panel>
          <OptionGrid
            title="Target language"
            items={LANGUAGES.map(({ code, name, flagCode }) => ({ id: code, name, flagCode }))}
            selectedId={selectedLanguage}
            onSelect={setSelectedLanguage}
            disabled={isProcessing || isDetecting || showTextReview}
          />
        </Panel>

        <Panel title="Workspace" description="Upload, review detected text, then apply">
          {!originalImage || showTextReview ? (
            <div className="space-y-4">
              {!showTextReview && (
                <>
                  <ImageUpload
                    onImageSelect={handleImageUpload}
                    disabled={isProcessing || isDetecting}
                    label="Upload book page"
                    description="Russian math, physics, chemistry, or history"
                  />
                  {isDetecting && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Detecting text…
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
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <p className="text-sm text-muted-foreground max-w-xs">
                Translation complete. Check the result panel or start a new page.
              </p>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleStartOver}>
                <RotateCcw className="h-3.5 w-3.5" />
                New image
              </Button>
            </div>
          )}
        </Panel>

        <Panel>
          <OutputPanel
            description={`Translated to ${languageName}`}
            image={translatedImage}
            isProcessing={isProcessing}
            processingLabel="Applying translation…"
            emptyLabel="Upload a book page to see the translation"
            onDownload={translatedImage ? handleDownload : undefined}
          />
        </Panel>
      </div>
    </div>
  );
};
