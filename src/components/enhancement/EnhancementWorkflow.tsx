import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { OptionGrid } from "@/components/shared/OptionGrid";
import { Panel } from "@/components/shared/Panel";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { IntensityBars } from "@/components/shared/IntensityBars";
import { OutputPanel } from "@/components/shared/OutputPanel";
import { WorkflowHeader } from "@/components/shared/WorkflowHeader";
import { ModelFamilySelector } from "@/components/shared/ModelFamilySelector";
import { useImageEnhancement } from "@/hooks/useImageEnhancement";
import { ENHANCEMENT_STYLES, INTENSITY_OPTIONS } from "@/lib/constants";
import { downloadImage } from "@/lib/utils";
import { toast } from "sonner";
import type { ModelFamily } from "@/lib/api";

interface EnhancementWorkflowProps {
  modelFamily?: ModelFamily;
  onModelFamilyChange?: (family: ModelFamily) => void;
  showModelFamilySelector?: boolean;
  modelFamilyOptions?: Array<{ id: ModelFamily; label: string }>;
}

export const EnhancementWorkflow = ({
  modelFamily,
  onModelFamilyChange,
  showModelFamilySelector = false,
  modelFamilyOptions = [],
}: EnhancementWorkflowProps) => {
  const [mode, setMode] = useState("textbook");
  const [intensity, setIntensity] = useState("medium");

  const { enhancedImage, isProcessing, handleImageSelect } = useImageEnhancement();

  const selectedStyle = ENHANCEMENT_STYLES.find((s) => s.id === mode);
  const intensityLabel = INTENSITY_OPTIONS.find((i) => i.id === intensity)?.label.toLowerCase();

  const handleDownload = () => {
    if (!enhancedImage) return;
    downloadImage(enhancedImage, "enhanced-image.png");
    toast.success("Image downloaded");
  };

  return (
    <div className="space-y-5">
      <WorkflowHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="Image Enhancement"
        subtitle={`${selectedStyle?.name ?? "Book question"} · ${intensityLabel ?? "balanced"} intensity`}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[200px_minmax(0,1fr)_minmax(240px,300px)] gap-4">
        <Panel>
          <OptionGrid
            title="Style"
            items={ENHANCEMENT_STYLES.map(({ id, name, emoji }) => ({ id, name, emoji }))}
            selectedId={mode}
            onSelect={setMode}
            disabled={isProcessing}
          />
        </Panel>

        <Panel title="Workspace" description="Upload a scanned page to enhance">
          <div className="space-y-4">
            {showModelFamilySelector && modelFamily && onModelFamilyChange && (
              <ModelFamilySelector
                options={modelFamilyOptions}
                value={modelFamily}
                onChange={onModelFamilyChange}
                disabled={isProcessing}
              />
            )}

            <ImageUpload
              onImageSelect={(file) => handleImageSelect(file, mode, intensity, modelFamily)}
              disabled={isProcessing}
              label="Upload book page"
              description="Any subject — full page or cropped question"
            />

            <div className="space-y-2 pt-1 border-t border-border/40">
              <p className="text-xs font-medium text-muted-foreground">Enhancement strength</p>
              <SegmentedControl
                options={INTENSITY_OPTIONS.map(({ id, label, level }) => ({
                  id,
                  label,
                  icon: <IntensityBars level={level} />,
                }))}
                value={intensity}
                onChange={setIntensity}
                disabled={isProcessing}
              />
            </div>
          </div>
        </Panel>

        <Panel>
          <OutputPanel
            description={selectedStyle?.description}
            image={enhancedImage}
            isProcessing={isProcessing}
            processingLabel="Enhancing your image…"
            emptyLabel="Upload an image to see the result"
            onDownload={enhancedImage ? handleDownload : undefined}
          />
        </Panel>
      </div>
    </div>
  );
};
