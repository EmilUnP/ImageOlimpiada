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
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-center">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all duration-300",
                  step.status === "completed" &&
                    "bg-primary text-primary-foreground shadow-sm",
                  step.status === "current" &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-md scale-110",
                  step.status === "upcoming" &&
                    "bg-muted text-muted-foreground border-2 border-border"
                )}
              >
                {step.status === "completed" ? (
                  <Check className="w-4 h-4" />
                ) : (
                  step.number
                )}
              </div>
              {/* Step Label */}
              <span
                className={cn(
                  "mt-2 text-xs font-medium transition-colors whitespace-nowrap",
                  step.status === "current" && "text-primary font-semibold",
                  step.status === "completed" && "text-muted-foreground",
                  step.status === "upcoming" && "text-muted-foreground/60"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-12 mx-1 transition-all duration-300",
                  steps[index + 1]?.status === "upcoming" && step.status === "completed"
                    ? "bg-primary"
                    : step.status === "completed"
                    ? "bg-primary"
                    : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

