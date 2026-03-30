"use client";

/**
 * 💳 Page de succès après paiement Stripe
 *
 * Affiche un message de confirmation. session_id peut être utilisé pour afficher les détails.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="rounded-full bg-emerald-100 w-16 h-16 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Paiement réussi
        </h1>
        <p className="text-gray-600 mb-6">
          Merci pour votre confiance. Vous recevrez un récapitulatif par email.
        </p>
        {sessionId && (
          <p className="text-xs text-gray-500 mb-6 font-mono truncate">
            Session : {sessionId}
          </p>
        )}
        <Button asChild className="bg-violet-600 hover:bg-violet-700">
          <Link href="/sales-os">Retour au dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
