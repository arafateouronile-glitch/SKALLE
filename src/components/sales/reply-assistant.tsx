"use client";

/**
 * 🎯 Sales Reply Assistant — Command Center
 *
 * Volet latéral (Side Panel) pour répondre aux messages reçus (FB/IG/LI).
 * Affiche le message reçu, le diagnostic IA (intention/objection), 2 options de réponse,
 * Copier & Ouvrir [Plateforme], personnalisation (régénérer), et option Stripe Closing.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Target, Shield, MessageCircle, Copy, ExternalLink, Sparkles, Loader2, CreditCard, BookPlus } from "lucide-react";
import { generateClosingResponseAction, saveToObjectionBankAction } from "@/actions/cso-sales";
import { updateProspectStatusAction } from "@/actions/crm";
import { PaymentGenerator } from "@/components/sales/payment-generator";
import type { ClosingResponseResult } from "@/lib/services/sales/replier";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ReplyAssistantPlatform = "LINKEDIN" | "INSTAGRAM" | "FACEBOOK";

export interface ReplyAssistantProps {
  prospectId: string;
  workspaceId: string;
  platform?: ReplyAssistantPlatform;
  /** Lien direct messagerie (Click-to-Send) */
  messagingLink?: string;
  /** Lien de paiement (Stripe Closing) — optionnel */
  paymentLink?: string;
  /** Lien calendrier (Calendly, etc.) — optionnel */
  calendarLink?: string;
  /** Message reçu du prospect (contrôlé par le parent ou vide pour saisie locale) */
  initialMessage?: string;
  /** Nom du prospect pour l'en-tête */
  prospectName?: string;
  /** Côté du panneau (pour intégration dans une layout) */
  className?: string;
}

const PLATFORM_LABELS: Record<ReplyAssistantPlatform, string> = {
  LINKEDIN: "LinkedIn",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
};

// ═══════════════════════════════════════════════════════════════════════════
// 📌 COMPOSANT
// ═══════════════════════════════════════════════════════════════════════════

