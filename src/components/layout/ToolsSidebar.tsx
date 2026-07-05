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
    label: "Enhancement",
    description: "Clean old Russian book scans",
    icon: Sparkles,
  },
  {
    id: "translate" as const,
    label: "Translation",
    description: "Translate question text on pages",
    icon: Languages,
  },
];

export const ToolsSidebar = ({ selected, onSelect }: ToolsSidebarProps) => {
  return (
    <aside className="w-full lg:w-56 xl:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-border/60 bg-card/30 backdrop-blur-sm lg:sticky lg:top-[57px] lg:self-start lg:max-h-[calc(100vh-57px)] lg:overflow-y-auto">
      <div className="p-4 lg:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5 px-1">
          Tools
        </p>
        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-1 px-1">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = selected === tool.id;

              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onSelect(tool.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200 min-w-[160px] lg:min-w-0 lg:w-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                      : "text-foreground hover:bg-muted/60"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{tool.label}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 hidden lg:block">
                      {tool.description}
                    </p>
                  </div>
                </button>
              );
            })}
        </nav>
      </div>
    </aside>
  );
};
