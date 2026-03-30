"use client";

/**
 * 💳 Payment Generator — One-Click Checkout (sidebar CSO)
 *
 * Montant (€) + Description → Générer le lien → Copier.
 * Puce de statut : gris (créé) → vert (payé, via webhook).
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Copy, Loader2 } from "lucide-react";
import { createQuickPaymentLinkAction, getQuickPaymentLinkStatusAction } from "@/actions/cso-sales";
import { toast } from "sonner";

export interface PaymentGeneratorProps {
  prospectId: string;
  workspaceId: string;
  /** Polling interval (ms) pour le statut payé. 0 = pas de polling */
  pollInterval?: number;
  className?: string;
}

export function PaymentGenerator({
  prospectId,
  workspaceId,
  pollInterval = 10000,
  className = "",
}: PaymentGeneratorProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"CREATED" | "PAID" | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    if (!linkId) return;
    const s = await getQuickPaymentLinkStatusAction(linkId, workspaceId);
    setStatus(s);
  };

  useEffect(() => {
    if (!linkId || !pollInterval) return;
    fetchStatus();
    const t = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(t);
  }, [linkId, workspaceId, pollInterval]);

  const handleGenerate = async () => {
    const num = parseFloat(amount.replace(",", "."));
    if (Number.isNaN(num) || num < 0.5) {
      toast.error("Montant invalide (min. 0,50 €)");
      return;
    }
    if (!description.trim()) {
      toast.error("Indiquez une description.");
      return;
    }
    setLoading(true);
    setLinkId(null);
    setLinkUrl(null);
    setStatus(null);
    try {
      const res = await createQuickPaymentLinkAction(workspaceId, prospectId, num, description.trim());
      if (res.success && res.id && res.url) {
        setLinkId(res.id);
        setLinkUrl(res.url);
        setStatus("CREATED");
        toast.success("Lien généré !");
      } else {
        toast.error(res.error ?? "Erreur");
      }
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    toast.success("Lien copié !");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          Lien de paiement
        </CardTitle>
        <CardDescription>
          Montant et description — génération instantanée du lien Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Montant (€)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="ex: 997"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Description</Label>
            <Input
              type="text"
              placeholder="ex: Accompagnement SEO - 3 mois"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CreditCard className="h-4 w-4 mr-2" />
          )}
          Générer le lien de paiement
        </Button>

        {linkUrl && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-9000">Statut</span>
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  status === "PAID" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-gray-300"
                }`}
                title={status === "PAID" ? "Payé" : "En attente"}
              />
              <span className="text-xs text-gray-9000">
                {status === "PAID" ? "Payé" : "En attente"}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={linkUrl}
                className="font-mono text-xs bg-gray-50"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={copyLink}
                className="shrink-0"
                title="Copier"
              >
                {copied ? (
                  <span className="text-emerald-600 text-xs">OK</span>
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
