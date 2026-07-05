import { FlagIcon } from "@/components/shared/FlagIcon";
import { cn } from "@/lib/utils";

interface OptionGridItem {
  id: string;
  name: string;
  emoji?: string;
  flagCode?: string;
}

interface OptionGridProps {
  title: string;
  items: OptionGridItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export const OptionGrid = ({
  title,
  items,
  selectedId,
  onSelect,
  disabled = false,
}: OptionGridProps) => {
  return (
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/25 scale-[1.02]"
                  : "border-border/50 bg-card/80 hover:border-primary/30 hover:bg-muted/40",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {item.flagCode ? (
                <FlagIcon code={item.flagCode} title={item.name} className="mb-1 h-5 w-8" />
              ) : item.emoji ? (
                <span className="text-lg mb-0.5 leading-none">{item.emoji}</span>
              ) : null}
              <span className="text-[11px] font-medium leading-tight">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
