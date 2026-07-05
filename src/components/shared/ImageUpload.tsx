import { Upload, Image as ImageIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  compact?: boolean;
}

export const ImageUpload = ({
  onImageSelect,
  disabled,
  label = "Upload image",
  description = "Drag and drop or click to browse",
  compact = false,
}: ImageUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) onImageSelect(file);
    },
    [onImageSelect, disabled]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onImageSelect(file);
      e.target.value = "";
    },
    [onImageSelect]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      className={cn(
        "group relative rounded-xl border-2 border-dashed text-center transition-all duration-200 cursor-pointer",
        compact ? "p-6" : "p-8",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.005] shadow-md ring-2 ring-primary/15"
          : "border-border/50 bg-muted/20 hover:border-primary/40 hover:bg-muted/30",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        aria-label={label}
      />

      <div className="flex flex-col items-center gap-3 pointer-events-none">
        <div
          className={cn(
            "flex items-center justify-center rounded-xl transition-transform duration-200",
            compact ? "h-12 w-12" : "h-14 w-14",
            isDragging ? "bg-primary/15 scale-105" : "bg-primary/10 group-hover:scale-105"
          )}
        >
          {isDragging ? (
            <ImageIcon className={cn("text-primary", compact ? "h-5 w-5" : "h-6 w-6")} />
          ) : (
            <Upload className={cn("text-primary", compact ? "h-5 w-5" : "h-6 w-6")} />
          )}
        </div>

        <div className="space-y-1">
          <p className={cn("font-semibold", compact ? "text-sm" : "text-base")}>{label}</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">{description}</p>
          {isDragging ? (
            <p className="text-xs font-medium text-primary pt-1">Release to upload</p>
          ) : (
            <p className="text-[10px] text-muted-foreground/70 pt-0.5">JPG · PNG · WEBP</p>
          )}
        </div>
      </div>
    </div>
  );
};
