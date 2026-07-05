import { Download, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OutputPanelProps {
  title?: string;
  description?: string;
  image: string | null;
  isProcessing?: boolean;
  processingLabel?: string;
  emptyLabel?: string;
  onDownload?: () => void;
  downloadLabel?: string;
  className?: string;
}

export const OutputPanel = ({
  title = "Output",
  description,
  image,
  isProcessing = false,
  processingLabel = "Processing...",
  emptyLabel = "Your result will appear here",
  onDownload,
  downloadLabel = "Download",
  className,
}: OutputPanelProps) => {
  return (
    <div className={cn("flex flex-col h-full min-h-[320px]", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <div className="flex-1 rounded-xl border border-border/60 bg-muted/20 overflow-hidden relative min-h-[280px]">
        {isProcessing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">{processingLabel}</p>
          </div>
        ) : image ? (
          <img src={image} alt="Output" className="w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-6 text-center">
            <ImageIcon className="h-10 w-10 opacity-40" />
            <p className="text-sm">{emptyLabel}</p>
          </div>
        )}
      </div>

      {image && onDownload && !isProcessing && (
        <Button onClick={onDownload} className="mt-3 w-full gap-2" size="sm">
          <Download className="h-4 w-4" />
          {downloadLabel}
        </Button>
      )}
    </div>
  );
};
