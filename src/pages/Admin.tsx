import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { ENHANCEMENT_STYLES, INTENSITY_OPTIONS, LANGUAGES } from "@/lib/constants";
import {
  Trash2,
  Image as ImageIcon,
  ArrowLeft,
  RefreshCw,
  Download,
  HardDrive,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Sparkles,
  Languages,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type FolderType = "enhancement" | "translation";
type SortOption = "newest" | "oldest" | "largest" | "smallest" | "name";
type DateRange = "all" | "today" | "week" | "month";
type ViewMode = "grid" | "list";

interface ImageItem {
  filename: string;
  url: string;
  size: number;
  created: string;
  modified: string;
  mode?: string;
  intensity?: string;
  stage?: string;
  targetLanguage?: string;
  type?: string;
  quality?: string;
  [key: string]: unknown;
}

interface AdminFilters {
  search: string;
  mode: string;
  intensity: string;
  language: string;
  stage: string;
  sort: SortOption;
  dateRange: DateRange;
}

const DEFAULT_FILTERS: AdminFilters = {
  search: "",
  mode: "all",
  intensity: "all",
  language: "all",
  stage: "all",
  sort: "newest",
  dateRange: "all",
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatRelativeDate = (dateString: string) => {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const resolveImageUrl = (url: string, apiUrl: string) =>
  url.startsWith("http") ? url : `${apiUrl}${url}`;

const getModeLabel = (mode?: string) =>
  ENHANCEMENT_STYLES.find((s) => s.id === mode)?.name ?? mode ?? "Unknown";

const getIntensityLabel = (intensity?: string) =>
  INTENSITY_OPTIONS.find((o) => o.id === intensity)?.label ?? intensity;

const getLanguageLabel = (code?: string) =>
  LANGUAGES.find((l) => l.code === code)?.name ?? code;

const matchesDateRange = (created: string, range: DateRange) => {
  if (range === "all") return true;
  const date = new Date(created);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === "today") return date >= startOfToday;
  if (range === "week") return date >= new Date(now.getTime() - 7 * 86_400_000);
  if (range === "month") return date >= new Date(now.getTime() - 30 * 86_400_000);
  return true;
};

const sortImages = (images: ImageItem[], sort: SortOption) => {
  const sorted = [...images];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    case "largest":
      return sorted.sort((a, b) => b.size - a.size);
    case "smallest":
      return sorted.sort((a, b) => a.size - b.size);
    case "name":
      return sorted.sort((a, b) => a.filename.localeCompare(b.filename));
    default:
      return sorted.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }
};

const filterImages = (images: ImageItem[], filters: AdminFilters) => {
  const query = filters.search.trim().toLowerCase();

  return images.filter((img) => {
    if (query) {
      const haystack = [
        img.filename,
        img.mode,
        img.intensity,
        img.stage,
        img.targetLanguage,
        img.quality,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.mode !== "all" && img.mode !== filters.mode) return false;
    if (filters.intensity !== "all" && img.intensity !== filters.intensity) return false;
    if (filters.language !== "all" && img.targetLanguage !== filters.language) return false;
    if (filters.stage !== "all" && img.stage !== filters.stage) return false;
    if (!matchesDateRange(img.created, filters.dateRange)) return false;
    return true;
  });
};

const uniqueValues = (images: ImageItem[], key: keyof ImageItem) =>
  [...new Set(images.map((img) => img[key]).filter((v): v is string => typeof v === "string" && v.length > 0))].sort();

const countActiveFilters = (filters: AdminFilters) => {
  let count = 0;
  if (filters.search.trim()) count++;
  if (filters.mode !== "all") count++;
  if (filters.intensity !== "all") count++;
  if (filters.language !== "all") count++;
  if (filters.stage !== "all") count++;
  if (filters.dateRange !== "all") count++;
  return count;
};

export const Admin = () => {
  const API_URL = getApiUrl();
  const [selectedFolder, setSelectedFolder] = useState<FolderType>("enhancement");
  const [imagesByFolder, setImagesByFolder] = useState<Record<FolderType, ImageItem[]>>({
    enhancement: [],
    translation: [],
  });
  const [loadingFolder, setLoadingFolder] = useState<FolderType | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filters, setFilters] = useState<AdminFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const updateFilter = <K extends keyof AdminFilters>(key: K, value: AdminFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const loadImages = useCallback(
    async (folderType: FolderType, silent = false) => {
      if (!silent) setLoadingFolder(folderType);
      try {
        const response = await fetch(`${API_URL}/api/admin/images/${folderType}`);
        if (!response.ok) throw new Error(`Failed to load: ${response.status}`);

        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          throw new Error("Invalid server response");
        }

        const data = await response.json();
        setImagesByFolder((prev) => ({
          ...prev,
          [folderType]: data.images || [],
        }));
      } catch (error) {
        console.error("Error loading images:", error);
        toast.error("Failed to load images");
        setImagesByFolder((prev) => ({ ...prev, [folderType]: [] }));
      } finally {
        if (!silent) setLoadingFolder(null);
      }
    },
    [API_URL]
  );

  const refreshAll = useCallback(() => {
    loadImages("enhancement");
    loadImages("translation");
  }, [loadImages]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
    setSelectedImage(null);
    setSelectionMode(false);
    setSelectedFilenames(new Set());
  }, [selectedFolder]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedFilenames(new Set());
  }, []);

  const toggleSelection = useCallback((filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFilenames(new Set());
  }, []);

  const deleteOne = async (filename: string, folder: FolderType) => {
    const response = await fetch(
      `${API_URL}/api/admin/images/${folder}/${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    );
    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
  };

  const handleDelete = async (filename: string, folder: FolderType) => {
    if (!confirm(`Delete ${filename}?`)) return;

    setDeleting(filename);
    try {
      await deleteOne(filename, folder);
      toast.success("Image deleted");
      if (selectedImage?.filename === filename) setSelectedImage(null);
      setSelectedFilenames((prev) => {
        if (!prev.has(filename)) return prev;
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
      loadImages(folder, true);
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Failed to delete image");
    } finally {
      setDeleting(null);
    }
  };

  const allImages = imagesByFolder[selectedFolder];
  const isLoading = loadingFolder === selectedFolder;
  const activeFilterCount = countActiveFilters(filters);

  const filterOptions = useMemo(() => ({
    modes: uniqueValues(allImages, "mode"),
    intensities: uniqueValues(allImages, "intensity"),
    languages: uniqueValues(allImages, "targetLanguage"),
    stages: uniqueValues(allImages, "stage"),
  }), [allImages]);

  const filteredImages = useMemo(
    () => sortImages(filterImages(allImages, filters), filters.sort),
    [allImages, filters]
  );

  const filteredSize = useMemo(
    () => filteredImages.reduce((sum, img) => sum + img.size, 0),
    [filteredImages]
  );

  const selectedCount = selectedFilenames.size;
  const allFilteredSelected =
    filteredImages.length > 0 && filteredImages.every((img) => selectedFilenames.has(img.filename));
  const someFilteredSelected = filteredImages.some((img) => selectedFilenames.has(img.filename));
  const selectAllState: boolean | "indeterminate" = allFilteredSelected
    ? true
    : someFilteredSelected
      ? "indeterminate"
      : false;

  const selectAllFiltered = useCallback(() => {
    setSelectedFilenames(new Set(filteredImages.map((img) => img.filename)));
  }, [filteredImages]);

  const handleSelectAllToggle = useCallback(() => {
    if (allFilteredSelected) clearSelection();
    else selectAllFiltered();
  }, [allFilteredSelected, clearSelection, selectAllFiltered]);

  useEffect(() => {
    const visible = new Set(filteredImages.map((img) => img.filename));
    setSelectedFilenames((prev) => {
      const pruned = [...prev].filter((name) => visible.has(name));
      if (pruned.length === prev.size) return prev;
      return new Set(pruned);
    });
  }, [filteredImages]);

  const selectedImagesList = useMemo(
    () => filteredImages.filter((img) => selectedFilenames.has(img.filename)),
    [filteredImages, selectedFilenames]
  );

  const handleBulkDelete = async () => {
    const toDelete = selectedImagesList.map((img) => img.filename);
    if (toDelete.length === 0) return;

    setBulkDeleting(true);
    setBulkDeleteOpen(false);
    const toastId = toast.loading(`Deleting ${toDelete.length} image${toDelete.length === 1 ? "" : "s"}…`);

    let succeeded = 0;
    let failed = 0;

    const batchSize = 5;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((filename) => deleteOne(filename, selectedFolder))
      );
      results.forEach((r) => (r.status === "fulfilled" ? succeeded++ : failed++));
    }

    toast.dismiss(toastId);
    if (failed === 0) {
      toast.success(`Deleted ${succeeded} image${succeeded === 1 ? "" : "s"}`);
    } else {
      toast.error(`Deleted ${succeeded}, failed ${failed}`);
    }

    if (selectedImage && toDelete.includes(selectedImage.filename)) setSelectedImage(null);
    exitSelectionMode();
    await loadImages(selectedFolder, true);
    setBulkDeleting(false);
  };

  const handleBulkDownload = async () => {
    const items = selectedImagesList;
    if (items.length === 0) return;

    toast.info(`Downloading ${items.length} file${items.length === 1 ? "" : "s"}…`);

    for (let i = 0; i < items.length; i++) {
      const link = document.createElement("a");
      link.href = resolveImageUrl(items[i].url, API_URL);
      link.download = items[i].filename;
      link.click();
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };

  const handleItemClick = (image: ImageItem) => {
    if (selectionMode) {
      toggleSelection(image.filename);
      return;
    }
    setSelectedImage(image);
  };

  const selectedIndex = selectedImage
    ? filteredImages.findIndex((img) => img.filename === selectedImage.filename)
    : -1;

  const navigatePreview = (direction: -1 | 1) => {
    if (selectedIndex < 0 || filteredImages.length === 0) return;
    const nextIndex = (selectedIndex + direction + filteredImages.length) % filteredImages.length;
    setSelectedImage(filteredImages[nextIndex]);
  };

  const metaBadges = (image: ImageItem) => {
    const badges: { label: string; variant?: "default" | "secondary" | "outline" }[] = [];
    if (image.mode) badges.push({ label: getModeLabel(image.mode), variant: "secondary" });
    if (image.intensity) badges.push({ label: getIntensityLabel(image.intensity), variant: "outline" });
    if (image.targetLanguage) badges.push({ label: getLanguageLabel(image.targetLanguage), variant: "secondary" });
    if (image.stage) badges.push({ label: image.stage.replace(/-/g, " "), variant: "outline" });
    if (image.quality) badges.push({ label: image.quality, variant: "outline" });
    return badges;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/30 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" asChild>
              <Link to="/" aria-label="Back to app">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="font-semibold text-lg leading-tight">Upload archive</h1>
              <p className="text-xs text-muted-foreground truncate">
                Browse, filter, and manage saved outputs
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={refreshAll}
            disabled={loadingFolder !== null}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingFolder && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <main className={cn(
        "max-w-6xl mx-auto p-4 lg:p-6 space-y-4",
        selectionMode && selectedCount > 0 && "pb-24"
      )}>
        {/* Folder tabs + summary stats */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="w-full sm:max-w-sm">
              <SegmentedControl<FolderType>
                options={[
                  {
                    id: "enhancement",
                    label: `Enhance (${imagesByFolder.enhancement.length})`,
                    icon: <Sparkles className="h-3.5 w-3.5" />,
                  },
                  {
                    id: "translation",
                    label: `Translate (${imagesByFolder.translation.length})`,
                    icon: <Languages className="h-3.5 w-3.5" />,
                  },
                ]}
                value={selectedFolder}
                onChange={setSelectedFolder}
                disabled={loadingFolder !== null}
                stacked={false}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:ml-auto text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5">
                <span className="text-muted-foreground">Showing </span>
                <span className="font-medium">{filteredImages.length}</span>
                <span className="text-muted-foreground"> of {allImages.length}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5" />
                {formatFileSize(filteredSize)}
                {filteredImages.length !== allImages.length && (
                  <span className="text-xs">/ {formatFileSize(allImages.reduce((s, i) => s + i.size, 0))}</span>
                )}
              </div>
            </div>
          </div>

          {/* Search + filters toolbar */}
          {!isLoading && allImages.length > 0 && (
            <Card className="border-border/60 bg-card/40">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search filename or metadata…"
                      value={filters.search}
                      onChange={(e) => updateFilter("search", e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isLoading && filteredImages.length > 0 && (
                      <Button
                        variant={selectionMode ? "secondary" : "outline"}
                        size="sm"
                        className="gap-1.5 h-9"
                        onClick={() => {
                          if (selectionMode) exitSelectionMode();
                          else setSelectionMode(true);
                        }}
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                        {selectionMode ? "Cancel" : "Select"}
                      </Button>
                    )}
                    <div className="flex rounded-lg border border-border/60 p-0.5">
                      <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setViewMode("grid")}
                        aria-label="Grid view"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setViewMode("list")}
                        aria-label="List view"
                      >
                        <List className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={clearFilters}>
                        <X className="h-3.5 w-3.5" />
                        Clear ({activeFilterCount})
                      </Button>
                    )}
                  </div>
                </div>

                {selectionMode && filteredImages.length > 0 && (
                  <div className="flex items-center gap-3 pt-1 border-t border-border/40">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={selectAllState}
                        onCheckedChange={handleSelectAllToggle}
                        aria-label="Select all visible"
                      />
                      <span className="text-xs font-medium">
                        {allFilteredSelected ? "Deselect all" : "Select all"}
                        <span className="text-muted-foreground font-normal">
                          {" "}({filteredImages.length} visible)
                        </span>
                      </span>
                    </label>
                    {selectedCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedCount} selected · {formatFileSize(selectedImagesList.reduce((s, i) => s + i.size, 0))}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {selectedFolder === "enhancement" && filterOptions.modes.length > 0 && (
                    <Select value={filters.mode} onValueChange={(v) => updateFilter("mode", v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All modes</SelectItem>
                        {filterOptions.modes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {getModeLabel(mode)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {selectedFolder === "enhancement" && filterOptions.intensities.length > 0 && (
                    <Select value={filters.intensity} onValueChange={(v) => updateFilter("intensity", v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Intensity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All intensities</SelectItem>
                        {filterOptions.intensities.map((intensity) => (
                          <SelectItem key={intensity} value={intensity}>
                            {getIntensityLabel(intensity)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {selectedFolder === "translation" && filterOptions.languages.length > 0 && (
                    <Select value={filters.language} onValueChange={(v) => updateFilter("language", v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All languages</SelectItem>
                        {filterOptions.languages.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {getLanguageLabel(lang)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {selectedFolder === "translation" && filterOptions.stages.length > 0 && (
                    <Select value={filters.stage} onValueChange={(v) => updateFilter("stage", v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All stages</SelectItem>
                        {filterOptions.stages.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage.replace(/-/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={filters.dateRange} onValueChange={(v) => updateFilter("dateRange", v as DateRange)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Last 7 days</SelectItem>
                      <SelectItem value="month">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filters.sort} onValueChange={(v) => updateFilter("sort", v as SortOption)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                      <SelectItem value="largest">Largest first</SelectItem>
                      <SelectItem value="smallest">Smallest first</SelectItem>
                      <SelectItem value="name">Name A–Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin mb-3 opacity-50" />
            <p className="text-sm">Loading images…</p>
          </div>
        ) : allImages.length === 0 ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-medium text-sm">No uploads yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Images saved during {selectedFolder === "enhancement" ? "enhancement" : "translation"}{" "}
                will appear here.
              </p>
              <Button variant="outline" size="sm" className="mt-5" asChild>
                <Link to="/">Go to workspace</Link>
              </Button>
            </CardContent>
          </Card>
        ) : filteredImages.length === 0 ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-9 w-9 text-muted-foreground/40 mb-3" />
              <p className="font-medium text-sm">No matches</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Try adjusting your search or filters.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredImages.map((image) => {
              const isSelected = selectedFilenames.has(image.filename);
              return (
              <Card
                key={image.filename}
                className={cn(
                  "group overflow-hidden border-border/60 bg-card/50 hover:border-border hover:shadow-sm transition-all",
                  selectionMode && isSelected && "ring-2 ring-primary border-primary/50"
                )}
              >
                <div className="relative aspect-square w-full bg-muted/20">
                  {selectionMode && (
                    <div
                      className="absolute top-2 left-2 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(image.filename)}
                        aria-label={`Select ${image.filename}`}
                        className="bg-background/90 border-background shadow-sm"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    className="relative w-full h-full flex items-center justify-center overflow-hidden"
                    onClick={() => handleItemClick(image)}
                  >
                    <img
                      src={resolveImageUrl(image.url, API_URL)}
                      alt={image.filename}
                      className="max-h-full max-w-full object-contain p-2"
                      loading="lazy"
                    />
                    {!selectionMode && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-white/90">{formatRelativeDate(image.created)}</span>
                      </div>
                    )}
                  </button>
                </div>
                <CardContent className="p-2.5 space-y-2">
                  <p className="text-xs font-medium truncate" title={image.filename}>
                    {image.filename}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {metaBadges(image).slice(0, 2).map((badge) => (
                      <Badge key={badge.label} variant={badge.variant} className="text-[9px] px-1.5 py-0 font-normal">
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">{formatFileSize(image.size)}</span>
                    {!selectionMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(image.filename, selectedFolder)}
                        disabled={deleting === image.filename}
                        aria-label="Delete image"
                      >
                        {deleting === image.filename ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 divide-y divide-border/60 overflow-hidden bg-card/40">
            {filteredImages.map((image) => {
              const isSelected = selectedFilenames.has(image.filename);
              return (
              <div
                key={image.filename}
                className={cn(
                  "group flex items-center gap-3 p-2 sm:p-3 hover:bg-muted/30 transition-colors",
                  selectionMode && isSelected && "bg-primary/5"
                )}
              >
                {selectionMode ? (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection(image.filename)}
                    aria-label={`Select ${image.filename}`}
                    className="shrink-0 ml-1"
                  />
                ) : null}
                <button
                  type="button"
                  className="shrink-0 h-14 w-14 rounded-lg bg-muted/30 overflow-hidden flex items-center justify-center"
                  onClick={() => handleItemClick(image)}
                >
                  <img
                    src={resolveImageUrl(image.url, API_URL)}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                </button>
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => handleItemClick(image)}
                >
                  <p className="text-sm font-medium truncate">{image.filename}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    {metaBadges(image).map((badge) => (
                      <Badge key={badge.label} variant={badge.variant} className="text-[10px] font-normal">
                        {badge.label}
                      </Badge>
                    ))}
                    <span className="text-xs text-muted-foreground">{formatFileSize(image.size)}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeDate(image.created)}</span>
                  </div>
                </button>
                {!selectionMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = resolveImageUrl(image.url, API_URL);
                        link.download = image.filename;
                        link.click();
                      }}
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(image.filename, selectedFolder)}
                      disabled={deleting === image.filename}
                      aria-label="Delete"
                    >
                      {deleting === image.filename ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </main>

      {/* Bulk action bar */}
      {selectionMode && selectedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">{selectedCount}</span>
              <span className="text-muted-foreground">
                {" "}selected · {formatFileSize(selectedImagesList.reduce((s, i) => s + i.size, 0))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleBulkDownload}
                disabled={bulkDeleting}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} image{selectedCount === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This permanently removes the selected files from storage. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-2" />
                  Deleting…
                </>
              ) : (
                `Delete ${selectedCount}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          {selectedImage && (
            <>
              <div className="relative bg-muted/30 flex items-center justify-center min-h-[200px] max-h-[60vh] p-4">
                {filteredImages.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-md z-10"
                      onClick={() => navigatePreview(-1)}
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-md z-10"
                      onClick={() => navigatePreview(1)}
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <img
                  src={resolveImageUrl(selectedImage.url, API_URL)}
                  alt={selectedImage.filename}
                  className="max-h-[56vh] max-w-full object-contain"
                />
                {filteredImages.length > 1 && selectedIndex >= 0 && (
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
                    {selectedIndex + 1} / {filteredImages.length}
                  </span>
                )}
              </div>
              <div className="p-4 sm:p-5 border-t border-border/60 space-y-3">
                <DialogHeader className="text-left space-y-2">
                  <DialogTitle className="text-base font-medium truncate pr-8">
                    {selectedImage.filename}
                  </DialogTitle>
                  <DialogDescription asChild>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedImage.size)} · {formatDate(selectedImage.created)}
                      </p>
                      {metaBadges(selectedImage).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {metaBadges(selectedImage).map((badge) => (
                            <Badge key={badge.label} variant={badge.variant} className="text-xs font-normal">
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = resolveImageUrl(selectedImage.url, API_URL);
                      link.download = selectedImage.filename;
                      link.click();
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDelete(selectedImage.filename, selectedFolder)}
                    disabled={deleting === selectedImage.filename}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
