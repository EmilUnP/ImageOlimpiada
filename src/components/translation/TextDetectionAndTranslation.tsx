import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Edit2,
  ImageIcon,
  Loader2,
  PenLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isFormulaOnly } from "@/lib/formula";
import { mergeMachineTranslations, upsertTranslation } from "@/lib/translations";
import { MathText } from "@/components/shared/MathText";
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
  /** Leave the table without applying (shown when editing an already applied result) */
  onCancel?: () => void;
  /** Translations applied earlier — the table opens on them instead of asking to translate again */
  initialTranslations?: TranslatedText[];
  isTranslating?: boolean;
  isApplying?: boolean;
}

type EditField = "original" | "translated";

const textButtonClass =
  "block w-full -mx-1 px-1 rounded-sm text-left leading-snug break-words cursor-text hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent";

export const TextDetectionAndTranslation = ({
  image,
  detectedTexts,
  targetLanguageName,
  onTextsUpdate,
  onTranslate,
  onApply,
  onBack,
  onCancel,
  initialTranslations,
  isTranslating = false,
  isApplying = false,
}: TextDetectionAndTranslationProps) => {
  const [originalTexts, setOriginalTexts] = useState<DetectedText[]>(detectedTexts);
  const [translatedTexts, setTranslatedTexts] = useState<TranslatedText[]>(initialTranslations ?? []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFocus, setEditFocus] = useState<EditField>("original");
  const [draft, setDraft] = useState({ original: "", translated: "" });
  const [hasTranslated, setHasTranslated] = useState(!!initialTranslations?.length);
  const [bulkTranslating, setBulkTranslating] = useState(false);
  // Rows waiting on their own machine translation (→, or after their Russian text changed)
  const [busyRows, setBusyRows] = useState<string[]>([]);

  const originalEditorRef = useRef<HTMLTextAreaElement>(null);
  const translatedEditorRef = useRef<HTMLTextAreaElement>(null);

  // Our own edits echo back through detectedTexts — only a fresh detection should reset the table
  const syncedTexts = useRef(detectedTexts);

  const pushTextsUpdate = (texts: DetectedText[]) => {
    syncedTexts.current = texts;
    onTextsUpdate(texts);
  };

  useEffect(() => {
    if (detectedTexts === syncedTexts.current) return;
    syncedTexts.current = detectedTexts;
    if (detectedTexts.length > 0) {
      setOriginalTexts(detectedTexts);
      setTranslatedTexts([]);
      setHasTranslated(false);
      setEditingId(null);
    }
  }, [detectedTexts]);

  // Open the editor with the caret after the text, ready to fix the end or keep typing
  useEffect(() => {
    if (!editingId) return;
    const editor = (editFocus === "translated" ? translatedEditorRef : originalEditorRef).current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }, [editingId, editFocus]);

  const getTranslationFor = (id: string, index: number) =>
    translatedTexts.find((t) => t.id === id) ?? (hasTranslated ? translatedTexts[index] : undefined);

  const rowTranslations = originalTexts.map((item, index) => getTranslationFor(item.id, index));
  const lowConfidenceCount = originalTexts.filter((t) => t.confidence < 0.7).length;
  const translatedCount = rowTranslations.filter((t) => t?.translatedText?.trim()).length;
  const editedCount = rowTranslations.filter((t) => t?.edited).length;
  const allTranslated = hasTranslated && originalTexts.length > 0 && translatedCount === originalTexts.length;
  const busy = isTranslating || bulkTranslating || busyRows.length > 0;
  const isEditingAny = editingId !== null;

  const startEdit = (item: DetectedText, field: EditField, translation?: TranslatedText) => {
    setEditingId(item.id);
    setEditFocus(field);
    setDraft({ original: item.text, translated: translation?.translatedText ?? "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ original: "", translated: "" });
  };

  const setRowBusy = (id: string, isBusy: boolean) =>
    setBusyRows((prev) => (isBusy ? [...prev, id] : prev.filter((rowId) => rowId !== id)));

  /** Fresh machine translation for one row — also the way to drop a translation the user typed */
  const translateRow = async (item: DetectedText, index: number) => {
    const previous = translatedTexts.find((t) => t.id === item.id);
    setRowBusy(item.id, true);
    try {
      const [fresh] = await onTranslate([item]);
      const text = fresh?.translatedText?.trim();
      if (!text) {
        toast.error(`Line ${index + 1} was not translated. Try again or type the translation yourself.`);
        return;
      }

      setTranslatedTexts((prev) => upsertTranslation(prev, { ...item, translatedText: text }));
      if (previous?.edited) {
        toast(`Line ${index + 1}: your translation was replaced by a machine one`, {
          action: {
            label: "Undo",
            onClick: () => setTranslatedTexts((prev) => upsertTranslation(prev, previous)),
          },
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed");
    } finally {
      setRowBusy(item.id, false);
    }
  };

  const saveEdit = (item: DetectedText, index: number, translation?: TranslatedText) => {
    const original = draft.original.trim() || item.text;
    const originalChanged = original !== item.text.trim();
    const updatedItem = { ...item, text: original, confidence: 1 };
    const updated = originalTexts.map((t) => (t.id === item.id ? updatedItem : t));
    setOriginalTexts(updated);
    pushTextsUpdate(updated);

    if (hasTranslated) {
      const typed = draft.translated.trim();
      if (typed && typed !== (translation?.translatedText ?? "").trim()) {
        setTranslatedTexts((prev) =>
          upsertTranslation(prev, { ...updatedItem, translatedText: typed, edited: true })
        );
      } else if (originalChanged && translation?.edited) {
        // A translation the user typed stays, even when the Russian line under it is corrected
        setTranslatedTexts((prev) => upsertTranslation(prev, { ...translation, ...updatedItem }));
      } else if (originalChanged) {
        // The machine translation was for the old text — fetch one for this line only
        setTranslatedTexts((prev) => upsertTranslation(prev, { ...updatedItem, translatedText: "" }));
        void translateRow(updatedItem, index);
      }
    }
    cancelEdit();
  };

  const removeText = (id: string) => {
    const updated = originalTexts.filter((t) => t.id !== id);
    setOriginalTexts(updated);
    pushTextsUpdate(updated);
    setTranslatedTexts((prev) => prev.filter((t) => t.id !== id));
    if (updated.length === 0) setHasTranslated(false);
  };

  /** Translate every line, or on Re-translate every line the user has not typed themselves */
  const handleTranslate = async () => {
    if (originalTexts.length === 0) return;

    const rows = originalTexts.filter((item, index) => !rowTranslations[index]?.edited);
    if (rows.length === 0) {
      toast.info("You typed every translation yourself, so nothing was re-translated. Use → on a line to get a machine translation for it.");
      return;
    }

    setBulkTranslating(true);
    try {
      const translations = await onTranslate(rows);
      if (!translations?.length) {
        toast.error("No translations received. Please try again.");
        return;
      }

      const valid = translations.filter((t) => t.translatedText?.trim());
      if (valid.length === 0) {
        toast.error("Translation failed — all results were empty.");
        return;
      }

      setTranslatedTexts((prev) => mergeMachineTranslations(prev, translations));
      setHasTranslated(true);
      if (editedCount > 0) {
        toast.info(
          `Kept ${editedCount} translation${editedCount === 1 ? "" : "s"} you typed. Use → on a line to replace it with a machine one.`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed");
    } finally {
      setBulkTranslating(false);
    }
  };

  const handleApply = () => {
    // Current table rows, so a corrected Russian line and a typed translation both reach the image
    const applied = originalTexts.flatMap((item, index) => {
      const translation = rowTranslations[index];
      const translatedText = translation?.translatedText?.trim();
      return translatedText ? [{ ...item, translatedText, edited: translation.edited }] : [];
    });
    if (applied.length === 0) return;

    onApply(applied);
  };

  return (
    <div className="space-y-4">
      <TranslationPhaseBanner
        step={2}
        title={hasTranslated ? "Check translations" : "Check detected text"}
        description={
          hasTranslated
            ? `Make sure each ${targetLanguageName} line is correct — click a line to type your own translation — then apply it to the image. The original Russian text will be replaced in place.`
            : `We found ${originalTexts.length} text block${originalTexts.length === 1 ? "" : "s"}. Fix any OCR mistakes — check that formulas show the right powers, subscripts and fractions — then translate to ${targetLanguageName}.`
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
            <p className="text-primary font-medium">
              {translatedCount} translated
              {editedCount > 0 && (
                <span className="font-normal text-muted-foreground"> · {editedCount} edited by you</span>
              )}
            </p>
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
              const translation = rowTranslations[index];
              const isLowConfidence = item.confidence < 0.7;
              const isEditing = editingId === item.id;
              const isRowBusy = busyRows.includes(item.id);
              const rowLocked = bulkTranslating || isRowBusy || isApplying;
              const formulaOnly = isFormulaOnly(item.text);
              const keptAsIs =
                formulaOnly &&
                !translation?.edited &&
                translation?.translatedText?.replace(/\s+/g, " ").trim() === item.text.replace(/\s+/g, " ").trim();

              const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  saveEdit(item, index, translation);
                }
              };

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
                    {isEditing ? (
                      <Textarea
                        ref={originalEditorRef}
                        value={draft.original}
                        onChange={(e) => setDraft((prev) => ({ ...prev, original: e.target.value }))}
                        onKeyDown={handleEditorKeyDown}
                        aria-label="Russian (original)"
                        className="min-h-[52px] text-sm font-mono"
                      />
                    ) : (
                      <div className="space-y-1">
                        <button
                          type="button"
                          className={textButtonClass}
                          title="Click to edit"
                          disabled={rowLocked}
                          onClick={() => startEdit(item, "original", translation)}
                        >
                          {item.text ? <MathText text={item.text} /> : "—"}
                        </button>
                        {formulaOnly && (
                          <span className="inline-block rounded border border-primary/30 bg-primary/5 px-1.5 py-px text-[10px] font-medium text-primary">
                            Formula · kept as is
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {hasTranslated && (
                    <div className="min-w-0">
                      {isEditing ? (
                        <Textarea
                          ref={translatedEditorRef}
                          value={draft.translated}
                          onChange={(e) => setDraft((prev) => ({ ...prev, translated: e.target.value }))}
                          onKeyDown={handleEditorKeyDown}
                          aria-label={`${targetLanguageName} translation`}
                          placeholder={`Type the ${targetLanguageName} text`}
                          className="min-h-[52px] text-sm font-mono"
                        />
                      ) : isRowBusy ? (
                        <p className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Translating…
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <button
                            type="button"
                            className={cn(textButtonClass, keptAsIs ? "text-muted-foreground" : "text-foreground")}
                            title={`Click to type your own ${targetLanguageName} translation`}
                            disabled={rowLocked}
                            onClick={() => startEdit(item, "translated", translation)}
                          >
                            {translation?.translatedText?.trim() ? (
                              <MathText text={translation.translatedText.trim()} />
                            ) : (
                              "—"
                            )}
                          </button>
                          {translation?.edited && (
                            <span
                              className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                              title="You typed this translation. Re-translate keeps it; → replaces it with a machine one."
                            >
                              <PenLine className="h-2.5 w-2.5" />
                              Edited
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-0.5 pt-0.5">
                    {!isEditing && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={hasTranslated ? "Edit text and translation" : "Edit original"}
                          disabled={rowLocked}
                          onClick={() => startEdit(item, hasTranslated ? "translated" : "original", translation)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        {hasTranslated && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={
                              translation?.edited
                                ? "Replace your translation with a machine one"
                                : "Translate this line again"
                            }
                            disabled={rowLocked}
                            onClick={() => translateRow(item, index)}
                          >
                            {isRowBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Remove"
                          disabled={rowLocked}
                          onClick={() => removeText(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>

                  {isEditing && (
                    <div className="col-start-2 col-end-[-1] space-y-1.5">
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        Formulas go between $…$ in LaTeX: $x^2$, $H_2SO_4$, $\frac{"{a}{b}"}$ · Ctrl+Enter saves, Esc cancels
                      </p>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(item, index, translation)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-border/40">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy || isApplying}>
            Back to result
          </Button>
        )}
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} disabled={busy || isApplying}>
            Upload different image
          </Button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto w-full sm:w-auto">
          {!hasTranslated ? (
            <Button
              onClick={handleTranslate}
              disabled={busy || isEditingAny || originalTexts.length === 0}
              title={isEditingAny ? "Save or cancel the line you are editing first" : undefined}
              className="w-full sm:w-auto gap-2"
            >
              {bulkTranslating ? (
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
                onClick={handleTranslate}
                disabled={isApplying || busy || isEditingAny}
                title={
                  isEditingAny
                    ? "Save or cancel the line you are editing first"
                    : editedCount > 0
                      ? `Translations you typed (${editedCount}) are kept`
                      : undefined
                }
                className="w-full sm:w-auto gap-2"
              >
                {bulkTranslating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Re-translating…
                  </>
                ) : (
                  "Re-translate"
                )}
              </Button>
              <Button
                onClick={handleApply}
                disabled={isApplying || busy || isEditingAny || !allTranslated}
                title={isEditingAny ? "Save or cancel the line you are editing first" : undefined}
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
