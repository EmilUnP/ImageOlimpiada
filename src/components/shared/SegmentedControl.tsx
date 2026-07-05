import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Stack icon above label (default). Set false for inline layout. */
  stacked?: boolean;
}

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  stacked = true,
}: SegmentedControlProps<T>) => {
  return (
    <div
      className="flex rounded-xl border border-border/60 bg-muted/25 p-1 gap-1"
      role="tablist"
    >
      {options.map((option) => {
        const isSelected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex-1 rounded-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              stacked ? "flex flex-col items-center gap-1 py-2 px-2" : "flex items-center justify-center gap-2 py-2 px-3",
              isSelected
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/40"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {option.icon && (
              <span className={cn("shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}>
                {option.icon}
              </span>
            )}
            <span className="text-[11px] font-medium leading-none tracking-wide">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
