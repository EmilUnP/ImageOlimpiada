import { Sparkles, Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTool = "enhance" | "translate";

interface ToolsSidebarProps {
  selected: AppTool;
  onSelect: (tool: AppTool) => void;
}

const TOOLS = [
  {
    id: "enhance" as const,
    label: "Image Enhancement",
    description: "Clean old Russian book scans and exam questions",
    icon: Sparkles,
  },
  {
    id: "translate" as const,
    label: "Text Translation",
    description: "Translate question text on book pages",
    icon: Languages,
  },
];

export const ToolsSidebar = ({ selected, onSelect }: ToolsSidebarProps) => {
  return (
    <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="p-4 lg:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Tools
        </p>
        <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = selected === tool.id;

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelect(tool.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all min-w-[200px] lg:min-w-0 lg:w-full",
                  isActive
                    ? "border-primary/50 bg-primary/10 shadow-sm"
                    : "border-transparent hover:border-border/60 hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", isActive && "text-primary")}>
                    {tool.label}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
