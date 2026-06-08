"use client";

import { useState } from "react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateProfile } from "@/actions/workspace";
import { Pencil, Check, X } from "lucide-react";

interface ProfileFormProps {
  workspaceId: string;
  userName: string | null;
  email: string;
  workspaceName: string;
}

export function ProfileForm({ workspaceId, userName, email, workspaceName }: ProfileFormProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userName ?? "");
  const [wsName, setWsName] = useState(workspaceName);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateProfile(workspaceId, { userName: name, workspaceName: wsName });
    setSaving(false);
    if (result.success) {
      toast.success("Profil mis à jour");
      setEditing(false);
    } else {
      toast.error(result.error ?? "Erreur");
    }
  }

  function handleCancel() {
    setName(userName ?? "");
    setWsName(workspaceName);
    setEditing(false);
  }

  return (
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Nom</Label>
          {editing ? (
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" placeholder="Votre nom" />
          ) : (
            <p className="text-sm font-medium text-gray-900">{userName ?? "—"}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Email</Label>
          <p className="text-sm font-medium text-gray-900">{email}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">Workspace</Label>
        {editing ? (
          <Input value={wsName} onChange={(e) => setWsName(e.target.value)} className="h-8 text-sm" placeholder="Nom du workspace" />
        ) : (
          <p className="text-sm font-medium text-gray-900">{workspaceName}</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
              <Check className="h-3 w-3 mr-1" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving} className="h-8 text-xs">
              <X className="h-3 w-3 mr-1" />
              Annuler
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 text-xs">
            <Pencil className="h-3 w-3 mr-1" />
            Modifier
          </Button>
        )}
      </div>
    </CardContent>
  );
}
