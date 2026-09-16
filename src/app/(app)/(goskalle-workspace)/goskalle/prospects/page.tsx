"use client";

/**
 * Goskalle Prospects — fusion Hunt (3 radars) + Warm Leads + CRM.
 * "Sourcer" = trouver de nouveaux prospects, "Pipeline" = les faire progresser.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search, Kanban, Briefcase, MapPin, Building2, GraduationCap, Heart, Users, Inbox as InboxIcon, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserWorkspace } from "@/actions/leads";
import { SignalsRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/signals-radar/page";
import { LocalRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/local-radar/page";
import { NewbornRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/newborn-radar/page";
import { QualiopiRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/qualiopi-radar/page";
import {
  ProspectsTab as WarmProspectsTab,
  ApprovalQueueTab,
  SentDMsTab,
} from "@/app/(app)/(cso-workspace)/sales-os/social-prospector/page";
import { GoskalleCrmView } from "@/components/modules/goskalle/goskalle-crm-view";

function ProspectsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "pipeline" ? "pipeline" : "sourcer";
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) setWorkspaceId(result.workspaceId);
    });
  }, []);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--amber-fg)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-display font-bold" style={{ color: "var(--fg)" }}>Prospects</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>Sourcez de nouveaux prospects, puis faites-les progresser dans le pipeline</p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="gk-tabslist">
          <TabsTrigger value="sourcer" className="gk-tabtrigger">
            <Search className="h-4 w-4 mr-2" /> Sourcer
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gk-tabtrigger">
            <Kanban className="h-4 w-4 mr-2" /> Pipeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sourcer">
          <Tabs defaultValue="signals" className="space-y-6">
            <TabsList className="gk-tabslist">
              <TabsTrigger value="signals" className="gk-tabtrigger"><Briefcase className="h-4 w-4 mr-2" /> Signals</TabsTrigger>
              <TabsTrigger value="local" className="gk-tabtrigger"><MapPin className="h-4 w-4 mr-2" /> Local</TabsTrigger>
              <TabsTrigger value="newborn" className="gk-tabtrigger"><Building2 className="h-4 w-4 mr-2" /> Newborn</TabsTrigger>
              <TabsTrigger value="qualiopi" className="gk-tabtrigger"><GraduationCap className="h-4 w-4 mr-2" /> Qualiopi</TabsTrigger>
              <TabsTrigger value="warm" className="gk-tabtrigger"><Heart className="h-4 w-4 mr-2" /> Warm Leads</TabsTrigger>
            </TabsList>
            <TabsContent value="signals"><SignalsRadarTab crmHref="/goskalle/prospects?tab=pipeline" /></TabsContent>
            <TabsContent value="local"><LocalRadarTab /></TabsContent>
            <TabsContent value="newborn"><NewbornRadarTab /></TabsContent>
            <TabsContent value="qualiopi"><QualiopiRadarTab /></TabsContent>
            <TabsContent value="warm">
              <Tabs defaultValue="warm-prospects" className="space-y-6">
                <TabsList className="gk-tabslist">
                  <TabsTrigger value="warm-prospects" className="gk-tabtrigger"><Users className="h-4 w-4 mr-2" /> Prospects</TabsTrigger>
                  <TabsTrigger value="warm-approval" className="gk-tabtrigger"><InboxIcon className="h-4 w-4 mr-2" /> Approbation</TabsTrigger>
                  <TabsTrigger value="warm-sent" className="gk-tabtrigger"><Send className="h-4 w-4 mr-2" /> DM Envoyés</TabsTrigger>
                </TabsList>
                <TabsContent value="warm-prospects"><WarmProspectsTab workspaceId={workspaceId} /></TabsContent>
                <TabsContent value="warm-approval"><ApprovalQueueTab workspaceId={workspaceId} /></TabsContent>
                <TabsContent value="warm-sent"><SentDMsTab workspaceId={workspaceId} /></TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="pipeline">
          <GoskalleCrmView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function GoskalleProspectsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--amber-fg)" }} /></div>}>
      <ProspectsContent />
    </Suspense>
  );
}
