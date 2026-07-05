import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Languages } from "lucide-react";

type AppFunction = 'enhance' | 'translate' | null;

interface FunctionSelectorProps {
  onFunctionSelect: (func: AppFunction) => void;
}

export const FunctionSelector = ({ onFunctionSelect }: FunctionSelectorProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Choose Your Function</h2>
        <p className="text-muted-foreground text-sm">Select what you'd like to do with your images</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Image Quality Improver */}
        <Card 
          className="border hover:border-primary/60 transition-all duration-300 cursor-pointer group relative overflow-hidden hover:shadow-md"
          onClick={() => onFunctionSelect('enhance')}
        >
          <CardHeader className="pb-4">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <CardTitle className="text-xl font-bold mb-2">Image Quality Improver</CardTitle>
                <CardDescription className="text-sm">
                  Enhance image quality using AI. Improve sharpness, reduce noise, enhance colors, and restore old photos.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary text-xs font-bold">✓</span>
                </div>
                <span className="text-muted-foreground">Enhance photos, documents, and portraits</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary text-xs font-bold">✓</span>
                </div>
                <span className="text-muted-foreground">Multiple enhancement modes available</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary text-xs font-bold">✓</span>
                </div>
                <span className="text-muted-foreground">Adjustable intensity levels</span>
              </li>
            </ul>
            <Button 
              className="w-full"
              onClick={() => onFunctionSelect('enhance')}
            >
              Use Image Quality Improver
            </Button>
          </CardContent>
        </Card>

        {/* Text Translation */}
        <Card 
          className="border hover:border-accent/60 transition-all duration-300 cursor-pointer group relative overflow-hidden hover:shadow-md"
          onClick={() => onFunctionSelect('translate')}
        >
          <CardHeader className="pb-4">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <div className="p-3 rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
                  <Languages className="w-6 h-6 text-accent" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <CardTitle className="text-xl font-bold mb-2">Text Translation</CardTitle>
                <CardDescription className="text-sm">
                  Translate text on images to any language while keeping the original image quality and style intact.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                  <span className="text-accent text-xs font-bold">✓</span>
                </div>
                <span className="text-muted-foreground">Translate text in images to any language</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                  <span className="text-accent text-xs font-bold">✓</span>
                </div>
                <span className="text-muted-foreground">Preserves original image quality</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                  <span className="text-accent text-xs font-bold">✓</span>
                </div>
                <span className="text-muted-foreground">AI-powered translation</span>
              </li>
            </ul>
            <Button 
              className="w-full"
              onClick={() => onFunctionSelect('translate')}
            >
              Use Text Translation
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


