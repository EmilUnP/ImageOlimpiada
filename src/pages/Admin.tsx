import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Image as ImageIcon, Folder, X, Download } from "lucide-react";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/api";

interface ImageItem {
  filename: string;
  url: string;
  size: number;
  created: string;
  modified: string;
  mode?: string;
  stage?: string;
  targetLanguage?: string;
  type?: string;
  quality?: string;
  [key: string]: unknown;
}

export const Admin = () => {
  const API_URL = getApiUrl();
  const [selectedFolder, setSelectedFolder] = useState<'enhancement' | 'translation'>('enhancement');
  const [enhancementImages, setEnhancementImages] = useState<ImageItem[]>([]);
  const [translationImages, setTranslationImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadImages = async (folderType: 'enhancement' | 'translation') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/images/${folderType}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Admin API error response:', errorText);
        throw new Error(`Failed to load images: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Admin API returned non-JSON:', text.substring(0, 200));
        throw new Error('Server returned invalid response (not JSON)');
      }
      const data = await response.json();
      const images = data.images || [];
      
      if (folderType === 'enhancement') {
        setEnhancementImages(images);
      } else {
        setTranslationImages(images);
      }
    } catch (error) {
      console.error('Error loading images:', error);
      toast.error('Failed to load images');
      if (folderType === 'enhancement') {
        setEnhancementImages([]);
      } else {
        setTranslationImages([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Load images when folder changes or on mount
  useEffect(() => {
    loadImages(selectedFolder);
    // Also load the other folder in background
    const otherFolder = selectedFolder === 'enhancement' ? 'translation' : 'enhancement';
    loadImages(otherFolder);
  }, [selectedFolder]);

  const handleDelete = async (filename: string, folder: 'enhancement' | 'translation') => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    setDeleting(filename);
    try {
      const response = await fetch(
        `${API_URL}/api/admin/images/${folder}/${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete API error response:', errorText);
        throw new Error(`Failed to delete image: ${response.status}`);
      }

      toast.success('Image deleted successfully');
      loadImages(folder); // Reload images
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error('Failed to delete image');
    } finally {
      setDeleting(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-accent/5 p-4 md:p-8">
      {/* Background decorative elements */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2 pointer-events-none" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Enhanced Header */}
        <div className="mb-8 md:mb-12 text-center md:text-left">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-2xl blur-lg opacity-50" />
              <div className="relative p-3 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow">
                <Folder className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold gradient-text tracking-tight">
              Admin - Uploaded Images
            </h1>
          </div>
          <p className="text-lg md:text-xl text-muted-foreground font-light">View and manage uploaded images</p>
        </div>

        {/* Enhanced Folder Tabs */}
        <Tabs value={selectedFolder} onValueChange={(v) => setSelectedFolder(v as 'enhancement' | 'translation')} className="mb-8">
          <TabsList className="grid w-full max-w-lg grid-cols-2 bg-card/80 backdrop-blur-md border border-border/50 shadow-lg rounded-2xl p-1.5">
            <TabsTrigger 
              value="enhancement" 
              className="gap-2 rounded-xl font-semibold text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/90 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300"
            >
              <Folder className="w-5 h-5" />
              Enhancement ({enhancementImages.length})
            </TabsTrigger>
            <TabsTrigger 
              value="translation" 
              className="gap-2 rounded-xl font-semibold text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-accent data-[state=active]:to-accent/90 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300"
            >
              <Folder className="w-5 h-5" />
              Translation ({translationImages.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enhancement" className="mt-6">
            {loading && selectedFolder === 'enhancement' ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="mt-4 text-muted-foreground">Loading images...</p>
              </div>
            ) : enhancementImages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No images found in enhancement folder</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {enhancementImages.map((image) => (
                  <Card key={image.filename} className="overflow-hidden hover:shadow-2xl transition-all duration-500 hover-lift group border-border/50 rounded-2xl bg-gradient-to-br from-card/95 to-card/90 backdrop-blur-sm">
                    <div className="relative aspect-square bg-gradient-to-br from-muted/40 to-muted/20">
                      <img
                        src={image.url.startsWith('http') ? image.url : `${API_URL}${image.url}`}
                        alt={image.filename}
                        className="w-full h-full object-contain cursor-pointer transition-transform duration-500 group-hover:scale-105"
                        onClick={() => setSelectedImage(image)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-3 right-3 h-9 w-9 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(image.filename, 'enhancement');
                        }}
                        disabled={deleting === image.filename}
                      >
                        {deleting === image.filename ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold truncate mb-2" title={image.filename}>
                        {image.filename}
                      </p>
                      <div className="text-xs text-muted-foreground space-y-1.5">
                        <p className="font-medium">{formatFileSize(image.size)}</p>
                        {image.mode && <p>Mode: <span className="font-semibold">{image.mode}</span></p>}
                        {image.targetLanguage && <p>Language: <span className="font-semibold">{image.targetLanguage}</span></p>}
                        <p className="text-[10px] opacity-70">{formatDate(image.created)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="translation" className="mt-6">
            {loading && selectedFolder === 'translation' ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="mt-4 text-muted-foreground">Loading images...</p>
              </div>
            ) : translationImages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No images found in translation folder</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {translationImages.map((image) => (
                  <Card key={image.filename} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="relative aspect-square bg-muted/30">
                      <img
                        src={image.url.startsWith('http') ? image.url : `${API_URL}${image.url}`}
                        alt={image.filename}
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => setSelectedImage(image)}
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={() => handleDelete(image.filename, 'translation')}
                        disabled={deleting === image.filename}
                      >
                        {deleting === image.filename ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <CardContent className="p-3">
                      <p className="text-xs font-medium truncate mb-1" title={image.filename}>
                        {image.filename}
                      </p>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>{formatFileSize(image.size)}</p>
                        {image.stage && <p>Stage: {image.stage}</p>}
                        {image.targetLanguage && <p>Language: {image.targetLanguage}</p>}
                        <p className="text-[10px]">{formatDate(image.created)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Image Modal */}
        {selectedImage && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
            <div className="relative max-w-5xl max-h-[90vh] bg-card rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = selectedImage.url.startsWith('http') ? selectedImage.url : `${API_URL}${selectedImage.url}`;
                    link.download = selectedImage.filename;
                    link.click();
                  }}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    handleDelete(selectedImage.filename, selectedFolder);
                    setSelectedImage(null);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="icon" onClick={() => setSelectedImage(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <img
                src={selectedImage.url.startsWith('http') ? selectedImage.url : `${API_URL}${selectedImage.url}`}
                alt={selectedImage.filename}
                className="w-full h-full object-contain max-h-[90vh]"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-4">
                <p className="font-medium mb-2">{selectedImage.filename}</p>
                <div className="text-sm space-y-1">
                  <p>Size: {formatFileSize(selectedImage.size)}</p>
                  <p>Uploaded: {formatDate(selectedImage.created)}</p>
                  {selectedImage.mode && <p>Mode: {selectedImage.mode}</p>}
                  {selectedImage.stage && <p>Stage: {selectedImage.stage}</p>}
                  {selectedImage.targetLanguage && <p>Target Language: {selectedImage.targetLanguage}</p>}
                  {selectedImage.quality && <p>Quality: {selectedImage.quality}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

