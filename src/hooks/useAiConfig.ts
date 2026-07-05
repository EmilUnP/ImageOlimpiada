import { useCallback, useEffect, useState } from "react";
import { fetchAiConfig, type AiConfigResponse, type ModelFamily } from "@/lib/api";

export const useAiConfig = () => {
  const [config, setConfig] = useState<AiConfigResponse | null>(null);
  const [modelFamily, setModelFamily] = useState<ModelFamily>("gemini");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchAiConfig();
        if (cancelled) return;
        setConfig(data);
        setModelFamily(data.defaultModelFamily);
      } catch (error) {
        console.warn("Failed to load AI config:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModelFamilyChange = useCallback((family: ModelFamily) => {
    setModelFamily(family);
  }, []);

  return {
    config,
    modelFamily,
    setModelFamily: handleModelFamilyChange,
    isLoading,
    showModelFamilySelector: config?.showModelFamilySelector ?? false,
    modelFamilyOptions: config?.modelFamilies ?? [],
  };
};
