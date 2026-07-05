import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkflowHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  iconClassName?: string;
}

export const WorkflowHeader = ({ icon, title, subtitle, iconClassName }: WorkflowHeaderProps) => (
  <div className="flex items-start gap-3 animate-fade-in">
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        iconClassName ?? "bg-primary/10 text-primary"
      )}
    >
      {icon}
    </div>
    <div className="min-w-0 pt-0.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  </div>
);
