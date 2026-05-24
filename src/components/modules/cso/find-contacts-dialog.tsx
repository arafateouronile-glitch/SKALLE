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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Linkedin,
  Mail,
  UserPlus,
  Users,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { FoundContact } from "@/app/api/prospects/find-contacts/route";

interface Props {
  companyName: string;
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}

export function FindContactsDialog({ companyName, workspaceId, open, onClose }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [contacts, setContacts] = useState<FoundContact[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  async function handleSearch() {
    setStatus("loading");
    setContacts([]);
    setSaved(new Set());
    try {
      const res = await fetch(
        `/api/prospects/find-contacts?company=${encodeURIComponent(companyName)}&workspaceId=${workspaceId}`
      );
      const data = await res.json() as { contacts?: FoundContact[]; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Erreur recherche"); setStatus("error"); return; }
      setContacts(data.contacts ?? []);
      setStatus("done");
    } catch {
      toast.error("Erreur réseau");
      setStatus("error");
    }
  }

  async function saveContact(contact: FoundContact) {
    try {
      const res = await fetch("/api/prospects/find-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: [contact], workspaceId }),
      });
      const data = await res.json() as { saved?: number; skipped?: number };
      if (data.saved) {
        setSaved((prev) => new Set([...prev, contact.linkedinUrl]));
        toast.success(`${contact.name} ajouté comme prospect`);
      } else {
        toast.info("Contact déjà dans tes prospects");
        setSaved((prev) => new Set([...prev, contact.linkedinUrl]));
      }
    } catch {
      toast.error("Erreur sauvegarde");
    }
  }

  async function saveAll() {
    const unsaved = contacts.filter((c) => !saved.has(c.linkedinUrl));
    if (!unsaved.length) return;
    setSavingAll(true);
    try {
      const res = await fetch("/api/prospects/find-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: unsaved, workspaceId }),
      });
      const data = await res.json() as { saved?: number; skipped?: number };
      setSaved(new Set(contacts.map((c) => c.linkedinUrl)));
      toast.success(`${data.saved ?? 0} prospect${(data.saved ?? 0) > 1 ? "s" : ""} ajouté${(data.saved ?? 0) > 1 ? "s" : ""}${data.skipped ? `, ${data.skipped} déjà existant${data.skipped > 1 ? "s" : ""}` : ""}`);
    } catch {
      toast.error("Erreur sauvegarde");
    } finally {
      setSavingAll(false);
    }
  }

  function handleOpenChange(o: boolean) {
    if (!o) {
      onClose();
      setStatus("idle");
      setContacts([]);
      setSaved(new Set());
    }
  }

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const unsavedCount = contacts.filter((c) => !saved.has(c.linkedinUrl)).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Users className="h-4 w-4 text-sky-400" />
            Contacts — {companyName}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Trouver les décideurs de {companyName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 mt-1 pr-1">
          {/* Idle */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Users className="h-9 w-9 text-slate-600" />
              <p className="text-[13px] text-slate-400 text-center">
                Cherche les décideurs de <span className="text-white font-semibold">{companyName}</span><br />
                via LinkedIn et les sources publiques.
              </p>
              <Button
                size="sm"
                className="h-8 text-[12px] gap-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 mt-1"
                onClick={handleSearch}
              >
                <Linkedin className="h-3.5 w-3.5" />
                Trouver les contacts
              </Button>
            </div>
          )}

          {/* Loading */}
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-sky-400" />
              <p className="text-[13px] text-slate-400">Recherche en cours…</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-400">
              Impossible de trouver les contacts. Réessaie.
            </div>
          )}

          {/* Empty */}
          {status === "done" && contacts.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[13px] text-slate-500">Aucun contact trouvé pour cette entreprise.</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 text-[12px] text-slate-400 border border-white/[0.08]"
                onClick={handleSearch}
              >
                Réessayer
              </Button>
            </div>
          )}

          {/* Results */}
          {status === "done" && contacts.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-slate-500">
                  {contacts.length} contact{contacts.length > 1 ? "s" : ""} trouvé{contacts.length > 1 ? "s" : ""}
                </p>
                {unsavedCount > 0 && (
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                    onClick={saveAll}
                    disabled={savingAll}
                  >
                    {savingAll ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                    Tout ajouter ({unsavedCount})
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {contacts.map((contact) => {
                  const isSaved = saved.has(contact.linkedinUrl);
                  return (
                    <div
                      key={contact.linkedinUrl}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 flex items-start gap-3"
                    >
                      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] font-bold bg-slate-700 text-slate-300">
                          {initials(contact.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-white">
                            {contact.name}
                          </span>
                          {contact.email && (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                              <Mail className="h-2.5 w-2.5" />
                              {contact.email}
                            </span>
                          )}
                        </div>
                        {contact.jobTitle && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {contact.jobTitle}
                          </p>
                        )}
                        {contact.snippet && (
                          <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">
                            {contact.snippet}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                          >
                            <Linkedin className="h-2.5 w-2.5" />
                            LinkedIn
                            <ExternalLink className="h-2 w-2" />
                          </a>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        className={`h-7 w-7 p-0 shrink-0 ${
                          isSaved
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default"
                            : "bg-white/[0.05] hover:bg-emerald-500/15 border-white/[0.08] hover:border-emerald-500/30 text-slate-400 hover:text-emerald-400"
                        } border transition-colors`}
                        onClick={() => !isSaved && saveContact(contact)}
                        disabled={isSaved}
                        title={isSaved ? "Déjà ajouté" : "Ajouter comme prospect"}
                      >
                        {isSaved ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
