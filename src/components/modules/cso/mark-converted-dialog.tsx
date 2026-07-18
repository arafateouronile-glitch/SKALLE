"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PartyPopper } from "lucide-react";

interface Props {
  open: boolean;
  prospectName: string;
  onClose: () => void;
  onConfirm: (value: number | null) => Promise<void>;
}

export function MarkConvertedDialog({ open, prospectName, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = Number(amount.replace(",", "."));
  const isValid = amount.trim() !== "" && !Number.isNaN(parsed) && parsed > 0;

  async function handleConfirm(value: number | null) {
    setSaving(true);
    try {
      await onConfirm(value);
      setAmount("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-emerald-500" />
            Marquer comme converti
          </DialogTitle>
          <DialogDescription>
            {prospectName} passe en <span className="font-medium">Converti</span>. Quelle est la
            valeur de ce deal ?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label htmlFor="deal-value">Montant du deal (€)</Label>
          <Input
            id="deal-value"
            type="number"
            min="0"
            step="1"
            placeholder="5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleConfirm(null)}
            disabled={saving}
            className="text-gray-500"
          >
            Convertir sans montant
          </Button>
          <Button
            size="sm"
            onClick={() => handleConfirm(parsed)}
            disabled={!isValid || saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Confirmer{isValid ? ` — ${parsed.toLocaleString("fr-FR")}€` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
