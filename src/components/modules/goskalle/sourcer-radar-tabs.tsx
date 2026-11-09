"use client";

/**
 * Onglets de sourcing partagés — Signals/Local/Newborn/Qualiopi/Warm Leads.
 *
 * Extrait de `goskalle/prospects/page.tsx` pour être réutilisé tel quel par
 * `goskalle/campaigns/page.tsx` — même composants radar (chacun garde son
 * propre formulaire de filtres et son propre lancement de campagne intégré,
 * `CampaignWizard` s'ouvre en modal, jamais de navigation), donc aucune
 * différence de comportement entre les deux pages qui le montent, seulement
 * l'emplacement.
 */

import { Briefcase, MapPin, Building2, GraduationCap, Heart, Users, Inbox as InboxIcon, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignalsRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/signals-radar/page";
import { LocalRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/local-radar/page";
import { NewbornRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/newborn-radar/page";
import { QualiopiRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/qualiopi-radar/page";
import {
  ProspectsTab as WarmProspectsTab,
  ApprovalQueueTab,
  SentDMsTab,
} from "@/app/(app)/(cso-workspace)/sales-os/social-prospector/page";

export const SOURCER_RADAR_TABS = ["signals", "local", "newborn", "qualiopi", "warm"] as const;
export type SourcerRadarTab = (typeof SOURCER_RADAR_TABS)[number];

interface SourcerRadarTabsProps {
  workspaceId: string;
  /** Lien "vers le CRM" utilisé par SignalsRadarTab une fois un lead ajouté. */
  crmHref: string;
  defaultTab?: SourcerRadarTab;
}

export function SourcerRadarTabs({ workspaceId, crmHref, defaultTab = "signals" }: SourcerRadarTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="space-y-6">
      <TabsList className="gk-tabslist">
        <TabsTrigger value="signals" className="gk-tabtrigger"><Briefcase className="h-4 w-4 mr-2" /> Signals</TabsTrigger>
        <TabsTrigger value="local" className="gk-tabtrigger"><MapPin className="h-4 w-4 mr-2" /> Local</TabsTrigger>
        <TabsTrigger value="newborn" className="gk-tabtrigger"><Building2 className="h-4 w-4 mr-2" /> Newborn</TabsTrigger>
        <TabsTrigger value="qualiopi" className="gk-tabtrigger"><GraduationCap className="h-4 w-4 mr-2" /> Qualiopi</TabsTrigger>
        <TabsTrigger value="warm" className="gk-tabtrigger"><Heart className="h-4 w-4 mr-2" /> Warm Leads</TabsTrigger>
      </TabsList>
      <TabsContent value="signals"><SignalsRadarTab crmHref={crmHref} /></TabsContent>
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
  );
}
