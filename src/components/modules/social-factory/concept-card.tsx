"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Linkedin,
  Twitter,
  Instagram,
  Video,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import type { PostType } from "@prisma/client";
import type { ConceptCategory } from "@/lib/services/social/content-factory";

const CATEGORY_CONFIG: Record<ConceptCategory, { label: string; color: string }> = {
  education: { label: "Éducation", color: "bg-green-100 text-green-800 border-green-200" },
  conversion: { label: "Conversion", color: "bg-orange-100 text-orange-800 border-orange-200" },
  awareness: { label: "Notoriété", color: "bg-blue-100 text-blue-800 border-blue-200" },
};

const NETWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LINKEDIN: Linkedin,
  X: Twitter,
  INSTAGRAM: Instagram,
  TIKTOK: Video,
};

const NETWORK_COLORS: Record<string, string> = {
  LINKEDIN: "text-blue-600",
  X: "text-gray-800",
  INSTAGRAM: "text-pink-500",
  TIKTOK: "text-cyan-500",
};

interface ConceptCardProps {
  index: number;
  title: string;
  angle: string;
  category: ConceptCategory;
  rationale: string;
  targetNetworks: PostType[];
  sourceKeyword?: string | null;
  approved?: boolean;
  posts?: Array<{
    id: string;
    type: PostType;
    content: string;
    imageUrl?: string | null;
  }>;
  onApprove: (index: number, approved: boolean) => void;
  onPreview: (postId: string) => void;
}

export function ConceptCard({
  index,
  title,
  angle,
  category,
  rationale,
  targetNetworks,
  sourceKeyword,
  approved,
  posts,
  onApprove,
  onPreview,
}: ConceptCardProps) {
  const [showRationale, setShowRationale] = useState(false);
  const categoryConfig = CATEGORY_CONFIG[category];

  return (
    <Card className={`transition-all ${approved === true ? "ring-2 ring-emerald-400" : approved === false ? "opacity-50" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs border ${categoryConfig.color}`}>
                {categoryConfig.label}
              </Badge>
              {sourceKeyword && (
                <Badge variant="outline" className="text-xs">
                  SEO: {sourceKeyword}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-sm leading-tight">{title}</h3>
            <p className="text-xs text-gray-500">{angle}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {targetNetworks.map((network) => {
              const Icon = NETWORK_ICONS[network];
              return Icon ? (
                <Icon
                  key={network}
                  className={`h-4 w-4 ${NETWORK_COLORS[network] ?? "text-gray-400"}`}
                />
              ) : null;
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Posts preview */}
        {posts && posts.length > 0 && (
          <div className="space-y-1">
            {posts.map((post) => {
              const Icon = NETWORK_ICONS[post.type];
              return (
                <div
                  key={post.id}
                  className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 cursor-pointer group"
                  onClick={() => onPreview(post.id)}
                >
                  {Icon && <Icon className={`h-3 w-3 ${NETWORK_COLORS[post.type]}`} />}
                  <span className="truncate flex-1">{post.content.slice(0, 80)}...</span>
                  <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        )}

        {/* Image preview for Instagram */}
        {posts?.find((p) => p.type === "INSTAGRAM" && p.imageUrl) && (
          <img
            src={posts.find((p) => p.type === "INSTAGRAM")!.imageUrl!}
            alt={title}
            className="w-full h-32 object-cover rounded-md"
          />
        )}

        {/* Rationale toggle */}
        <button
          onClick={() => setShowRationale(!showRationale)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showRationale ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Pourquoi ce post ?
        </button>
        {showRationale && (
          <p className="text-xs text-gray-600 bg-gray-50 rounded-md p-2">{rationale}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={approved === true ? "default" : "outline"}
            className="flex-1 text-xs"
            onClick={() => onApprove(index, true)}
          >
            <Check className="h-3 w-3 mr-1" />
            Approuver
          </Button>
          <Button
            size="sm"
            variant={approved === false ? "destructive" : "outline"}
            className="flex-1 text-xs"
            onClick={() => onApprove(index, false)}
          >
            <X className="h-3 w-3 mr-1" />
            Rejeter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
