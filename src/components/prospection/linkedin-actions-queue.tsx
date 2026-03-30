"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, CheckCircle2, Linkedin, ExternalLink, UserPlus, MessageSquare, Mail } from "lucide-react";
import { toast } from "sonner";
import { getLinkedInQueue, markLinkedInStepDone } from "@/actions/sequences";

interface LinkedInQueueItem {
  id: string;
  stepNumber: number;
  content: string;
  linkedInAction: string;
  prospect: {
    id: string;
    name: string;
    company: string;
    jobTitle: string | null;
    linkedInUrl: string;
  };
  sequenceId: string;
  sequenceName: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  connect: <UserPlus className="h-4 w-4" />,
  message: <MessageSquare className="h-4 w-4" />,
  inmail: <Mail className="h-4 w-4" />,
};

const ACTION_LABELS: Record<string, string> = {
  connect: "Invitation",
  message: "Message",
  inmail: "InMail",
};

interface LinkedInActionsQueueProps {
  workspaceId: string;
}

export function LinkedInActionsQueue({ workspaceId }: LinkedInActionsQueueProps) {
  const [queue, setQueue] = useState<LinkedInQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [markingDone, setMarkingDone] = useState<string | null>(null);

  useEffect(() => {
    loadQueue();
  }, [workspaceId]);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const result = await getLinkedInQueue(workspaceId);
      if (result.success && result.data) {
        setQueue(result.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Message copie !");
  };

  const handleMarkDone = async (stepId: string) => {
    setMarkingDone(stepId);
    try {
      const result = await markLinkedInStepDone(stepId);
      if (result.success) {
        setQueue((prev) => prev.filter((item) => item.id !== stepId));
        toast.success("Action marquee comme faite");
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Erreur");
    } finally {
      setMarkingDone(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="text-center py-12">
        <Linkedin className="h-12 w-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-500">Aucune action LinkedIn en attente</p>
        <p className="text-sm text-gray-9000 mt-1">
          Les actions apparaitront ici lorsque des sequences LinkedIn seront actives
        </p>
      </div>
    );
  }

  // Rate limiting info
  const todayActions = queue.filter((q) => q.linkedInAction === "connect").length;

  return (
    <div className="space-y-4">
      {/* Rate limit info */}
      <div className="flex items-center gap-3 text-sm">
        <div className="bg-blue-900/30 text-blue-300 px-3 py-1.5 rounded-lg">
          {queue.length} action{queue.length > 1 ? "s" : ""} en attente
        </div>
        <div className="text-gray-9000">
          Invitations aujourd&apos;hui : {todayActions}/50 max
        </div>
      </div>

      {/* Queue items */}
      <div className="space-y-2">
        {queue.map((item) => (
          <div
            key={item.id}
            className="bg-gray-100 border border-gray-300 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-blue-400">
                    {ACTION_ICONS[item.linkedInAction] || ACTION_ICONS.message}
                  </span>
                  <span className="text-xs bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded">
                    {ACTION_LABELS[item.linkedInAction] || "Message"}
                  </span>
                  <span className="text-xs text-gray-9000">
                    Etape {item.stepNumber}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">{item.prospect.name}</span>
                  <span className="text-sm text-gray-500">{item.prospect.company}</span>
                  {item.prospect.jobTitle && (
                    <span className="text-xs text-gray-9000">{item.prospect.jobTitle}</span>
                  )}
                </div>

                {/* Message content */}
                <div className="bg-white rounded p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {item.content}
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                {item.prospect.linkedInUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-800 text-blue-300 hover:bg-blue-900/30"
                    onClick={() => window.open(item.prospect.linkedInUrl, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Profil
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-300"
                  onClick={() => handleCopy(item.content)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copier
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleMarkDone(item.id)}
                  disabled={markingDone === item.id}
                >
                  {markingDone === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Fait
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
