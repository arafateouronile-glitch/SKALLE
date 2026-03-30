"use client";

import { useState, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Linkedin,
  Twitter,
  Instagram,
  Video,
  Facebook,
  Send,
  CalendarDays,
  List,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ImageOff,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  publishPostAction,
  schedulePostAction,
  unschedulePostAction,
  getCalendarPostsAction,
  type CalendarPost,
} from "@/actions/social-publish";
import type { PostType, Status } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const NETWORK_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; bg: string }
> = {
  LINKEDIN: { label: "LinkedIn", icon: Linkedin, dot: "bg-blue-500", bg: "bg-blue-50 text-blue-700 border-blue-200" },
  FACEBOOK: { label: "Facebook", icon: Facebook, dot: "bg-blue-400", bg: "bg-sky-50 text-sky-700 border-sky-200" },
  INSTAGRAM: { label: "Instagram", icon: Instagram, dot: "bg-pink-500", bg: "bg-pink-50 text-pink-700 border-pink-200" },
  X: { label: "X / Twitter", icon: Twitter, dot: "bg-gray-800", bg: "bg-gray-100 text-gray-800 border-gray-300" },
  TIKTOK: { label: "TikTok", icon: Video, dot: "bg-cyan-500", bg: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon", color: "bg-gray-100 text-gray-700" },
  SCHEDULED: { label: "Planifié", color: "bg-amber-100 text-amber-700" },
  PUBLISHED: { label: "Publié", color: "bg-green-100 text-green-700" },
  FAILED: { label: "Échec", color: "bg-red-100 text-red-700" },
};

const TYPE_FILTERS: (PostType | "ALL")[] = ["ALL", "LINKEDIN", "FACEBOOK", "INSTAGRAM", "X", "TIKTOK"];

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

interface ContentCalendarClientProps {
  workspaceId: string;
  initialScheduled: CalendarPost[];
  initialDrafts: CalendarPost[];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ContentCalendarClient({
  workspaceId,
  initialScheduled,
  initialDrafts,
}: ContentCalendarClientProps) {
  const [scheduled, setScheduled] = useState(initialScheduled);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [view, setView] = useState<"calendar" | "drafts">("calendar");
  const [typeFilter, setTypeFilter] = useState<PostType | "ALL">("ALL");

  // Action states
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [unschedulingId, setUnschedulingId] = useState<string | null>(null);

  // ─── Data refresh ──────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const res = await getCalendarPostsAction(workspaceId);
    if (res.success) {
      setScheduled(res.scheduled);
      setDrafts(res.drafts);
    }
  }, [workspaceId]);

  // ─── Calendar helpers ──────────────────────────────────────────────────

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay(); // 0=Sun
  const paddedDays: (Date | null)[] = [
    ...Array.from<null>({ length: startDayOfWeek === 0 ? 6 : startDayOfWeek - 1 }).fill(null),
    ...days,
  ];

  const allCalendarPosts = scheduled.filter(
    (p) => typeFilter === "ALL" || p.type === typeFilter
  );

  const getPostsForDay = (date: Date) =>
    allCalendarPosts.filter((p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), date));

  const selectedDayPosts = selectedDate ? getPostsForDay(selectedDate) : [];

  // ─── Actions ───────────────────────────────────────────────────────────

  const handlePublish = async (post: CalendarPost) => {
    setPublishingId(post.id);
    const res = await publishPostAction(post.id);
    setPublishingId(null);
    if (res.success) {
      toast.success("Post publié !");
      setSelectedPost((prev) => prev?.id === post.id ? { ...prev, status: "PUBLISHED" } : prev);
      await refresh();
    } else {
      toast.error(res.error ?? "Erreur de publication");
    }
  };

  const handleSchedule = async (post: CalendarPost) => {
    if (!scheduleDate) {
      toast.error("Choisissez une date et heure");
      return;
    }
    setSchedulingId(post.id);
    const res = await schedulePostAction(post.id, new Date(scheduleDate));
    setSchedulingId(null);
    if (res.success) {
      toast.success("Post planifié");
      setScheduleDate("");
      setSelectedPost((prev) => prev?.id === post.id ? { ...prev, status: "SCHEDULED", scheduledAt: new Date(scheduleDate).toISOString() } : prev);
      await refresh();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleUnschedule = async (post: CalendarPost) => {
    setUnschedulingId(post.id);
    const res = await unschedulePostAction(post.id);
    setUnschedulingId(null);
    if (res.success) {
      toast.success("Planification annulée");
      setSelectedPost((prev) => prev?.id === post.id ? { ...prev, status: "DRAFT", scheduledAt: null } : prev);
      await refresh();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  // ─── Post Panel ────────────────────────────────────────────────────────

  const PostPanel = ({ post }: { post: CalendarPost }) => {
    const net = NETWORK_META[post.type];
    const NetIcon = net?.icon;
    const statusMeta = STATUS_META[post.status];
    const minDate = new Date();
    minDate.setMinutes(minDate.getMinutes() + 5);

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          {NetIcon && <NetIcon className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{net?.label ?? post.type}</span>
          <Badge className={`ml-auto text-[10px] ${statusMeta.color}`}>{statusMeta.label}</Badge>
        </div>

        {/* Image */}
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt="" className="rounded-lg w-full h-28 object-cover" />
        ) : (
          <div className="rounded-lg w-full h-12 bg-muted flex items-center justify-center">
            <ImageOff className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Content */}
        <p className="text-xs text-muted-foreground line-clamp-5 whitespace-pre-wrap">{post.content}</p>

        {/* Dates */}
        {post.scheduledAt && (
          <p className="flex items-center gap-1 text-[11px] text-amber-600">
            <Clock className="h-3 w-3" />
            Planifié le {format(new Date(post.scheduledAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
          </p>
        )}
        {post.publishedAt && (
          <p className="flex items-center gap-1 text-[11px] text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Publié le {format(new Date(post.publishedAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
          </p>
        )}

        {/* Permalink */}
        {post.cmsPostId && post.status === "PUBLISHED" && (
          <a
            href={post.cmsPostId}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Voir le post
          </a>
        )}

        {/* Actions */}
        {post.status !== "PUBLISHED" && (
          <div className="space-y-2 pt-1">
            {/* Schedule picker */}
            {post.status !== "FAILED" && (
              <div className="space-y-1.5">
                <input
                  type="datetime-local"
                  className="w-full text-xs rounded-md border px-2 py-1.5 bg-background"
                  min={minDate.toISOString().slice(0, 16)}
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  disabled={!scheduleDate || schedulingId === post.id}
                  onClick={() => handleSchedule(post)}
                >
                  {schedulingId === post.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Clock className="h-3 w-3 mr-1" />
                  )}
                  Planifier
                </Button>
              </div>
            )}

            {/* Unschedule */}
            {post.status === "SCHEDULED" && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-7 text-xs text-muted-foreground"
                disabled={unschedulingId === post.id}
                onClick={() => handleUnschedule(post)}
              >
                {unschedulingId === post.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Remettre en brouillon
              </Button>
            )}

            {/* Publish now */}
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              disabled={publishingId === post.id}
              onClick={() => handlePublish(post)}
            >
              {publishingId === post.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              Publier maintenant
            </Button>
          </div>
        )}
      </div>
    );
  };

  // ─── Filtered drafts ───────────────────────────────────────────────────

  const filteredDrafts = drafts.filter(
    (p) => typeFilter === "ALL" || p.type === typeFilter
  );

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendrier de contenu</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {scheduled.length} planifié{scheduled.length !== 1 ? "s" : ""} · {drafts.length} brouillon{drafts.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === "calendar" ? "secondary" : "ghost"}
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setView("calendar")}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendrier
          </Button>
          <Button
            size="sm"
            variant={view === "drafts" ? "secondary" : "ghost"}
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setView("drafts")}
          >
            <List className="h-3.5 w-3.5" /> Brouillons
          </Button>
        </div>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TYPE_FILTERS.map((t) => {
          const meta = t !== "ALL" ? NETWORK_META[t] : null;
          const NetIcon = meta?.icon;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                typeFilter === t
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {NetIcon && <NetIcon className="h-3.5 w-3.5" />}
              {t === "ALL" ? "Tous" : meta?.label ?? t}
            </button>
          );
        })}
      </div>

      {view === "calendar" ? (
        /* ── CALENDAR VIEW ── */
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Calendar grid */}
          <div className="flex-1">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-base font-semibold capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: fr })}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {paddedDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="h-20" />;
                const dayPosts = getPostsForDay(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => {
                      setSelectedDate(day);
                      setSelectedPost(null);
                    }}
                    className={`h-20 p-1.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-50"
                        : isToday(day)
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 ${isToday(day) ? "text-blue-600" : "text-foreground"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayPosts.slice(0, 4).map((post) => {
                        const dot = NETWORK_META[post.type]?.dot ?? "bg-gray-400";
                        return (
                          <div
                            key={post.id}
                            className={`h-1.5 rounded-full ${dot} ${post.status === "PUBLISHED" ? "opacity-40" : ""}`}
                            title={`${NETWORK_META[post.type]?.label ?? post.type} — ${STATUS_META[post.status].label}`}
                          />
                        );
                      })}
                      {dayPosts.length > 4 && (
                        <span className="text-[9px] text-muted-foreground">+{dayPosts.length - 4}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 justify-center flex-wrap">
              {Object.entries(NETWORK_META).map(([key, { label, dot }]) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${dot}`} />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="w-72 shrink-0">
            {selectedDate ? (
              <div className="rounded-xl border bg-card h-full flex flex-col">
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold capitalize">
                    {format(selectedDate, "EEEE d MMMM", { locale: fr })}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? "s" : ""}</p>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {selectedDayPosts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucun post ce jour</p>
                    ) : selectedPost ? (
                      <>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
                          onClick={() => setSelectedPost(null)}
                        >
                          ← Retour
                        </button>
                        <PostPanel post={selectedPost} />
                      </>
                    ) : (
                      selectedDayPosts.map((post) => {
                        const net = NETWORK_META[post.type];
                        const NetIcon = net?.icon;
                        return (
                          <button
                            key={post.id}
                            className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors space-y-1.5"
                            onClick={() => setSelectedPost(post)}
                          >
                            <div className="flex items-center gap-2">
                              {NetIcon && <NetIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="text-xs font-medium">{net?.label ?? post.type}</span>
                              <Badge className={`ml-auto text-[9px] px-1.5 py-0 ${STATUS_META[post.status].color}`}>
                                {STATUS_META[post.status].label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{post.content}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-6">
                  Cliquez sur un jour pour voir les posts planifiés
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── DRAFTS LIST VIEW ── */
        <div className="flex gap-6 flex-1 min-h-0">
          <div className="flex-1">
            {filteredDrafts.length === 0 ? (
              <div className="flex items-center justify-center h-48 border border-dashed rounded-xl">
                <p className="text-sm text-muted-foreground">Aucun brouillon sans date de publication</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDrafts.map((post) => {
                  const net = NETWORK_META[post.type];
                  const NetIcon = net?.icon;
                  const statusMeta = STATUS_META[post.status];
                  return (
                    <button
                      key={post.id}
                      className={`text-left p-4 rounded-xl border transition-colors hover:bg-muted/50 space-y-2 ${
                        selectedPost?.id === post.id ? "border-emerald-400 bg-emerald-50/50" : ""
                      }`}
                      onClick={() => setSelectedPost(post.id === selectedPost?.id ? null : post)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${net?.bg ?? ""}`}>
                          {NetIcon && <NetIcon className="h-3 w-3" />}
                          {net?.label ?? post.type}
                        </div>
                        <Badge className={`ml-auto text-[9px] px-1.5 py-0 ${statusMeta.color}`}>
                          {statusMeta.label}
                        </Badge>
                      </div>
                      {post.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.imageUrl} alt="" className="rounded-md w-full h-20 object-cover" />
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-3">{post.content}</p>
                      {post.status === "FAILED" && (
                        <p className="flex items-center gap-1 text-[11px] text-red-600">
                          <AlertTriangle className="h-3 w-3" /> Publication échouée
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        Créé le {format(new Date(post.createdAt), "d MMM yyyy", { locale: fr })}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Post detail panel */}
          <div className="w-72 shrink-0">
            {selectedPost ? (
              <div className="rounded-xl border bg-card p-4">
                <PostPanel post={selectedPost} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed h-48 flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-6">
                  Cliquez sur un brouillon pour le planifier ou publier
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
