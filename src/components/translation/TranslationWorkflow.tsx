import { useState, lazy, Suspense } from "react";
import { Languages, Loader2, RotateCcw, Pencil, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { OptionGrid } from "@/components/shared/OptionGrid";
import { OutputPanel } from "@/components/shared/OutputPanel";
import { Panel } from "@/components/shared/Panel";
import { WorkflowHeader } from "@/components/shared/WorkflowHeader";
import { TranslationPhaseBanner } from "./TranslationPhaseBanner";
import type { DetectedText, TranslatedText } from "@/lib/types";
import { useImageTranslation } from "@/hooks/useImageTranslation";
import { LANGUAGES, SUBJECTS } from "@/lib/constants";
import { downloadImage } from "@/lib/utils";
import { toast } from "sonner";
import type { Subject } from "@/lib/api";

// Review table pulls in KaTeX — load it only once text has been detected
const TextDetectionAndTranslation = lazy(() =>
  import("./TextDetectionAndTranslation").then((m) => ({ default: m.TextDetectionAndTranslation }))
);

interface TranslationWorkflowProps {
  /** Model family fixed by TRANSLATION_MODEL_FAMILY in .env — shown, not selectable */
  modelLabel?: string;
}

export const TranslationWorkflow = ({ modelLabel }: TranslationWorkflowProps) => {
  const [selectedLanguage, setSelectedLanguage] = useState("az");
  const [subject, setSubject] = useState<Subject>("auto");
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

  // Last translations sent to the image, so "Edit translations" reopens the table with them
  const [lastApplied, setLastApplied] = useState<{ language: string; texts: TranslatedText[] } | null>(null);

  const languageName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;
  const isComplete = !!translatedImage;

  const handleImageUpload = async (file: File) => {
    setLastApplied(null);
    const base64Image = await handleImageSelect(file, selectedLanguage);
    if (!base64Image) return;

    const texts = await detectTextInImage(base64Image, undefined, subject);
    if (texts.length > 0) {
      setShowTextReview(true);
    } else {
      toast.error("No text detected. Try a clearer scan or crop.");
    }
  };

  const handleTranslateTexts = async (texts: DetectedText[]): Promise<TranslatedText[]> => {
    setIsTranslatingText(true);
    try {
      const translations = await translateTexts(
        texts.map((t) => t.text),
        selectedLanguage,
        subject
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
    setLastApplied({ language: selectedLanguage, texts: finalTranslatedTexts });
    if (originalImage) {
      await processTranslation(
        originalImage,
        selectedLanguage,
        finalTranslatedTexts,
        { subject }
      );
    }
  };

  const handleStartOver = () => {
    reset();
    setShowTextReview(false);
    setLastApplied(null);
  };

  const handleBackToReview = () => {
    setShowTextReview(true);
  };

  const handleBackToResult = () => {
    setShowTextReview(false);
  };

  const handleDownload = () => {
    if (!translatedImage) return;
    downloadImage(translatedImage, "translated-image.png");
    toast.success("Image downloaded");
  };

  const workspaceLocked = isProcessing || isDetecting || showTextReview;

  return (
    <div className="space-y-5">
      <WorkflowHeader
        icon={<Languages className="h-5 w-5" />}
        iconClassName="bg-accent/10 text-accent"
        title="Text Translation"
        subtitle={`Replace Russian text on scans → ${languageName}`}
      />

      {!originalImage && (
        <TranslationPhaseBanner
          step={1}
          title="Upload a scanned page"
          description="Upload a book page, diagram, or exam question. We will detect all Russian text automatically."
        />
      )}

      {isComplete && !showTextReview && (
        <TranslationPhaseBanner
          step={3}
          title="Translation complete"
          description="Compare original and result below. Download the image or go back to edit translations and re-apply."
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[200px_minmax(0,1fr)_minmax(260px,320px)] gap-4">
        <Panel>
          <OptionGrid
            title="Target language"
            items={LANGUAGES.map(({ code, name, flagCode }) => ({ id: code, name, flagCode }))}
            selectedId={selectedLanguage}
            onSelect={setSelectedLanguage}
            disabled={workspaceLocked}
          />

          <div className="mt-4 pt-4 border-t border-border/40">
            <OptionGrid
              title="Subject"
              items={SUBJECTS.map(({ id, name, emoji }) => ({ id, name, emoji }))}
              selectedId={subject}
              onSelect={(id) => setSubject(id as Subject)}
              disabled={workspaceLocked}
            />
          </div>

          {modelLabel && (
            <p className="mt-4 pt-4 border-t border-border/40 text-[11px] text-muted-foreground leading-relaxed">
              AI model: <span className="font-medium text-foreground">{modelLabel}</span> (set in .env)
            </p>
          )}
        </Panel>

        <Panel
          title="Workspace"
          description={
            isComplete && !showTextReview
              ? "Done — compare or start a new page"
              : showTextReview
                ? "Check text, translate, and apply"
                : "Upload a Russian scan"
          }
        >
          {showTextReview && originalImage ? (
            <Suspense
              fallback={
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 px-1">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span>Loading review…</span>
                </div>
              }
            >
              <TextDetectionAndTranslation
                image={originalImage}
                detectedTexts={detectedTexts}
                targetLanguageName={languageName}
                onTextsUpdate={setDetectedTexts}
                onTranslate={handleTranslateTexts}
                initialTranslations={
                  lastApplied?.language === selectedLanguage ? lastApplied.texts : undefined
                }
                onApply={handleApplyTranslation}
                onBack={handleStartOver}
                onCancel={isComplete ? handleBackToResult : undefined}
                isTranslating={isTranslatingText}
                isApplying={isProcessing}
              />
            </Suspense>
          ) : isComplete && !showTextReview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Original
                  </p>
                  <div className="aspect-[4/3] rounded-lg border border-border/60 bg-muted/15 overflow-hidden">
                    {originalImage && (
                      <img
                        src={originalImage}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-1.5">
                    Translated
                  </p>
                  <div className="aspect-[4/3] rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
                    {translatedImage && (
                      <img
                        src={translatedImage}
                        alt="Translated"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={handleDownload} className="gap-2" size="sm" disabled={isProcessing}>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleBackToReview}
                  disabled={isProcessing}
                >
                  <Pencil className="h-4 w-4" />
                  Edit translations
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={handleStartOver}
                  disabled={isProcessing}
                >
                  <RotateCcw className="h-4 w-4" />
                  New image
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ImageUpload
                onImageSelect={handleImageUpload}
                disabled={isProcessing || isDetecting}
                label="Upload scanned page"
                description="Russian textbook, exam, or diagram — JPG or PNG"
              />
              {isDetecting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 px-1">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span>Finding text on your image…</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel>
          {isComplete ? (
            <OutputPanel
              title="Result"
              description={`Translated to ${languageName}`}
              image={translatedImage}
              isProcessing={isProcessing}
              processingLabel="Replacing text on image…"
              emptyLabel="Your translated image will appear here"
              onDownload={handleDownload}
            />
          ) : (
            <OutputPanel
              title="Preview"
              description={
                showTextReview
                  ? "Result appears after you apply"
                  : "Upload to begin"
              }
              image={showTextReview ? originalImage : null}
              isProcessing={isProcessing}
              processingLabel="Replacing text on image…"
              emptyLabel={
                showTextReview
                  ? "Click Apply to image when translations look correct"
                  : "Your translated image will appear here"
              }
            />
          )}
        </Panel>
      </div>
    </div>
  );
};
