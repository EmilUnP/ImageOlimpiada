import { useState, useEffect } from "react";
import { FunctionSelector } from "@/components/shared/FunctionSelector";
import { EnhancementWorkflow } from "@/components/enhancement/EnhancementWorkflow";
import { TranslationWorkflow } from "@/components/translation/TranslationWorkflow";
import { KeyboardShortcuts } from "@/components/shared/KeyboardShortcuts";
import { Sparkles, Image as ImageIcon } from "lucide-react";

type AppFunction = 'enhance' | 'translate' | null;

const Index = () => {
  const [selectedFunction, setSelectedFunction] = useState<AppFunction>(null);

  const handleFunctionSelect = (func: AppFunction) => {
    setSelectedFunction(func);
  };

  const handleBack = () => {
    setSelectedFunction(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to go back
      if (e.key === "Escape" && selectedFunction) {
        handleBack();
      }
      // Ctrl/Cmd + K to go to function selector
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (selectedFunction) {
          handleBack();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFunction]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced animated background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background/95 to-accent/5 animate-gradient pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(217,91%,35%,0.03),transparent_50%)] pointer-events-none" />
      
      {/* Enhanced decorative elements */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-float pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/8 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 animate-float pointer-events-none" style={{ animationDelay: '1s' }} />
      <div className="fixed top-1/2 left-1/2 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-float pointer-events-none" style={{ animationDelay: '2s' }} />
      
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 lg:py-16">
        {/* Enhanced Header */}
        <header className="text-center mb-12 md:mb-20 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1 hidden md:block" />
            <div className="flex items-center justify-center gap-5 md:gap-7 flex-1">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-3xl blur-2xl opacity-70 group-hover:opacity-100 animate-pulse-slow transition-opacity duration-500" />
                <div className="relative p-5 md:p-6 rounded-3xl bg-gradient-to-br from-primary via-primary/95 to-accent shadow-glow transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-glow-accent">
                  <ImageIcon className="w-8 h-8 md:w-10 md:h-10 text-primary-foreground relative z-10" />
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold gradient-text tracking-tight leading-tight">
                AI Image Optimizer
              </h1>
            </div>
            <div className="flex-1 flex justify-end hidden md:flex">
              <KeyboardShortcuts />
            </div>
          </div>
          <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-4xl mx-auto text-balance leading-relaxed px-4 font-light">
            Enhance image quality or translate text in images with AI-powered technology. Perfect for photos, documents, and multilingual content.
          </p>
          <div className="flex items-center justify-center gap-3 text-sm md:text-base text-muted-foreground pt-4">
            <div className="relative">
              <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-accent animate-pulse-slow relative z-10" />
              <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-primary absolute inset-0 opacity-60 animate-pulse-slow" style={{ animationDelay: '0.5s' }} />
            </div>
            <span className="font-semibold">Powered by Gemini AI</span>
          </div>
        </header>

        {/* Enhanced Main Content */}
        <main className="max-w-7xl mx-auto">
          <div className="relative">
            {/* Enhanced glassmorphism card */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/8 rounded-3xl blur-3xl animate-pulse-slow" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent rounded-3xl" />
            <div className="relative glass-enhanced rounded-3xl shadow-glow p-8 md:p-12 lg:p-16 border border-border/40 space-y-8 transition-all duration-700 animate-scale-in hover:shadow-glow-accent hover:border-border/60 hover:scale-[1.01]">
              {!selectedFunction ? (
                <div className="animate-slide-up">
                  <FunctionSelector onFunctionSelect={handleFunctionSelect} />
                </div>
              ) : selectedFunction === 'enhance' ? (
                <div className="animate-slide-in">
                  <EnhancementWorkflow onBack={handleBack} />
                </div>
              ) : (
                <div className="animate-slide-in">
                  <TranslationWorkflow onBack={handleBack} />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
