"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Linkedin,
  Twitter,
  Instagram,
  Video,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  isSameDay,
} from "date-fns";
import { fr } from "date-fns/locale";
import { reschedulePost, publishPost } from "@/actions/social-factory";
import { toast } from "sonner";
import type { PostType } from "@prisma/client";
import { Send } from "lucide-react";

const NETWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LINKEDIN: Linkedin,
  X: Twitter,
  INSTAGRAM: Instagram,
  TIKTOK: Video,
};

const NETWORK_COLORS: Record<string, string> = {
  LINKEDIN: "bg-blue-500",
  X: "bg-gray-800",
  INSTAGRAM: "bg-pink-500",
  TIKTOK: "bg-cyan-500",
};

interface CalendarPost {
  id: string;
  type: PostType;
  title: string | null;
  content: string;
  scheduledAt: string | null;
  status: string;
}

interface FactoryCalendarProps {
  posts: CalendarPost[];
  month: number;
  year: number;
  workspaceId: string;
}

export function FactoryCalendar({ posts: initialPosts, month, year, workspaceId }: FactoryCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(year, month - 1, 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [posts, setPosts] = useState(initialPosts);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const handlePublish = async (postId: string) => {
    setPublishingId(postId);
    const result = await publishPost(postId, workspaceId);
    setPublishingId(null);
    if (result.success) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: "PUBLISHED" } : p))
      );
      toast.success(`Publié via ${result.provider}`);
    } else {
      toast.error(result.error ?? "Erreur de publication");
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad the start of the month to align with the weekday grid
  const startDay = monthStart.getDay(); // 0=Sun
  const paddedDays: (Date | null)[] = [
    ...Array.from<null>({ length: startDay === 0 ? 6 : startDay - 1 }).fill(null),
    ...days,
  ];

  const getPostsForDay = (date: Date) => {
    return posts.filter((p) => {
      if (!p.scheduledAt) return false;
      return isSameDay(new Date(p.scheduledAt), date);
    });
  };

  const selectedDayPosts = selectedDate ? getPostsForDay(selectedDate) : [];

  return (
    <div className="flex gap-6">
      {/* Calendar Grid */}
      <div className="flex-1">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: fr })}
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {paddedDays.map((day, i) => {
            if (!day) {
              return <div key={`empty-${i}`} className="h-24" />;
            }

            const dayPosts = getPostsForDay(day);
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <div
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`h-24 p-1 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-100 hover:border-gray-300"
                } ${isToday(day) ? "bg-blue-50/50" : ""} ${
                  !isSameMonth(day, currentMonth) ? "opacity-40" : ""
                }`}
              >
                <div className="text-xs font-medium text-gray-700 mb-1">
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayPosts.slice(0, 3).map((post) => (
                    <div
                      key={post.id}
                      className={`h-1.5 rounded-full ${NETWORK_COLORS[post.type] ?? "bg-gray-400"}`}
                      title={`${post.type}: ${post.title ?? "Post"}`}
                    />
                  ))}
                  {dayPosts.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{dayPosts.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mt-4 justify-center">
          {Object.entries(NETWORK_COLORS).map(([network, color]) => (
            <div key={network} className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${color}`} />
              <span className="text-xs text-gray-500">{network}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Sidebar */}
      <div className="w-80 shrink-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedDate
                ? format(selectedDate, "EEEE d MMMM", { locale: fr })
                : "Sélectionnez un jour"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDayPosts.length > 0 ? (
              <div className="space-y-3">
                {selectedDayPosts.map((post) => {
                  const Icon = NETWORK_ICONS[post.type];
                  return (
                    <div key={post.id} className="p-3 rounded-lg bg-gray-50 space-y-2">
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="text-xs font-medium">{post.type}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          {post.status}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium">{post.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-3">
                        {post.content.slice(0, 150)}...
                      </p>
                      {post.scheduledAt && (
                        <p className="text-[10px] text-gray-400">
                          {format(new Date(post.scheduledAt), "HH:mm")}
                        </p>
                      )}
                      {post.status !== "PUBLISHED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          disabled={publishingId === post.id}
                          onClick={() => handlePublish(post.id)}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          {publishingId === post.id ? "Publication..." : "Publier maintenant"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                {selectedDate ? "Aucun post ce jour" : "Cliquez sur un jour pour voir les posts"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
