"use client";

/**
 * Goskalle Réglages — consolide Personas (ICP) + tout ce qui concerne la santé
 * de l'envoi email (SMTP, warmup, délivrabilité par domaine, SPF/DKIM/DMARC).
 * Configuration, pas du quotidien — d'où la place en pied de sidebar plutôt
 * que dans le nav principal.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Users, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserWorkspace } from "@/actions/leads";
import { GoskallePersonasView } from "@/components/modules/goskalle/goskalle-personas-view";
import { GoskalleDeliverabilityView } from "@/components/modules/goskalle/goskalle-deliverability-view";
import { SmtpConfigForm } from "@/components/campaigns/smtp-config-form";
import { EmailWarmupDashboard } from "@/components/prospection/email-warmup-dashboard";
import { DeliverabilityTab } from "@/components/modules/cso/prospection/deliverability-tab";

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "email" ? "email" : "personas";
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) setWorkspaceId(result.workspaceId);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
        <p className="text-gray-500 mt-1">ICP cible et santé de vos envois email</p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="bg-white/50 backdrop-blur-sm border border-gray-200">
          <TabsTrigger value="personas" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
            <Users className="h-4 w-4 mr-2" /> Personas
          </TabsTrigger>
          <TabsTrigger value="email" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
            <ShieldCheck className="h-4 w-4 mr-2" /> Email & Délivrabilité
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personas">
          <GoskallePersonasView />
        </TabsContent>

        <TabsContent value="email">
          <div className="space-y-8">
            {workspaceId && (
              <>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Comptes d&apos;envoi SMTP</h2>
                  <SmtpConfigForm workspaceId={workspaceId} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Warmup</h2>
                  <EmailWarmupDashboard workspaceId={workspaceId} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Délivrabilité par prospect</h2>
                  <DeliverabilityTab workspaceId={workspaceId} />
                </div>
              </>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3">Vérifier un domaine (SPF · DKIM · DMARC)</h2>
              <GoskalleDeliverabilityView />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function GoskalleSettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-[400px]" />}>
      <SettingsContent />
    </Suspense>
  );
}
