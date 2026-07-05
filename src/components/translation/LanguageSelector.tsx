import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES } from "@/lib/constants";

interface LanguageSelectorProps {
  language: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

export const LanguageSelector = ({
  language,
  onLanguageChange,
  disabled = false,
}: LanguageSelectorProps) => {
  return (
    <div className="space-y-2 max-w-xs mx-auto">
      <Label htmlFor="language-select" className="text-sm font-medium">
        Translate to
      </Label>
      <Select value={language} onValueChange={onLanguageChange} disabled={disabled}>
        <SelectTrigger id="language-select" className="w-full">
          <SelectValue placeholder="Select a language" />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
