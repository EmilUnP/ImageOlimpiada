import { useState } from "react";
import { ToolsSidebar, type AppTool } from "@/components/layout/ToolsSidebar";
import { EnhancementWorkflow } from "@/components/enhancement/EnhancementWorkflow";
import { TranslationWorkflow } from "@/components/translation/TranslationWorkflow";
import { Image as ImageIcon } from "lucide-react";

const Index = () => {
  const [selectedTool, setSelectedTool] = useState<AppTool>("enhance");

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
          <span className="font-semibold text-lg">AI Image Optimizer</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)]">
        <ToolsSidebar selected={selectedTool} onSelect={setSelectedTool} />

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <div key={selectedTool} className="max-w-6xl mx-auto animate-fade-in">
            {selectedTool === "enhance" ? <EnhancementWorkflow /> : <TranslationWorkflow />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
