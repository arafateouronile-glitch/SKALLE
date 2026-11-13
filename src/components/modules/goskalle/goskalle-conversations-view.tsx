"use client";

/**
 * Goskalle Conversations — fusion Inbox + Outreach + le sous-ensemble utile de
 * l'ancien Prospection (Sequences/LinkedIn Queue/Campagnes/Intent Signals —
 * sans Find Leads/Prospects, absorbés par Prospects, ni SMTP/Délivrabilité,
 * absorbés par Réglages).
 */

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox as InboxIcon, Send, GitBranch, Mail, Linkedin, Rocket, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CsoInbox, type Conversation } from "@/components/modules/cso/cso-inbox";
import { GoskalleOutreachView } from "@/components/modules/goskalle/goskalle-outreach-view";
import { SequencesTab } from "@/components/modules/cso/prospection/sequences-tab";
import { IntentSignalsPanel } from "@/components/modules/cso/intent-signals-panel";
import { CampaignDashboard } from "@/components/campaigns/campaign-dashboard";
import { LinkedInActionsQueue } from "@/components/prospection/linkedin-actions-queue";
import { BulkLinkedInLaunchDialog } from "@/components/modules/cso/bulk-linkedin-launch-dialog";
import { BulkEmailLaunchDialog } from "@/components/modules/cso/bulk-email-launch-dialog";

interface GoskalleConversationsViewProps {
  conversations: Conversation[];
  calendarLink: string | null;
  workspaceId: string;
  unreadCount: number;
}

function ConversationsContent(props: GoskalleConversationsViewProps) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "sequences" ? "sequences" : tabParam === "builder" ? "builder" : "inbox";

  const [showBulkLaunch, setShowBulkLaunch] = useState(false);
  const [linkedInQueueKey, setLinkedInQueueKey] = useState(0);
  const [showBulkEmail, setShowBulkEmail] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-display font-bold" style={{ color: "var(--fg)" }}>Conversations</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>Répondez, suivez vos séquences, construisez la prochaine</p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="gk-tabslist">
          <TabsTrigger value="inbox" className="gk-tabtrigger">
            <InboxIcon className="h-4 w-4 mr-2" /> Boîte de réception
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gk-tabtrigger">
            <Send className="h-4 w-4 mr-2" /> Séquences actives
          </TabsTrigger>
          <TabsTrigger value="builder" className="gk-tabtrigger">
            <GitBranch className="h-4 w-4 mr-2" /> Créer une séquence
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <CsoInbox
            conversations={props.conversations}
            calendarLink={props.calendarLink}
            workspaceId={props.workspaceId}
            unreadCount={props.unreadCount}
          />
        </TabsContent>

        <TabsContent value="sequences">
          <GoskalleOutreachView />
        </TabsContent>

        <TabsContent value="builder">
          <Tabs defaultValue="sequences" className="space-y-6">
            <TabsList className="gk-tabslist">
              <TabsTrigger value="sequences" className="gk-tabtrigger"><Mail className="h-4 w-4 mr-2" /> Séquences</TabsTrigger>
              <TabsTrigger value="linkedin-queue" className="gk-tabtrigger"><Linkedin className="h-4 w-4 mr-2" /> LinkedIn</TabsTrigger>
              <TabsTrigger value="campaigns" className="gk-tabtrigger"><Rocket className="h-4 w-4 mr-2" /> Campagnes</TabsTrigger>
              <TabsTrigger value="intent-signals" className="gk-tabtrigger"><Zap className="h-4 w-4 mr-2" /> Intent Signals</TabsTrigger>
            </TabsList>

            <TabsContent value="sequences">
              <SequencesTab workspaceId={props.workspaceId} outreachHref="/goskalle/conversations?tab=sequences" />
            </TabsContent>

            <TabsContent value="linkedin-queue">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[18px] font-display font-bold" style={{ color: "var(--fg)" }}>Actions LinkedIn</h2>
                    <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>File d&apos;attente des actions LinkedIn (invitations, messages, InMail)</p>
                  </div>
                  <Button onClick={() => setShowBulkLaunch(true)} className="border-0" style={{ background: "var(--fg)", color: "var(--bg-card)" }}>
                    <Linkedin className="h-4 w-4 mr-2" style={{ color: "#60a5fa" }} /> Lancer des séquences LinkedIn
                  </Button>
                </div>
                <LinkedInActionsQueue key={linkedInQueueKey} workspaceId={props.workspaceId} />
              </div>
              <BulkLinkedInLaunchDialog workspaceId={props.workspaceId} open={showBulkLaunch} onClose={() => setShowBulkLaunch(false)}
                onLaunched={() => { setShowBulkLaunch(false); setLinkedInQueueKey((k) => k + 1); }} />
            </TabsContent>

            <TabsContent value="campaigns">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[18px] font-display font-bold" style={{ color: "var(--fg)" }}>Campagnes Email</h2>
                    <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>Campagnes multi-étapes + séquences 1:1 autonomes</p>
                  </div>
                  <Button onClick={() => setShowBulkEmail(true)} className="border-0" style={{ background: "var(--fg)", color: "var(--bg-card)" }}>
                    <Mail className="h-4 w-4 mr-2" style={{ color: "var(--amber-fg)" }} /> Lancer des séquences email
                  </Button>
                </div>
                <CampaignDashboard workspaceId={props.workspaceId} />
              </div>
              <BulkEmailLaunchDialog workspaceId={props.workspaceId} open={showBulkEmail} onClose={() => setShowBulkEmail(false)}
                onLaunched={(count) => { setShowBulkEmail(false); toast.success(`${count} séquence(s) email créées — envoi prochain run à 8h`); }} />
            </TabsContent>

            <TabsContent value="intent-signals">
              <IntentSignalsPanel workspaceId={props.workspaceId} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function GoskalleConversationsView(props: GoskalleConversationsViewProps) {
  return (
    <Suspense fallback={<div className="min-h-[400px]" />}>
      <ConversationsContent {...props} />
    </Suspense>
  );
}
