"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Copy,
  Sparkles,
  Twitter,
  Linkedin,
  Video,
  Instagram,
  Mail,
} from "lucide-react";
import { repurposeContent } from "@/actions/social";
import { toast } from "sonner";

interface RepurposedContent {
  twitterThread: string;
  linkedinPost: string;
  tiktokScript: string;
  instagramCaption: string;
  newsletterExtract: string;
}

const FORMAT_CARDS = [
  {
    key: "twitterThread" as const,
    label: "Thread X",
    icon: Twitter,
    color: "text-black",
    bgColor: "bg-black/5",
    borderColor: "border-black/10",
    badge: "X / Twitter",
  },
  {
    key: "linkedinPost" as const,
    label: "Post LinkedIn",
    icon: Linkedin,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-100",
    badge: "LinkedIn",
  },
  {
    key: "tiktokScript" as const,
    label: "Script TikTok",
    icon: Video,
    color: "text-pink-500",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-100",
    badge: "TikTok",
  },
  {
    key: "instagramCaption" as const,
    label: "Caption Instagram",
    icon: Instagram,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-100",
    badge: "Instagram",
  },
  {
    key: "newsletterExtract" as const,
    label: "Extrait Newsletter",
    icon: Mail,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-100",
    badge: "Newsletter",
  },
];

export function RepurposingTab() {
  const [article, setArticle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RepurposedContent | null>(null);

  const handleRepurpose = async () => {
    if (!article.trim()) {
      toast.error("Collez votre article d'abord");
      return;
    }
    if (article.trim().length < 100) {
      toast.error("L'article doit contenir au moins 100 caractères");
      return;
    }
    setIsLoading(true);
    try {
      const res = await repurposeContent(article.trim());
      if (res.success && res.data) {
        setResult(res.data);
        toast.success("5 formats générés !");
      } else {
        toast.error(res.error || "Erreur lors de la génération");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié !`);
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            Content Repurposing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Collez votre article, transcript ou contenu ici (minimum 100 caractères)..."
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            rows={6}
            className="bg-white/60 border-gray-200 resize-none text-gray-800 placeholder:text-gray-400"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{article.length} caractères</span>
            <Button
              onClick={handleRepurpose}
              disabled={isLoading || article.trim().length < 100}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Repurposer en 5 formats
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
          <p className="text-gray-500 font-medium">Génération des 5 formats en cours...</p>
          <p className="text-gray-400 text-sm">Thread X, LinkedIn, TikTok, Instagram, Newsletter</p>
        </div>
      )}

      {result && !isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FORMAT_CARDS.map(({ key, label, icon: Icon, color, bgColor, borderColor, badge }) => (
            <Card
              key={key}
              className={`bg-white/70 backdrop-blur-sm shadow-sm border ${borderColor}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${bgColor}`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <span className="font-medium text-gray-900 text-sm">{label}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">
                  {result[key]}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => copyToClipboard(result[key], label)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copier
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!result && !isLoading && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 mb-4">
            <Sparkles className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Transformez un article en 5 formats
          </h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Collez votre contenu ci-dessus et générez instantanément un Thread X, un post LinkedIn, un script TikTok, une caption Instagram et un extrait newsletter.
          </p>
          <p className="text-xs text-gray-400 mt-3">5 crédits par repurposing</p>
        </div>
      )}
    </div>
  );
}
