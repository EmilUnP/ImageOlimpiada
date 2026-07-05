import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Edit2,
  ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TranslationPhaseBanner } from "./TranslationPhaseBanner";
import type { DetectedText, TranslatedText } from "@/lib/types";

interface TextDetectionAndTranslationProps {
  image: string;
  detectedTexts: DetectedText[];
  targetLanguageName: string;
  onTextsUpdate: (texts: DetectedText[]) => void;
  onTranslate: (texts: DetectedText[]) => Promise<TranslatedText[]>;
  onApply: (translatedTexts: TranslatedText[]) => void;
  onBack?: () => void;
  isTranslating?: boolean;
  isApplying?: boolean;
}

export const TextDetectionAndTranslation = ({
  image,
  detectedTexts,
  targetLanguageName,
  onTextsUpdate,
  onTranslate,
  onApply,
  onBack,
  isTranslating = false,
  isApplying = false,
}: TextDetectionAndTranslationProps) => {
  const [originalTexts, setOriginalTexts] = useState<DetectedText[]>(detectedTexts);
  const [translatedTexts, setTranslatedTexts] = useState<TranslatedText[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"original" | "translated" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hasTranslated, setHasTranslated] = useState(false);

  useEffect(() => {
    if (detectedTexts.length > 0) {
      setOriginalTexts(detectedTexts);
      setTranslatedTexts([]);
      setHasTranslated(false);
      setEditingId(null);
      setEditingField(null);
    }
  }, [detectedTexts]);

  const lowConfidenceCount = originalTexts.filter((t) => t.confidence < 0.7).length;
  const translatedCount = translatedTexts.filter((t) => t.translatedText?.trim()).length;
  const allTranslated =
    hasTranslated &&
    translatedTexts.length > 0 &&
    translatedTexts.every((t) => t.translatedText.trim().length > 0);

  const startEdit = (id: string, field: "original" | "translated", value: string) => {
    setEditingId(id);
    setEditingField(field);
    setEditValue(value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingField(null);
    setEditValue("");
  };

  const saveEdit = (id: string) => {
    if (editingField === "original") {
      const updated = originalTexts.map((t) =>
        t.id === id ? { ...t, text: editValue.trim() || t.text, confidence: 1 } : t
      );
      setOriginalTexts(updated);
      onTextsUpdate(updated);
      if (hasTranslated) {
        setTranslatedTexts([]);
        setHasTranslated(false);
      }
    } else if (editingField === "translated") {
      setTranslatedTexts((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, translatedText: editValue.trim() } : t
        )
      );
    }
    cancelEdit();
  };

  const removeText = (id: string) => {
    const updated = originalTexts.filter((t) => t.id !== id);
    setOriginalTexts(updated);
    onTextsUpdate(updated);
    setTranslatedTexts((prev) => prev.filter((t) => t.id !== id));
    if (updated.length === 0) setHasTranslated(false);
  };

  const handleTranslate = async () => {
    if (originalTexts.length === 0) return;

    try {
      const translations = await onTranslate(originalTexts);
      if (!translations?.length) {
        toast.error("No translations received. Please try again.");
        return;
      }

      const valid = translations.filter((t) => t.translatedText?.trim());
      if (valid.length === 0) {
        toast.error("Translation failed — all results were empty.");
        return;
      }

      setTranslatedTexts(translations);
      setHasTranslated(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed");
    }
  };

  const handleApply = () => {
    const valid = translatedTexts.filter((t) => t.translatedText?.trim());
    if (valid.length === 0) return;

    onApply(
      valid.map((t) => ({
        ...t,
        text: t.text || originalTexts.find((o) => o.id === t.id)?.text || "",
        translatedText: t.translatedText.trim(),
      }))
    );
  };

  const getTranslationFor = (id: string, index: number) =>
    translatedTexts.find((t) => t.id === id) ?? (hasTranslated ? translatedTexts[index] : undefined);

  return (
    <div className="space-y-4">
      <TranslationPhaseBanner
        step={2}
        title={hasTranslated ? "Check translations" : "Check detected text"}
        description={
          hasTranslated
            ? `Make sure each ${targetLanguageName} line is correct, then apply it to the image. The original Russian text will be replaced in place.`
            : `We found ${originalTexts.length} text block${originalTexts.length === 1 ? "" : "s"}. Fix any OCR mistakes, then translate to ${targetLanguageName}.`
        }
      />

      {lowConfidenceCount > 0 && !hasTranslated && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {lowConfidenceCount} block{lowConfidenceCount === 1 ? "" : "s"} may need a manual fix — look for the amber dot.
          </span>
        </div>
      )}

      <div className="flex gap-3 items-start rounded-lg border border-border/60 bg-muted/15 p-3">
        <div className="shrink-0 w-20 h-20 rounded-md border border-border/60 bg-background overflow-hidden flex items-center justify-center">
          <img src={image} alt="Uploaded page" className="max-w-full max-h-full object-contain" />
        </div>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground space-y-1 pt-0.5">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            Your uploaded page
          </p>
          <p>{originalTexts.length} labels detected</p>
          {hasTranslated && (
            <p className="text-primary font-medium">{translatedCount} translated</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div
          className={cn(
            "grid gap-2 px-3 py-2 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b",
            hasTranslated ? "grid-cols-[1.5rem_1fr_1fr_4.5rem]" : "grid-cols-[1.5rem_1fr_4.5rem]"
          )}
        >
          <span>#</span>
          <span>Russian (original)</span>
          {hasTranslated && <span>{targetLanguageName}</span>}
          <span className="text-right">Actions</span>
        </div>

        <div className="max-h-[min(420px,50vh)] overflow-y-auto divide-y divide-border/60">
          {originalTexts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No text detected. Try another image.
            </div>
          ) : (
            originalTexts.map((item, index) => {
              const translation = getTranslationFor(item.id, index);
              const isLowConfidence = item.confidence < 0.7;
              const isEditingOriginal = editingId === item.id && editingField === "original";
              const isEditingTranslated = editingId === item.id && editingField === "translated";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "grid gap-2 px-3 py-2.5 items-start text-sm",
                    hasTranslated ? "grid-cols-[1.5rem_1fr_1fr_4.5rem]" : "grid-cols-[1.5rem_1fr_4.5rem]",
                    isLowConfidence && !hasTranslated && "bg-amber-500/[0.04]"
                  )}
                >
                  <span className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                    {index + 1}
                    {isLowConfidence && !hasTranslated && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Low confidence" />
                    )}
                  </span>

                  <div className="min-w-0">
                    {isEditingOriginal ? (
                      <div className="space-y-1.5">
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="min-h-[52px] text-sm"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(item.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="leading-snug break-words">{item.text || "—"}</p>
                    )}
                  </div>

                  {hasTranslated && (
                    <div className="min-w-0">
                      {isEditingTranslated ? (
                        <div className="space-y-1.5">
                          <Textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="min-h-[52px] text-sm"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(item.id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="leading-snug break-words text-foreground">
                          {translation?.translatedText?.trim() || "—"}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-0.5 pt-0.5">
                    {!isEditingOriginal && !isEditingTranslated && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Edit original"
                          onClick={() => startEdit(item.id, "original", item.text)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        {hasTranslated && translation && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Edit translation"
                            onClick={() =>
                              startEdit(item.id, "translated", translation.translatedText || "")
                            }
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Remove"
                          onClick={() => removeText(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-border/40">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isTranslating || isApplying}>
            Upload different image
          </Button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto w-full sm:w-auto">
          {!hasTranslated ? (
            <Button
              onClick={handleTranslate}
              disabled={isTranslating || originalTexts.length === 0}
              className="w-full sm:w-auto gap-2"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Translating…
                </>
              ) : (
                <>Translate to {targetLanguageName}</>
              )}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHasTranslated(false);
                  setTranslatedTexts([]);
                }}
                disabled={isApplying}
                className="w-full sm:w-auto"
              >
                Re-translate
              </Button>
              <Button
                onClick={handleApply}
                disabled={isApplying || !allTranslated}
                className="w-full sm:w-auto gap-2"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying to image…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Apply to image
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
