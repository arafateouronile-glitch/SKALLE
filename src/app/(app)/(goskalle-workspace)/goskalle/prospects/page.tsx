"use client";

/**
 * Goskalle Prospects — fusion Hunt (3 radars) + Warm Leads + CRM.
 * "Sourcer" = trouver de nouveaux prospects, "Pipeline" = les faire progresser.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search, Kanban } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserWorkspace } from "@/actions/leads";
import { SourcerRadarTabs, SOURCER_RADAR_TABS } from "@/components/modules/goskalle/sourcer-radar-tabs";
import { GoskalleCrmView } from "@/components/modules/goskalle/goskalle-crm-view";

function ProspectsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "pipeline" ? "pipeline" : "sourcer";
  const radarParam = searchParams.get("radar");
  const initialRadarTab = SOURCER_RADAR_TABS.find((t) => t === radarParam) ?? "signals";
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
          <SourcerRadarTabs
            workspaceId={workspaceId}
            crmHref="/goskalle/prospects?tab=pipeline"
            defaultTab={initialRadarTab}
          />
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
