"use client";

import { useState, useEffect } from "react";
import { Loader2, Users, Search, Rocket, MessageCircle, Linkedin, Settings, Shield, Zap, Mail } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getUserWorkspace } from "@/actions/leads";
import { toast } from "sonner";

import { FindLeadsTab } from "@/components/modules/cso/prospection/find-leads-tab";
import { SequencesTab } from "@/components/modules/cso/prospection/sequences-tab";
import { DeliverabilityTab } from "@/components/modules/cso/prospection/deliverability-tab";
import { ProspectsTab } from "@/components/modules/cso/prospection/prospects-tab";
import { IntentSignalsPanel } from "@/components/modules/cso/intent-signals-panel";
import { SmtpConfigForm } from "@/components/campaigns/smtp-config-form";
import { EmailWarmupDashboard } from "@/components/prospection/email-warmup-dashboard";
import { CampaignDashboard } from "@/components/campaigns/campaign-dashboard";
import { LinkedInActionsQueue } from "@/components/prospection/linkedin-actions-queue";
import { BulkLinkedInLaunchDialog } from "@/components/modules/cso/bulk-linkedin-launch-dialog";
import { BulkEmailLaunchDialog } from "@/components/modules/cso/bulk-email-launch-dialog";

export default function ProspectionPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showBulkLaunch, setShowBulkLaunch] = useState(false);
  const [linkedInQueueKey, setLinkedInQueueKey] = useState(0);
  const [showBulkEmail, setShowBulkEmail] = useState(false);

  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) setWorkspaceId(result.workspaceId);
    });
  }, []);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 bg-clip-text text-transparent flex items-center gap-3">
          <Users className="h-8 w-8 text-emerald-500" />
          Prospection LinkedIn
        </h1>
        <p className="text-gray-500 mt-2">
          Trouvez des leads qualifiés, gérez des séquences multi-canal et optimisez votre délivrabilité
        </p>
      </div>

      <Tabs defaultValue="find-leads" className="space-y-6">
        <TabsList className="bg-white/50 backdrop-blur-sm border border-gray-200">
          {[
            { value: "find-leads",      icon: Search,        label: "Find Leads" },
            { value: "prospects",       icon: Users,         label: "Prospects" },
            { value: "campaigns",       icon: Rocket,        label: "Campagnes" },
            { value: "sequences",       icon: MessageCircle, label: "Sequences" },
            { value: "linkedin-queue",  icon: Linkedin,      label: "LinkedIn" },
            { value: "smtp",            icon: Settings,      label: "SMTP" },
            { value: "deliverability",  icon: Shield,        label: "Délivrabilité" },
            { value: "intent-signals",  icon: Zap,           label: "Intent Signals", accent: true },
          ].map(({ value, icon: Icon, label, accent }) => (
            <TabsTrigger key={value} value={value}
              className={accent
                ? "data-[state=active]:bg-amber-500 data-[state=active]:text-white"
                : "data-[state=active]:bg-emerald-600 data-[state=active]:text-white"}>
              <Icon className="h-4 w-4 mr-2" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="find-leads">
          <FindLeadsTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="prospects">
          <ProspectsTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="campaigns">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Campagnes Email</h2>
                <p className="text-gray-500 mt-1">Campagnes multi-étapes + séquences 1:1 autonomes</p>
              </div>
              <Button onClick={() => setShowBulkEmail(true)}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                <Mail className="h-4 w-4 mr-2" /> Lancer des séquences email
              </Button>
            </div>
            <CampaignDashboard workspaceId={workspaceId} />
          </div>
          <BulkEmailLaunchDialog workspaceId={workspaceId} open={showBulkEmail} onClose={() => setShowBulkEmail(false)}
            onLaunched={(count) => { setShowBulkEmail(false); toast.success(`${count} séquence(s) email créées — envoi prochain run à 8h`); }} />
        </TabsContent>

        <TabsContent value="sequences">
          <SequencesTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="linkedin-queue">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Actions LinkedIn</h2>
                <p className="text-gray-500 mt-1">File d&apos;attente des actions LinkedIn (invitations, messages, InMail)</p>
              </div>
              <Button onClick={() => setShowBulkLaunch(true)}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                <Linkedin className="h-4 w-4 mr-2" /> Lancer des séquences LinkedIn
              </Button>
            </div>
            <LinkedInActionsQueue key={linkedInQueueKey} workspaceId={workspaceId} />
          </div>
          <BulkLinkedInLaunchDialog workspaceId={workspaceId} open={showBulkLaunch} onClose={() => setShowBulkLaunch(false)}
            onLaunched={() => { setShowBulkLaunch(false); setLinkedInQueueKey((k) => k + 1); }} />
        </TabsContent>

        <TabsContent value="smtp">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Comptes d&apos;envoi SMTP</h2>
              <p className="text-gray-500 mt-1">Configurez vos comptes email pour envoyer des campagnes (multi-sender)</p>
            </div>
            <SmtpConfigForm workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="deliverability">
          <div className="space-y-6">
            <EmailWarmupDashboard workspaceId={workspaceId} />
            <DeliverabilityTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="intent-signals">
          <IntentSignalsPanel workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
