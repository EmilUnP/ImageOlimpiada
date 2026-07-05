import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Edit2, Save, X, Languages, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { DetectedText, TranslatedText } from "@/lib/types";

interface TextDetectionAndTranslationProps {
  image: string;
  detectedTexts: DetectedText[];
  targetLanguage: string;
  targetLanguageName: string;
  onTextsUpdate: (texts: DetectedText[]) => void;
  onTranslate: (texts: DetectedText[]) => Promise<TranslatedText[]>;
  onApply: (translatedTexts: TranslatedText[]) => void;
  isTranslating?: boolean;
  isApplying?: boolean;
}

export const TextDetectionAndTranslation = ({
  image,
  detectedTexts,
  targetLanguage,
  targetLanguageName,
  onTextsUpdate,
  onTranslate,
  onApply,
  isTranslating = false,
  isApplying = false,
}: TextDetectionAndTranslationProps) => {
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [editingTranslatedId, setEditingTranslatedId] = useState<string | null>(null);
  const [originalTexts, setOriginalTexts] = useState<DetectedText[]>(detectedTexts);
  const [translatedTexts, setTranslatedTexts] = useState<TranslatedText[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [hasTranslated, setHasTranslated] = useState<boolean>(false);

  // Update original texts when detectedTexts change
  useEffect(() => {
    if (detectedTexts.length > 0) {
      setOriginalTexts(detectedTexts);
      setTranslatedTexts([]);
      setHasTranslated(false);
    }
  }, [detectedTexts]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-500";
    if (confidence >= 0.6) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.6) return "Medium";
    return "Low";
  };

  const handleEditOriginal = (id: string, currentText: string) => {
    setEditingOriginalId(id);
    setEditValues({ ...editValues, [id]: currentText });
  };

  const handleSaveOriginal = (id: string) => {
    const updatedTexts = originalTexts.map((text) =>
      text.id === id
        ? { ...text, text: editValues[id] || text.text, confidence: 1.0 }
        : text
    );
    setOriginalTexts(updatedTexts);
    onTextsUpdate(updatedTexts);
    setEditingOriginalId(null);
    // Reset translations if original text changed
    if (hasTranslated) {
      setTranslatedTexts([]);
      setHasTranslated(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingOriginalId(null);
    setEditingTranslatedId(null);
    setEditValues({});
  };

  const handleRemoveOriginal = (id: string) => {
    const updatedTexts = originalTexts.filter((text) => text.id !== id);
    setOriginalTexts(updatedTexts);
    onTextsUpdate(updatedTexts);
    // Remove corresponding translation if exists
    if (hasTranslated) {
      setTranslatedTexts(translatedTexts.filter(t => t.id !== id));
    }
  };

  const handleTranslate = async () => {
    if (originalTexts.length === 0) return;

    try {
      const translations = await onTranslate(originalTexts);

      if (translations && Array.isArray(translations) && translations.length > 0) {
        const isTranslatedTextArray = typeof translations[0] === 'object' && 'translatedText' in translations[0];

        let validTranslations: TranslatedText[];
        if (isTranslatedTextArray) {
          validTranslations = translations as TranslatedText[];
        } else {
          const translationsArray = translations as unknown as string[];
          validTranslations = originalTexts.map((original, index) => ({
            ...original,
            translatedText: translationsArray[index] || "",
          }));
        }

        const hasValidTranslations = validTranslations.some(t => t.translatedText?.trim().length > 0);
        if (hasValidTranslations) {
          setTranslatedTexts(validTranslations);
          setHasTranslated(true);
        } else {
          toast.error("Translation failed - received empty translations. Please try again.");
        }
      } else {
        toast.error("Translation failed - no translations received.");
      }
    } catch (error) {
      console.error('Translation error:', error);
      toast.error(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleEditTranslated = (id: string, currentText: string) => {
    setEditingTranslatedId(id);
    setEditValues({ ...editValues, [`translated-${id}`]: currentText });
  };

  const handleSaveTranslated = (id: string) => {
    const updatedTexts = translatedTexts.map((text) =>
      text.id === id
        ? { ...text, translatedText: editValues[`translated-${id}`] || text.translatedText }
        : text
    );
    setTranslatedTexts(updatedTexts);
    setEditingTranslatedId(null);
  };

  const handleApply = () => {
    const validTranslations = translatedTexts.filter(
      (text) => text.translatedText?.trim().length > 0
    );

    if (validTranslations.length > 0) {
      const completeTranslations = validTranslations.map(t => ({
        ...t,
        text: t.text || originalTexts.find(ot => ot.id === t.id)?.text || "",
        translatedText: t.translatedText || "",
      }));
      onApply(completeTranslations);
    }
  };

  const allTranslated = translatedTexts.length > 0 && translatedTexts.every(
    (text) => text.translatedText.trim().length > 0
  );

  const averageConfidence =
    originalTexts.length > 0
      ? originalTexts.reduce((sum, text) => sum + text.confidence, 0) / originalTexts.length
      : 0;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Summary Card */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-xl md:text-2xl font-bold tracking-tight">
            <div className="p-2 rounded-lg bg-primary/10">
              <Languages className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            Text Detection & Translation
          </CardTitle>
          <CardDescription className="text-base md:text-lg mt-2">
            Review detected text, edit if needed, then translate to <span className="font-semibold text-foreground">{targetLanguageName}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-5 rounded-xl bg-gradient-to-br from-muted/60 to-muted/40 border border-border/50">
              <div className="text-3xl font-bold text-foreground mb-1">{originalTexts.length}</div>
              <div className="text-sm text-muted-foreground font-medium">Text Blocks</div>
            </div>
            <div className="p-5 rounded-xl bg-gradient-to-br from-muted/60 to-muted/40 border border-border/50">
              <div className="text-3xl font-bold text-foreground mb-1">
                {(averageConfidence * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground font-medium">Avg Confidence</div>
            </div>
            <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="text-3xl font-bold text-primary mb-1">
                {translatedTexts.filter((t) => t.translatedText.trim().length > 0).length}
              </div>
              <div className="text-sm text-muted-foreground font-medium">Translated</div>
            </div>
            <div className="p-5 rounded-xl bg-gradient-to-br from-muted/60 to-muted/40 border border-border/50">
              <div className="text-3xl font-bold text-foreground mb-1">
                {translatedTexts.filter((t) => t.translatedText.trim().length === 0).length}
              </div>
              <div className="text-sm text-muted-foreground font-medium">Pending</div>
            </div>
          </div>

          {averageConfidence < 0.7 && !hasTranslated && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Low average confidence detected. Please review and correct the text below before translating.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Image Preview */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-5 md:p-7">
          <div className="relative aspect-video bg-muted/30 rounded-xl overflow-hidden border border-border/50">
            <img
              src={image}
              alt="Preview"
              className="w-full h-full object-contain"
            />
          </div>
        </CardContent>
      </Card>

      {/* Translate CTA */}
      {!hasTranslated && originalTexts.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight">Ready to translate</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Review the text blocks below, then translate to {targetLanguageName}.
                </p>
              </div>
              <Button
                onClick={handleTranslate}
                size="sm"
                className="shrink-0 gap-2 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-medium rounded-lg sm:ml-4"
                disabled={isTranslating || originalTexts.length === 0}
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Translating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Translate to {targetLanguageName}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Text Blocks */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl md:text-2xl font-bold tracking-tight">Text Blocks</CardTitle>
          <CardDescription className="text-base md:text-lg mt-2">
            {hasTranslated 
              ? "Review and edit original text and translations before applying to image"
              : "Review and edit detected text, then click Translate button above"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {originalTexts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No text detected in the image.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {originalTexts.map((originalText, index) => {
                // Find translation by ID or by index if ID doesn't match
                let translatedText = translatedTexts.find(t => t.id === originalText.id);
                if (!translatedText && hasTranslated && translatedTexts[index]) {
                  translatedText = translatedTexts[index];
                }
                
                const isEditingOriginal = editingOriginalId === originalText.id;
                const isEditingTranslated = editingTranslatedId === originalText.id;

                return (
                  <Card
                    key={originalText.id}
                    className={`border-2 transition-all ${
                      originalText.confidence < 0.6
                        ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                        : originalText.confidence < 0.8
                        ? "border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20"
                        : "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm text-primary">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-4">
                          {/* Original Text */}
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">Original</Badge>
                              <Badge
                                variant="outline"
                                className={`${getConfidenceColor(originalText.confidence)} text-white border-0 text-xs`}
                              >
                                {getConfidenceLabel(originalText.confidence)} ({(originalText.confidence * 100).toFixed(0)}%)
                              </Badge>
                            </div>
                            {isEditingOriginal ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editValues[originalText.id] || originalText.text}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      [originalText.id]: e.target.value,
                                    })
                                  }
                                  className="min-h-[60px]"
                                  placeholder="Enter or correct the text..."
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => handleSaveOriginal(originalText.id)}
                                    size="sm"
                                    className="gap-2"
                                  >
                                    <Save className="w-4 h-4" />
                                    Save
                                  </Button>
                                  <Button
                                    onClick={handleCancelEdit}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                  >
                                    <X className="w-4 h-4" />
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium flex-1">{originalText.text || "(Empty)"}</p>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {originalText.confidence >= 0.8 && (
                                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    )}
                                    <Button
                                      onClick={() => handleEditOriginal(originalText.id, originalText.text)}
                                      variant="ghost"
                                      size="sm"
                                      className="gap-2 h-8"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      onClick={() => handleRemoveOriginal(originalText.id)}
                                      variant="ghost"
                                      size="sm"
                                      className="gap-2 h-8 text-destructive hover:text-destructive"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Arrow and Translated Text */}
                          {hasTranslated && (
                            <>
                              <div className="flex items-center justify-center py-1">
                                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="default" className="text-xs bg-primary">
                                    {targetLanguageName}
                                  </Badge>
                                  {translatedText && translatedText.translatedText.trim().length === 0 && (
                                    <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">
                                      Pending
                                    </Badge>
                                  )}
                                </div>
                                {isEditingTranslated ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editValues[`translated-${originalText.id}`] || (translatedText?.translatedText || "")}
                                      onChange={(e) =>
                                        setEditValues({
                                          ...editValues,
                                          [`translated-${originalText.id}`]: e.target.value,
                                        })
                                      }
                                      className="min-h-[60px]"
                                      placeholder="Enter translation..."
                                    />
                                    <div className="flex items-center gap-2">
                                      <Button
                                        onClick={() => handleSaveTranslated(originalText.id)}
                                        size="sm"
                                        className="gap-2"
                                      >
                                        <Save className="w-4 h-4" />
                                        Save
                                      </Button>
                                      <Button
                                        onClick={handleCancelEdit}
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                      >
                                        <X className="w-4 h-4" />
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                                    {translatedText && translatedText.translatedText.trim().length > 0 ? (
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium flex-1">
                                          {translatedText.translatedText}
                                        </p>
                                        <Button
                                          onClick={() => handleEditTranslated(originalText.id, translatedText.translatedText)}
                                          variant="ghost"
                                          size="sm"
                                          className="gap-2 h-8 flex-shrink-0"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                          Edit
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between">
                                        <p className="text-sm text-muted-foreground italic">
                                          Translation pending...
                                        </p>
                                        <Button
                                          onClick={() => handleEditTranslated(originalText.id, "")}
                                          variant="outline"
                                          size="sm"
                                          className="gap-2 h-8"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                          Add Translation
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apply Button */}
      {hasTranslated && allTranslated && (
        <div className="flex justify-center pt-6">
          <Button
            onClick={handleApply}
            size="lg"
            className="gap-2.5 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold shadow-md hover:shadow-glow-accent transition-all duration-300 h-12 md:h-14 text-base md:text-lg rounded-xl px-8"
            disabled={isApplying || !allTranslated}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Applying Translation to Image...
              </>
            ) : (
              <>
                <Languages className="w-5 h-5" />
                Apply Translation to Image
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

