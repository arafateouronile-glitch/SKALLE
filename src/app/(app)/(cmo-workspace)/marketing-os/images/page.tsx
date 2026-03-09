"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Download,
  Wand2,
  Palette,
  LayoutGrid,
  Zap,
} from "lucide-react";
import { generateAIImage, enhancePrompt } from "@/actions/images";
import { imageTemplates } from "@/lib/constants/images";
import { toast } from "sonner";
import { useCreditsContext } from "@/components/providers/credits-provider";
import Link from "next/link";

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: Date;
}

export default function ImagesPage() {
  const { isDepleted } = useCreditsContext();
  const [prompt, setPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState("minimal");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

  const styles = [
    { id: "minimal", name: "Minimal", icon: "⬜" },
    { id: "corporate", name: "Corporate", icon: "💼" },
    { id: "creative", name: "Créatif", icon: "🎨" },
    { id: "tech", name: "Tech", icon: "🔮" },
    { id: "nature", name: "Nature", icon: "🌿" },
  ];

  const handleTemplateSelect = (templateId: string) => {
    const template = imageTemplates.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setPrompt(template.prompt);
      setWidth(template.width);
      setHeight(template.height);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Veuillez entrer une description");
      return;
    }

    setIsGenerating(true);
    try {
      const enhancedPrompt = await enhancePrompt(prompt, selectedStyle);
      const result = await generateAIImage("workspace-id", enhancedPrompt, {
        width,
        height,
      });

      if (result.success && result.data) {
        const newImage: GeneratedImage = {
          id: Date.now().toString(),
          imageUrl: result.data.imageUrl,
          prompt: result.data.prompt,
          createdAt: new Date(),
        };
        setGeneratedImages([newImage, ...generatedImages]);
        toast.success("Image générée !");
      } else {
        toast.error(result.error || "Erreur lors de la génération");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Image téléchargée !");
    } catch {
      toast.error("Erreur lors du téléchargement");
    }
  };

  return (
    <div className="space-y-8">
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. La génération d&apos;images est désactivée.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <ImageIcon className="h-8 w-8 text-emerald-600" />
          Générateur d&apos;images
        </h1>
        <p className="text-gray-500 mt-2">
          Créez des visuels professionnels avec l&apos;IA
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Generator Panel */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-emerald-600" />
                Créer une image
              </CardTitle>
              <CardDescription className="text-gray-500">
                Décrivez l&apos;image que vous souhaitez générer
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Templates */}
              <div className="space-y-2">
                <Label className="text-gray-700">Templates rapides</Label>
                <div className="flex flex-wrap gap-2">
                  {imageTemplates.map((template) => (
                    <Button
                      key={template.id}
                      size="sm"
                      variant={
                        selectedTemplate === template.id ? "default" : "outline"
                      }
                      onClick={() => handleTemplateSelect(template.id)}
                      className={
                        selectedTemplate === template.id
                          ? "bg-emerald-600"
                          : "border-gray-200 text-gray-700 hover:bg-gray-100"
                      }
                    >
                      {template.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <Label className="text-gray-700">Description</Label>
                <Textarea
                  placeholder="Décrivez votre image en détail... Ex: Un header de blog moderne avec des formes géométriques abstraites et un dégradé violet"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                />
              </div>

              {/* Style Selection */}
              <div className="space-y-2">
                <Label className="text-gray-700">Style</Label>
                <div className="grid grid-cols-5 gap-2">
                  {styles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        selectedStyle === style.id
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-gray-200 bg-white/50 backdrop-blur-sm hover:border-gray-300"
                      }`}
                    >
                      <span className="text-2xl">{style.icon}</span>
                      <p className="text-xs text-gray-500 mt-1">{style.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700">Largeur (px)</Label>
                  <Select
                    value={width.toString()}
                    onValueChange={(v) => setWidth(parseInt(v))}
                  >
                    <SelectTrigger className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                      <SelectItem value="512">512</SelectItem>
                      <SelectItem value="768">768</SelectItem>
                      <SelectItem value="1024">1024</SelectItem>
                      <SelectItem value="1200">1200</SelectItem>
                      <SelectItem value="1584">1584</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Hauteur (px)</Label>
                  <Select
                    value={height.toString()}
                    onValueChange={(v) => setHeight(parseInt(v))}
                  >
                    <SelectTrigger className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                      <SelectItem value="396">396</SelectItem>
                      <SelectItem value="512">512</SelectItem>
                      <SelectItem value="630">630</SelectItem>
                      <SelectItem value="768">768</SelectItem>
                      <SelectItem value="1024">1024</SelectItem>
                      <SelectItem value="1080">1080</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || isDepleted}
                title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Générer l&apos;image
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-gray-400">
                <Zap className="h-3 w-3 inline mr-1" />
                1 crédit par génération
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Info Panel */}
        <div className="space-y-6">
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Palette className="h-5 w-5 text-emerald-600" />
                Conseils
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-500">
              <div className="flex items-start gap-2">
                <span className="text-emerald-600">•</span>
                <p>Soyez précis dans votre description</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-600">•</span>
                <p>Incluez les couleurs souhaitées</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-600">•</span>
                <p>Précisez le style (minimal, tech, etc.)</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-600">•</span>
                <p>Utilisez les templates pour démarrer</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-emerald-600" />
                Formats populaires
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Instagram Post", size: "1080 × 1080" },
                { name: "Blog Header", size: "1200 × 630" },
                { name: "LinkedIn Banner", size: "1584 × 396" },
                { name: "Twitter Post", size: "1024 × 512" },
              ].map((format) => (
                <div
                  key={format.name}
                  className="flex items-center justify-between p-2 rounded bg-white/50 backdrop-blur-sm"
                >
                  <span className="text-sm text-gray-700">{format.name}</span>
                  <Badge
                    variant="outline"
                    className="bg-gray-200/50 text-gray-500 border-gray-300"
                  >
                    {format.size}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Generated Images Gallery */}
      {generatedImages.length > 0 && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-900">Images générées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {generatedImages.map((image) => (
                <div
                  key={image.id}
                  className="relative group aspect-square rounded-lg overflow-hidden bg-white/60 backdrop-blur-sm shadow-sm"
                >
                  <img
                    src={image.imageUrl}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      onClick={() =>
                        handleDownload(image.imageUrl, `image-${image.id}.png`)
                      }
                      className="bg-white text-black hover:bg-gray-200"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Télécharger
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
