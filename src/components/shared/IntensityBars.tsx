import { cn } from "@/lib/utils";

interface IntensityBarsProps {
  level: 1 | 2 | 3;
  className?: string;
}

const BAR_HEIGHTS = ["h-1", "h-1.5", "h-2.5"] as const;

export const IntensityBars = ({ level, className }: IntensityBarsProps) => (
  <div
    className={cn("flex items-end justify-center gap-[3px] h-3 w-[18px]", className)}
    aria-hidden
  >
    {BAR_HEIGHTS.map((height, index) => (
      <div
        key={index}
        className={cn(
          "w-[3px] rounded-full bg-current transition-opacity",
          height,
          index < level ? "opacity-100" : "opacity-20"
        )}
      />
    ))}
  </div>
);
