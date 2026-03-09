"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Twitter, Instagram, Video, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { PostType } from "@prisma/client";

const NETWORK_LABELS: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  X: "X (Twitter)",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};

const NETWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LINKEDIN: Linkedin,
  X: Twitter,
  INSTAGRAM: Instagram,
  TIKTOK: Video,
};

interface PostPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  post: {
    id: string;
    type: PostType;
    title: string | null;
    content: string;
    imageUrl: string | null;
    excerpt: string | null;
    status: string;
    scheduledAt: string | null;
  } | null;
}

export function PostPreviewDialog({ open, onClose, post }: PostPreviewDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!post) return null;

  const Icon = NETWORK_ICONS[post.type];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(post.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" />}
            {NETWORK_LABELS[post.type] ?? post.type}
            <Badge variant="outline" className="ml-2">
              {post.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {post.title && (
            <h3 className="font-semibold text-lg">{post.title}</h3>
          )}

          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt={post.title ?? "Post image"}
              className="w-full rounded-lg max-h-96 object-cover"
            />
          )}

          <div className="relative">
            <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed">
              {post.content}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-2 right-2"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {post.excerpt && post.type === "INSTAGRAM" && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Prompt image (Nano Banana)</p>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                {post.excerpt}
              </div>
            </div>
          )}

          {post.scheduledAt && (
            <p className="text-sm text-gray-500">
              Planifié le : {new Date(post.scheduledAt).toLocaleDateString("fr-FR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
