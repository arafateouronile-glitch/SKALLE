"use client";

/**
 * 🎯 Reply Assistant — Command Center
 *
 * Page dédiée : sélection du prospect puis volet Master Closer (analyse + 2 réponses + Stripe Closing).
 * Supporte ?prospectId=xxx pour pré-sélection depuis le CRM / Relance.
 */

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReplyAssistant } from "@/components/sales/reply-assistant";
import { MessageCircle, Users, Loader2 } from "lucide-react";
import Link from "next/link";
import { getScoredProspectsForDashboard } from "@/actions/cso-sales";
import { getUserWorkspace } from "@/actions/leads";
import type { ScoredProspectForDashboard } from "@/actions/cso-sales";
import { buildMessagingLink } from "@/lib/services/sales/closer";

export default function ReplyAssistantPage() {
  const searchParams = useSearchParams();
  const prospectIdFromUrl = useMemo(() => searchParams.get("prospectId"), [searchParams]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<ScoredProspectForDashboard[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<ScoredProspectForDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await getUserWorkspace();
      if (res.success && res.workspaceId) setWorkspaceId(res.workspaceId);
    })();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      setLoading(true);
      const res = await getScoredProspectsForDashboard(workspaceId);
      if (res.success && res.data) setProspects(res.data);
      setLoading(false);
    })();
  }, [workspaceId]);

  useEffect(() => {
    if (!prospectIdFromUrl || !prospects.length) return;
    const p = prospects.find((x) => x.id === prospectIdFromUrl) ?? null;
    setSelectedProspect(p);
  }, [prospectIdFromUrl, prospects]);

  const platform = (selectedProspect?.platform as "LINKEDIN" | "INSTAGRAM" | "FACEBOOK") || "LINKEDIN";
  const messagingLink = selectedProspect
    ? buildMessagingLink(
        {
          linkedInUrl: selectedProspect.linkedInUrl,
          profileUrl: null,
          metaUserId: null,
        },
        platform
      )
    : undefined;

  return (
    <div className="min-h-screen text-gray-900">
      <div className="border-b border-gray-200/60 bg-white/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                <MessageCircle className="h-7 w-7 text-violet-500" />
                Reply Assistant
              </h1>
              <p className="mt-1 text-gray-500 text-sm">
                Master Closer : analyse la réponse du prospect et génère les réponses parfaites.
              </p>
            </div>
            <Link href="/sales-os">
              <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
                Retour Sales OS
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne gauche : sélection prospect */}
          <div className="lg:col-span-1">
            <Card className="bg-white/80 border-gray-200/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-gray-900">
                  <Users className="h-5 w-5 text-violet-500" />
                  Choisir un prospect
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Sélectionne le prospect qui vient de te répondre.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                  </div>
                ) : (
                  <Select
                    value={selectedProspect?.id ?? ""}
                    onValueChange={(id) => {
                      const p = prospects.find((x) => x.id === id) ?? null;
                      setSelectedProspect(p);
                    }}
                  >
                    <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {prospects.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          className="text-gray-900 focus:bg-gray-50"
                        >
                          {p.name} — {p.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite : Reply Assistant (volet Master Closer) */}
          <div className="lg:col-span-2">
            {selectedProspect && workspaceId ? (
              <ReplyAssistant
                prospectId={selectedProspect.id}
                workspaceId={workspaceId}
                platform={platform}
                messagingLink={messagingLink}
                prospectName={selectedProspect.name}
                paymentLink={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || undefined}
                calendarLink={process.env.NEXT_PUBLIC_CALENDLY_LINK || undefined}
              />
            ) : (
              <Card className="bg-white/80 border-gray-200/60">
                <CardContent className="py-12 text-center text-gray-500">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Sélectionne un prospect pour afficher le Reply Assistant.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
