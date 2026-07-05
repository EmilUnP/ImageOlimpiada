import { BackButton } from "@/components/shared/BackButton";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { ImageComparison } from "@/components/shared/ImageComparison";
import { useImageEnhancement } from "@/hooks/useImageEnhancement";
import { downloadImage } from "@/lib/utils";
import { toast } from "sonner";

const DEFAULT_MODE = "photo";
const DEFAULT_INTENSITY = "medium";

interface EnhancementWorkflowProps {
  onBack: () => void;
}

export const EnhancementWorkflow = ({ onBack }: EnhancementWorkflowProps) => {
  const {
    originalImage,
    enhancedImage,
    isProcessing,
    handleImageSelect,
  } = useImageEnhancement();

  const handleDownload = () => {
    if (!enhancedImage) return;
    downloadImage(enhancedImage, "enhanced-image.png");
    toast.success("Image downloaded!");
  };

  return (
    <>
      <BackButton onClick={onBack} variant="floating" />

      {!originalImage ? (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Enhance Your Image</h2>
            <p className="text-sm text-muted-foreground">
              Upload a photo and AI will improve its quality automatically
            </p>
          </div>
          <ImageUpload
            onImageSelect={(file) => handleImageSelect(file, DEFAULT_MODE, DEFAULT_INTENSITY)}
            disabled={isProcessing}
            label="Upload Image"
            description="Drag and drop or click to select an image"
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Your Enhanced Image</h2>
            <p className="text-sm text-muted-foreground">
              Compare the original with the enhanced result
            </p>
          </div>
          <ImageComparison
            originalImage={originalImage}
            enhancedImage={enhancedImage}
            isProcessing={isProcessing}
            onDownload={handleDownload}
            originalLabel="Original"
            processedLabel="Enhanced"
          />
        </div>
      )}
    </>
  );
};
