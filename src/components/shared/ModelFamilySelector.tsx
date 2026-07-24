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
          OCR & text via GPT. Image enhance & translate via GPT Image (OpenRouter Image API).
        </p>
      )}
      {value === "grok" && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Image enhance via Grok Imagine Quality (2K). OCR & text still use Gemini via OpenRouter.
        </p>
      )}
    </div>
  );
};
