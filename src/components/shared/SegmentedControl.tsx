import { cn } from "@/lib/utils";

interface SegmentedControlProps<T extends string> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) => {
  return (
    <div className="flex rounded-lg border border-border/60 bg-muted/30 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all",
            value === option.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
