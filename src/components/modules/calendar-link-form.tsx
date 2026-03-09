"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar, CheckCircle2, ExternalLink } from "lucide-react";
import { updateCalendarLinkAction } from "@/actions/cso-sales";
import { toast } from "sonner";

interface CalendarLinkFormProps {
  workspaceId: string;
  currentLink: string | null;
}

export function CalendarLinkForm({ workspaceId, currentLink }: CalendarLinkFormProps) {
  const [link, setLink] = useState(currentLink ?? "");
  const [saved, setSaved] = useState(!!currentLink);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (link && !link.startsWith("http")) {
      toast.error("L'URL doit commencer par http:// ou https://");
      return;
    }
    setLoading(true);
    try {
      const result = await updateCalendarLinkAction(workspaceId, link);
      if (result.success) {
        setSaved(!!link);
        toast.success(link ? "Lien de réservation enregistré" : "Lien supprimé");
      } else {
        toast.error(result.error ?? "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="h-4 w-4 text-violet-600" />
        <Label className="text-sm font-medium text-gray-900">
          Lien de réservation d&apos;appel
        </Label>
        {saved && link && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Actif
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Ce lien (Calendly, Cal.com, HubSpot...) sera injecté automatiquement dans vos relances de séquences via{" "}
        <code className="bg-gray-100 px-1 rounded text-gray-700">{"{{calendar_link}}"}</code>
      </p>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://cal.com/votrenom"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="bg-white/60 border-gray-200 text-gray-900 flex-1"
        />
        {link && saved && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.open(link, "_blank")}
            className="border-gray-200 text-gray-600 shrink-0"
            title="Ouvrir le lien"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-700 shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {loading ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
      {link && saved && (
        <p className="text-xs text-gray-400">
          Lien actuel : <span className="text-violet-600 font-medium">{link}</span>
        </p>
      )}
    </div>
  );
}
