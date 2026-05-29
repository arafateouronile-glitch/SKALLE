"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Puzzle, Download, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  token: string | null;
  workspaceId: string;
}

export function ChromeExtensionCard({ token, workspaceId }: Props) {
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  function copyToken() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-violet-500" />
          Extension Chrome — LinkedIn Enricher
          <Badge className="bg-violet-100 text-violet-700 border-0 text-xs ml-auto">
            Nouveau
          </Badge>
        </CardTitle>
        <CardDescription>
          Capture automatiquement le profil LinkedIn de vos prospects (Info + Expériences)
          quand vous les visitez — pour des messages CSO ultra-personnalisés.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Download */}
        <a
          href="/api/extension/download"
          download="skalle-extension.zip"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
        >
          <Download className="h-4 w-4 shrink-0" />
          Télécharger l'extension (.zip)
        </a>

        {/* Token */}
        {token ? (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">Votre token d'authentification</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono truncate text-gray-700">
                {token}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToken}
                className="shrink-0 h-8 w-8 p-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Collez ce token dans le popup de l'extension après installation.
            </p>
          </div>
        ) : (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
            Aucun token trouvé. Utilisez l'onglet Social Prospector pour en générer un.
          </p>
        )}

        {/* Installation steps (collapsible) */}
        <button
          onClick={() => setShowSteps(!showSteps)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showSteps ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Instructions d'installation
        </button>

        {showSteps && (
          <ol className="space-y-2 text-xs text-gray-600 pl-1">
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px]">1</span>
              Téléchargez et décompressez le fichier <code className="bg-gray-100 px-1 rounded">skalle-extension.zip</code>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px]">2</span>
              Ouvrez Chrome → <code className="bg-gray-100 px-1 rounded">chrome://extensions</code>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px]">3</span>
              Activez le <strong>Mode développeur</strong> (bouton en haut à droite)
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px]">4</span>
              Cliquez <strong>Charger l'extension non empaquetée</strong> → sélectionnez le dossier décompressé
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px]">5</span>
              Cliquez sur l'icône SKALLE dans Chrome, collez votre token ci-dessus et sauvegardez
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px]">6</span>
              Visitez un profil LinkedIn → l'extension capture automatiquement Info + Expériences
            </li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
