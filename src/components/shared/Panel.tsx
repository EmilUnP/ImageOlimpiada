import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export const Panel = ({ children, className, title, description }: PanelProps) => (
  <section
    className={cn(
      "rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm shadow-sm transition-shadow hover:shadow-md/50",
      className
    )}
  >
    {(title || description) && (
      <div className="px-4 pt-4 pb-0">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    )}
    <div className={cn("p-4", (title || description) && "pt-3")}>{children}</div>
  </section>
);
