"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { updateSignature } from "@/actions/workspace";
import { PenLine } from "lucide-react";

interface SignatureFormProps {
  workspaceId: string;
  initial: string | null;
}

export function SignatureForm({ workspaceId, initial }: SignatureFormProps) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateSignature(workspaceId, value);
    setSaving(false);
    if (result.success) toast.success("Signature enregistrée");
    else toast.error(result.error ?? "Erreur");
  }

  const preview = value.trim()
    ? value.split("\n").map((line, i) => (
        <span key={i} className="block text-sm text-gray-600">
          {line || <br />}
        </span>
      ))
    : <span className="text-sm text-gray-400 italic">Aucune signature configurée</span>;

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PenLine className="h-4 w-4 text-gray-500" />
          Signature
        </CardTitle>
        <CardDescription>
          Ajoutée automatiquement à la fin de vos messages LinkedIn et emails CSO
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={"Cordialement,\nPrénom Nom\nPoste — Entreprise\nhttps://calendly.com/..."}
          rows={5}
          className="text-sm font-mono resize-none"
        />

        {value.trim() && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Aperçu</p>
            {preview}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
