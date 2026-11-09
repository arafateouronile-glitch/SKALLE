"use client";

/**
 * Goskalle Campagnes — point d'entrée unique pour lancer une campagne, soit en
 * sourçant par ICP soit en important une liste (CSV LinkedIn), sans jamais
 * changer de page : les 5 sources ICP (Signals/Local/Newborn/Qualiopi/Warm
 * Leads) sont intégrées inline via `SourcerRadarTabs` (même composant que
 * `goskalle/prospects?tab=sourcer`) — chacune garde son propre formulaire de
 * filtres et son propre lancement de campagne déjà intégré (`CampaignWizard`
 * s'ouvre en modal, jamais de navigation). L'import de liste enchaîne aussi
 * directement sur le wizard une fois l'import terminé.
 *
 * Volontairement pas une recherche combinée multi-sources : chaque radar a des
 * critères très différents (mot-clé pour Signals, catégorie pour Local,
 * secteur pour Newborn, région pour Qualiopi) — les harmoniser en un seul
 * formulaire serait un chantier bien plus lourd, écarté pour l'instant.
 */

import { useState, useEffect, useCallback } from "react";
import { Search, Upload, Loader2, ListChecks } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getUserWorkspace } from "@/actions/leads";
import { SourcerRadarTabs } from "@/components/modules/goskalle/sourcer-radar-tabs";
import { LinkedInImportDialog, type ImportedProspectSummary } from "@/components/prospection/linkedin-import-dialog";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { CampaignDashboard } from "@/components/campaigns/campaign-dashboard";
import { useEnrichBeforeCampaign } from "@/hooks/use-enrich-before-campaign";
import { toast } from "sonner";

export default function GoskalleCampaignsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importedProspects, setImportedProspects] = useState<ImportedProspectSummary[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const { enriching, enrichThenOpen } = useEnrichBeforeCampaign(workspaceId);

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  const handleImported = useCallback(
    async (prospects: ImportedProspectSummary[]) => {
      if (prospects.length === 0) return;
      toast.success(`${prospects.length} prospect(s) importé(s). Enrichissement en cours…`);
      await enrichThenOpen(prospects, (enriched) => {
        setImportedProspects(enriched);
        setWizardOpen(true);
      });
    },
    [enrichThenOpen]
  );

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
        <h1 className="text-[22px] font-display font-bold" style={{ color: "var(--fg)" }}>Campagnes</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>
          Lance une campagne en sourçant par ICP ou en important une liste existante, et suis son avancement
        </p>
      </div>

      <Tabs defaultValue="icp" className="space-y-6">
        <TabsList className="gk-tabslist">
          <TabsTrigger value="icp" className="gk-tabtrigger">
            <Search className="h-4 w-4 mr-2" /> Recherche ICP
          </TabsTrigger>
          <TabsTrigger value="import" className="gk-tabtrigger">
            <Upload className="h-4 w-4 mr-2" /> Import de liste
          </TabsTrigger>
          <TabsTrigger value="suivi" className="gk-tabtrigger">
            <ListChecks className="h-4 w-4 mr-2" /> Suivi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="icp">
          <SourcerRadarTabs workspaceId={workspaceId} crmHref="/goskalle/prospects?tab=pipeline" />
        </TabsContent>

        <TabsContent value="import">
          <div
            className="rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4"
            style={{ background: "var(--bg-card)", border: "1px dashed var(--line)" }}
          >
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center"
              style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
            >
              <Upload className="h-6 w-6" style={{ color: "var(--amber-fg)" }} />
            </div>
            <div>
              <p className="font-display font-bold text-[15px]" style={{ color: "var(--fg)" }}>
                Importer une liste
              </p>
              <p className="text-[12px] mt-1 max-w-sm" style={{ color: "var(--fg-mute)" }}>
                Export CSV LinkedIn (Basic, Sales Navigator ou Recruiter Lite). La sélection
                de campagne s&apos;ouvre automatiquement une fois l&apos;import terminé.
              </p>
            </div>
            <Button onClick={() => setImportOpen(true)} disabled={enriching} className="rounded-xl">
              {enriching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {enriching ? "Enrichissement en cours…" : "Choisir un fichier CSV"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="suivi">
          <CampaignDashboard workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>

      <LinkedInImportDialog
        workspaceId={workspaceId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />

      <CampaignWizard
        workspaceId={workspaceId}
        prospects={importedProspects}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => {
          setWizardOpen(false);
          setImportedProspects([]);
        }}
      />
    </div>
  );
}
