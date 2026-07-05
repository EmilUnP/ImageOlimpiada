import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { OptionGrid } from "@/components/shared/OptionGrid";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { OutputPanel } from "@/components/shared/OutputPanel";
import { useImageEnhancement } from "@/hooks/useImageEnhancement";
import { ENHANCEMENT_STYLES, INTENSITY_OPTIONS } from "@/lib/constants";
import { downloadImage } from "@/lib/utils";
import { toast } from "sonner";

export const EnhancementWorkflow = () => {
  const [mode, setMode] = useState("textbook");
  const [intensity, setIntensity] = useState("medium");

  const { enhancedImage, isProcessing, handleImageSelect } = useImageEnhancement();

  const selectedStyle = ENHANCEMENT_STYLES.find((s) => s.id === mode);

  const handleDownload = () => {
    if (!enhancedImage) return;
    downloadImage(enhancedImage, "enhanced-image.png");
    toast.success("Image downloaded!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Image Enhancement</h1>
          <p className="text-sm text-muted-foreground">
            Clean up old book scans · {selectedStyle?.name} · {INTENSITY_OPTIONS.find((i) => i.id === intensity)?.label.toLowerCase()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_minmax(260px,320px)] gap-5">
        <section className="rounded-xl border border-border/60 bg-card/50 p-4">
          <OptionGrid
            title="Styles"
            items={ENHANCEMENT_STYLES.map(({ id, name, emoji }) => ({ id, name, emoji }))}
            selectedId={mode}
            onSelect={setMode}
            disabled={isProcessing}
          />
        </section>

        <section className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-5">
          <div>
            <h3 className="text-sm font-semibold mb-3">Workspace</h3>
            <ImageUpload
              onImageSelect={(file) => handleImageSelect(file, mode, intensity)}
              disabled={isProcessing}
              label="Upload book page"
              description="Scanned question from math, physics, chemistry, or history"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Intensity</p>
            <SegmentedControl
              options={INTENSITY_OPTIONS.map(({ id, label }) => ({ id, label }))}
              value={intensity}
              onChange={setIntensity}
              disabled={isProcessing}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-card/50 p-4">
          <OutputPanel
            description={selectedStyle?.description}
            image={enhancedImage}
            isProcessing={isProcessing}
            processingLabel="Enhancing your image..."
            emptyLabel="Upload an image to see the result"
            onDownload={enhancedImage ? handleDownload : undefined}
          />
        </section>
      </div>
    </div>
  );
};
