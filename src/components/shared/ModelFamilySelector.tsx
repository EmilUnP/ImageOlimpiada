import { SegmentedControl } from "@/components/shared/SegmentedControl";
import type { ModelFamily } from "@/lib/api";

interface ModelFamilySelectorProps {
  options: Array<{ id: ModelFamily; label: string }>;
  value: ModelFamily;
  onChange: (value: ModelFamily) => void;
  disabled?: boolean;
}

export const ModelFamilySelector = ({
  options,
  value,
  onChange,
  disabled = false,
}: ModelFamilySelectorProps) => {
  if (options.length < 2) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">AI model</p>
      <SegmentedControl
        options={options.map(({ id, label }) => ({ id, label }))}
        value={value}
        onChange={onChange}
        disabled={disabled}
        stacked={false}
      />
      {value === "openai" && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          OCR & text via GPT-4o. Image enhance & translate via GPT Image (OpenRouter Image API).
        </p>
      )}
    </div>
  );
};
