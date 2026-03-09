"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConceptCard } from "./concept-card";
import { updateConceptStatus } from "@/actions/social-factory";
import { toast } from "sonner";
import type { PostType } from "@prisma/client";
import type { ConceptCategory, ContentConcept } from "@/lib/services/social/content-factory";
import { Linkedin, Twitter, Instagram, Video } from "lucide-react";

const NETWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LINKEDIN: Linkedin,
  X: Twitter,
  INSTAGRAM: Instagram,
  TIKTOK: Video,
};

interface Post {
  id: string;
  type: PostType;
  title: string | null;
  content: string;
  imageUrl: string | null;
  excerpt: string | null;
}

interface ProposalWallProps {
  contentPlanId: string;
  concepts: ContentConcept[];
  posts: Post[];
}

export function ProposalWall({ contentPlanId, concepts, posts }: ProposalWallProps) {
  const [filter, setFilter] = useState<ConceptCategory | "all">("all");
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);

  const filteredConcepts = filter === "all"
    ? concepts
    : concepts.filter((c) => c.category === filter);

  const handleApprove = async (conceptIndex: number, approved: boolean) => {
    const result = await updateConceptStatus(contentPlanId, conceptIndex, approved);
    if (result.success) {
      toast.success(approved ? "Concept approuvé" : "Concept rejeté");
    } else {
      toast.error(result.error ?? "Erreur");
    }
  };

  const getPostsForConcept = (concept: ContentConcept) => {
    return posts.filter(
      (p) => p.title === concept.title && concept.targetNetworks.includes(p.type)
    );
  };

  const previewPost = posts.find((p) => p.id === previewPostId);

  const counts = {
    all: concepts.length,
    education: concepts.filter((c) => c.category === "education").length,
    conversion: concepts.filter((c) => c.category === "conversion").length,
    awareness: concepts.filter((c) => c.category === "awareness").length,
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Badge
          variant={filter === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setFilter("all")}
        >
          Tous ({counts.all})
        </Badge>
        <Badge
          variant={filter === "education" ? "default" : "outline"}
          className="cursor-pointer bg-green-100 text-green-800 border-green-200 hover:bg-green-200"
          onClick={() => setFilter("education")}
        >
          Éducation ({counts.education})
        </Badge>
        <Badge
          variant={filter === "conversion" ? "default" : "outline"}
          className="cursor-pointer bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200"
          onClick={() => setFilter("conversion")}
        >
          Conversion ({counts.conversion})
        </Badge>
        <Badge
          variant={filter === "awareness" ? "default" : "outline"}
          className="cursor-pointer bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200"
          onClick={() => setFilter("awareness")}
        >
          Notoriété ({counts.awareness})
        </Badge>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredConcepts.map((concept) => (
          <ConceptCard
            key={concept.index}
            index={concept.index}
            title={concept.title}
            angle={concept.angle}
            category={concept.category}
            rationale={concept.rationale}
            targetNetworks={concept.targetNetworks}
            sourceKeyword={concept.sourceKeyword}
            approved={(concept as unknown as Record<string, unknown>).approved as boolean | undefined}
            posts={getPostsForConcept(concept)}
            onApprove={handleApprove}
            onPreview={setPreviewPostId}
          />
        ))}
      </div>

      {filteredConcepts.length === 0 && (
        <p className="text-center text-gray-500 py-8">Aucun concept dans cette catégorie</p>
      )}

      {/* Post Preview Dialog */}
      <Dialog open={!!previewPostId} onOpenChange={() => setPreviewPostId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {previewPost && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = NETWORK_ICONS[previewPost.type];
                    return Icon ? <Icon className="h-5 w-5" /> : null;
                  })()}
                  {previewPost.title ?? previewPost.type}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {previewPost.imageUrl && (
                  <img
                    src={previewPost.imageUrl}
                    alt={previewPost.title ?? "Post"}
                    className="w-full rounded-lg"
                  />
                )}
                <Textarea
                  value={previewPost.content}
                  readOnly
                  rows={15}
                  className="font-mono text-sm"
                />
                {previewPost.excerpt && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Image Prompt</p>
                    <p className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                      {previewPost.excerpt}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
