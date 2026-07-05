import type { ComponentType } from "react";
import AZ from "country-flag-icons/react/3x2/AZ";
import GB from "country-flag-icons/react/3x2/GB";
import RU from "country-flag-icons/react/3x2/RU";
import { cn } from "@/lib/utils";

const FLAGS: Record<string, ComponentType<{ title?: string; className?: string }>> = {
  GB,
  RU,
  AZ,
};

interface FlagIconProps {
  code: string;
  className?: string;
  title?: string;
}

export const FlagIcon = ({ code, className, title }: FlagIconProps) => {
  const Flag = FLAGS[code.toUpperCase()];
  if (!Flag) return null;

  return (
    <Flag
      title={title}
      className={cn("h-5 w-7 rounded-sm object-cover shadow-sm ring-1 ring-border/40", className)}
    />
  );
};
