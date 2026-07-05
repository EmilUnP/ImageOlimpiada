import { useState } from "react";
import { Link } from "react-router-dom";
import { ToolsSidebar, type AppTool } from "@/components/layout/ToolsSidebar";
import { EnhancementWorkflow } from "@/components/enhancement/EnhancementWorkflow";
import { TranslationWorkflow } from "@/components/translation/TranslationWorkflow";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Archive } from "lucide-react";

const Index = () => {
  const [selectedTool, setSelectedTool] = useState<AppTool>("enhance");

  return (
    <div className="min-h-screen app-shell">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/40 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-lg leading-tight block">AI Image Optimizer</span>
              <span className="text-xs text-muted-foreground hidden sm:block">
                Clean & translate exam book scans
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-2 shrink-0 text-muted-foreground" asChild>
            <Link to="/admin">
              <Archive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Archive</span>
            </Link>
          </Button>
        </div>
      </header>

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