export function ReplyAssistant({
  prospectId,
  workspaceId,
  platform = "LINKEDIN",
  messagingLink,
  paymentLink,
  calendarLink,
  initialMessage = "",
  prospectName = "Prospect",
  className = "",
}: ReplyAssistantProps) {
  const [incomingMessage, setIncomingMessage] = useState(initialMessage);
  const [result, setResult] = useState<ClosingResponseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingBankId, setSavingBankId] = useState<string | null>(null);
  const [applyingStatus, setApplyingStatus] = useState(false);

  const runAnalysis = async (instruction?: string) => {
    const message = incomingMessage.trim();
    if (!message) {
      toast.error("Colle d'abord le message reçu du prospect.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await generateClosingResponseAction(prospectId, message, {
        workspaceId,
        customInstruction: instruction ?? customInstruction,
      });
      if (res.success && res.data) {
        setResult(res.data);
        toast.success("Réponses générées (5 crédits)");
      } else {
        toast.error(res.error ?? "Erreur");
      }
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  };

  const copyAndOpen = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copié !");
    setTimeout(() => setCopiedId(null), 2000);
    if (messagingLink) window.open(messagingLink, "_blank");
  };

  const addToLibrary = async (responseText: string, optionId: string) => {
    if (!result) return;
    setSavingBankId(optionId);
    try {
      const res = await saveToObjectionBankAction(workspaceId, {
        objectionType: result.intentionDetected,
        objectionLabel: result.objectionLabel ?? result.intentionDetected,
        responseText,
        outcome: "CALL_BOOKED",
      });
      if (res.success) toast.success("Ajouté à la bibliothèque d'objections");
      else toast.error(res.error);
    } catch {
      toast.error("Erreur");
    } finally {
      setSavingBankId(null);
    }
  };

  const intentionColor = (intention: string) => {
    const i = intention.toUpperCase();
    if (i === "OBJECTION" || i === "PRIX") return "border-amber-500/50 bg-amber-500/10 text-amber-700";
    if (i === "CONFIANCE" || i === "CURIOSITE_SCEPTIQUE") return "border-violet-500/50 bg-violet-500/10 text-violet-700";
    if (i === "ENGAGEMENT") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-700";
    return "border-gray-300 bg-gray-50 text-gray-600";
  };

  return (
    <div className={className}>
      <Card className="border-gray-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-violet-500" />
            Reply Assistant
          </CardTitle>
          <CardDescription>
            {prospectName} — Analyse et réponses par le Master Closer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 1. Message reçu */}
          <div>
            <p className="text-xs font-medium text-gray-9000 mb-1">Message reçu</p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <Textarea
                placeholder="Colle ici le message du prospect..."
                value={incomingMessage}
                onChange={(e) => setIncomingMessage(e.target.value)}
                className="min-h-[80px] resize-none bg-transparent border-0 focus-visible:ring-0 text-sm text-gray-700 placeholder:text-gray-500"
                rows={3}
              />
            </div>
          </div>

          <Button
            onClick={() => runAnalysis()}
            disabled={loading || !incomingMessage.trim()}
            className="w-full bg-violet-600 hover:bg-violet-700"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Analyser et générer les réponses
          </Button>

          {/* 2. Diagnostic IA */}
          {result && (
            <>
              <div className={`rounded-lg border p-3 ${intentionColor(result.intentionDetected)}`}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">Intention détectée</p>
                <p className="text-sm font-medium">
                  {result.intentionDetected.replace(/_/g, " ")}
                  {result.objectionLabel && (
                    <span className="ml-2 text-xs font-normal">— {result.objectionLabel}</span>
                  )}
                </p>
              </div>

              {/* Suggestion statut CRM (En Discussion / Gagné) */}
              {result.suggestedPipelineStatus && (
                <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-violet-800">
                    <Sparkles className="h-4 w-4 inline mr-2 text-violet-500" />
                    L&apos;IA suggère : passer ce lead en{" "}
                    <strong>
                      {result.suggestedPipelineStatus === "CONVERTED" ? "Gagné" : "En Discussion"}
                    </strong>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-500 text-violet-700 shrink-0"
                    disabled={applyingStatus}
                    onClick={async () => {
                      setApplyingStatus(true);
                      try {
                        const ok = await updateProspectStatusAction(
                          prospectId,
                          result.suggestedPipelineStatus!,
                          workspaceId
                        );
                        if (ok.success) {
                          toast.success("Statut mis à jour dans le CRM");
                          setResult((prev) =>
                            prev ? { ...prev, suggestedPipelineStatus: undefined } : null
                          );
                        } else toast.error(ok.error);
                      } catch {
                        toast.error("Erreur");
                      } finally {
                        setApplyingStatus(false);
                      }
                    }}
                  >
                    {applyingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
                  </Button>
                </div>
              )}

              {/* 3. Options A & B */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-9000 flex items-center gap-1">
                  <Target className="h-3.5 w-3" />
                  Suggestions
                </p>
                <div className="space-y-2">
                  <div className="rounded-lg border border-gray-200 p-3 bg-white">
                    <Badge variant="outline" className="mb-2 text-xs">Option A — Douce</Badge>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{result.optionA}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-violet-300 text-violet-700"
                        onClick={() => copyAndOpen(result.optionA, "a")}
                      >
                        {copiedId === "a" ? <Copy className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}
                        Copier & Ouvrir {PLATFORM_LABELS[platform]}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-9000"
                        title="Ajouter à la bibliothèque d'objections"
                        disabled={savingBankId !== null}
                        onClick={() => addToLibrary(result.optionA, "a")}
                      >
                        {savingBankId === "a" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 bg-white">
                    <Badge variant="outline" className="mb-2 text-xs">Option B — Directe</Badge>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{result.optionB}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-violet-300 text-violet-700"
                        onClick={() => copyAndOpen(result.optionB, "b")}
                      >
                        {copiedId === "b" ? <Copy className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}
                        Copier & Ouvrir {PLATFORM_LABELS[platform]}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-9000"
                        title="Ajouter à la bibliothèque d'objections"
                        disabled={savingBankId !== null}
                        onClick={() => addToLibrary(result.optionB, "b")}
                      >
                        {savingBankId === "b" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Note stratégique */}
              <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-9000 flex items-center gap-1 mb-1">
                  <Shield className="h-3.5 w-3" />
                  Pourquoi cette réponse ?
                </p>
                <p className="text-sm text-gray-400">{result.strategicNote}</p>
              </div>

              {/* Personnalisation : régénérer */}
              <div>
                <p className="text-xs font-medium text-gray-9000 mb-1">Personnaliser (ex: &quot;Il a l&apos;air pressé, raccourcis&quot;)</p>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Consigne pour l'IA..."
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    className="min-h-[60px] resize-none text-sm"
                    rows={2}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading}
                    onClick={() => runAnalysis(customInstruction)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Régénérer"}
                  </Button>
                </div>
              </div>

              {/* Stripe Closing — liens statiques */}
              {(paymentLink || calendarLink) && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-9000 mb-2">Liens rapides</p>
                  <div className="flex flex-wrap gap-2">
                    {paymentLink && (
                      <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                        <a href={paymentLink} target="_blank" rel="noopener noreferrer">
                          <CreditCard className="h-4 w-4 mr-1" />
                          Lien paiement
                        </a>
                      </Button>
                    )}
                    {calendarLink && (
                      <Button asChild size="sm" variant="outline">
                        <a href={calendarLink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Réserver un call
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {/* One-Click Checkout — toujours visible */}
          <div className="pt-4 border-t border-gray-200">
            <PaymentGenerator
              prospectId={prospectId}
              workspaceId={workspaceId}
              pollInterval={10000}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
