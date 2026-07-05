import { cn } from "@/lib/utils";

interface OptionGridItem {
  id: string;
  name: string;
  emoji?: string;
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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center transition-all",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border/60 bg-card hover:border-primary/40 hover:bg-muted/40",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {item.emoji && <span className="text-xl mb-1">{item.emoji}</span>}
              <span className="text-xs font-medium">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
