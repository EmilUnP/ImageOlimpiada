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
  processingLabel = "Processing…",
  emptyLabel = "Your result will appear here",
  onDownload,
  downloadLabel = "Download",
  className,
}: OutputPanelProps) => {
  return (
    <div className={cn("flex flex-col h-full min-h-[300px]", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>

      <div className="flex-1 rounded-xl border border-border/60 bg-muted/15 overflow-hidden relative min-h-[260px]">
        {isProcessing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
            </div>
            <p className="text-sm text-muted-foreground animate-pulse">{processingLabel}</p>
          </div>
        ) : image ? (
          <img
            src={image}
            alt="Output"
            className="w-full h-full object-contain animate-scale-in p-1"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-6 text-center">
            <div className="rounded-full bg-muted/50 p-3">
              <ImageIcon className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm max-w-[200px]">{emptyLabel}</p>
          </div>
        )}
      </div>

      {image && onDownload && !isProcessing && (
        <Button onClick={onDownload} className="mt-3 w-full gap-2" size="sm" variant="default">
          <Download className="h-4 w-4" />
          {downloadLabel}
        </Button>
      )}
    </div>
  );
};
