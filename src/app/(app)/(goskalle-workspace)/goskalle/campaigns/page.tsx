"use client";

/**
 * Goskalle Campagnes — point d'entrée unique pour lancer une campagne, soit en
 * sourçant par ICP (redirige vers le radar choisi dans Prospects → Sourcer,
 * chacun ayant déjà son propre scan + sa propre sélection + son lancement de
 * campagne), soit en important une liste (CSV LinkedIn → sélection immédiate
 * → campagne).
 *
 * Le sélecteur ICP n'est volontairement PAS une recherche combinée multi-
 * sources : chaque radar a des critères de recherche différents (mot-clé pour
 * Signals, catégorie pour Local, secteur pour Newborn, région pour Qualiopi) —
 * c'est un routeur vers l'outil déjà construit pour chacun, pas une nouvelle
 * recherche à reconstruire.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Upload,
  Briefcase,
  MapPin,
  Building2,
  GraduationCap,
  Heart,
  ArrowRight,
  Loader2,
  Info,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getUserWorkspace } from "@/actions/leads";
import { LinkedInImportDialog, type ImportedProspectSummary } from "@/components/prospection/linkedin-import-dialog";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";

interface IcpSource {
  key: string;
  name: string;
  desc: string;
  icon: typeof Briefcase;
  note?: string;
}

const ICP_SOURCES: IcpSource[] = [
  { key: "signals", name: "Signals", desc: "Entreprises en recrutement actif — signal d'intention fort", icon: Briefcase },
  { key: "local", name: "Local", desc: "Commerces locaux qualifiés par Filtre à Douleur (site absent, avis faibles…)", icon: MapPin },
  { key: "newborn", name: "Newborn", desc: "Entreprises françaises tout juste créées (registre INSEE)", icon: Building2 },
  { key: "qualiopi", name: "Qualiopi", desc: "Organismes de formation certifiés (registre public)", icon: GraduationCap },
  {
    key: "warm",
    name: "Warm Leads",
    desc: "Prospects déjà engagés (like/commentaire LinkedIn)",
    icon: Heart,
    note: "File d'approbation DM individuelle — pas une séquence de campagne comme les 4 autres sources.",
  },
];

export default function GoskalleCampaignsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importedProspects, setImportedProspects] = useState<ImportedProspectSummary[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  const handleImported = useCallback((prospects: ImportedProspectSummary[]) => {
    if (prospects.length === 0) return;
    setImportedProspects(prospects);
    setWizardOpen(true);
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
        <h1 className="text-[22px] font-display font-bold" style={{ color: "var(--fg)" }}>Campagnes</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>
          Lance une campagne en sourçant par ICP ou en important une liste existante
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
        </TabsList>

        <TabsContent value="icp">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-stagger">
            {ICP_SOURCES.map((source) => (
              <Link
                key={source.key}
                href={`/goskalle/prospects?tab=sourcer&radar=${source.key}`}
                className="gk-card-hover rounded-2xl p-4 flex items-start gap-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
              >
                <div
                  className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
                >
                  <source.icon className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-[15px]" style={{ color: "var(--fg)" }}>
                    {source.name}
                  </p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--fg-mute)" }}>
                    {source.desc}
                  </p>
                  {source.note && (
                    <p className="text-[10px] mt-1.5 flex items-start gap-1" style={{ color: "var(--amber-fg)" }}>
                      <Info className="h-3 w-3 shrink-0 mt-0.5" />
                      {source.note}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 mt-1" style={{ color: "var(--fg-mute)" }} />
              </Link>
            ))}
          </div>
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
            <Button onClick={() => setImportOpen(true)} className="rounded-xl">
              <Upload className="h-4 w-4 mr-2" />
              Choisir un fichier CSV
            </Button>
          </div>
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
