import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "completed" | "current" | "upcoming";

export interface Step {
  number: number;
  label: string;
  status: StepStatus;
}

export const getStepStatus = (isCompleted: boolean, isCurrent: boolean): StepStatus =>
  isCompleted ? "completed" : isCurrent ? "current" : "upcoming";

interface StepIndicatorProps {
  steps: Step[];
  className?: string;
}

export const StepIndicator = ({ steps, className }: StepIndicatorProps) => {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="flex items-center justify-center min-w-max mx-auto px-2">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-semibold transition-all duration-300",
                  step.status === "completed" && "bg-primary text-primary-foreground",
                  step.status === "current" &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/15 shadow-sm",
                  step.status === "upcoming" && "bg-muted text-muted-foreground border border-border/80"
                )}
              >
                {step.status === "completed" ? <Check className="w-3.5 h-3.5" /> : step.number}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[10px] font-medium transition-colors whitespace-nowrap",
                  step.status === "current" && "text-primary font-semibold",
                  step.status !== "current" && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-8 sm:w-12 mx-1.5 mb-4 transition-colors duration-300",
                  step.status === "completed" ? "bg-primary/60" : "bg-border"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

