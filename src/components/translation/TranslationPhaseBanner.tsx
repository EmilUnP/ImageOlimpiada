import { cn } from "@/lib/utils";

interface TranslationPhaseBannerProps {
  step: number;
  title: string;
  description: string;
  className?: string;
}

export const TranslationPhaseBanner = ({
  step,
  title,
  description,
  className,
}: TranslationPhaseBannerProps) => (
  <div
    className={cn(
      "rounded-lg border border-border/60 bg-muted/30 px-4 py-3",
      className
    )}
  >
    <p className="text-xs font-medium text-primary uppercase tracking-wide">
      Step {step} of 3
    </p>
    <p className="text-sm font-semibold mt-0.5">{title}</p>
    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
  </div>
);
