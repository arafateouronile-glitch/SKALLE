"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radar, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listCompetitorWatchesAction,
  addCompetitorWatchAction,
  deleteCompetitorWatchAction,
} from "@/actions/competitor-watch";

interface CompetitorWatch {
  id: string;
  name: string;
  linkedInCompanyUrl: string;
  lastScannedAt: Date | null;
}

export function CompetitorWatchCard({ workspaceId }: { workspaceId: string }) {
  const [watches, setWatches] = useState<CompetitorWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listCompetitorWatchesAction(workspaceId).then((r) => {
      if (r.success) setWatches(r.data);
      setLoading(false);
    });
  }, [workspaceId]);

  async function handleAdd() {
    if (!name.trim() || !url.trim()) return;
    setAdding(true);
    try {
      const r = await addCompetitorWatchAction(workspaceId, name, url);
      if (r.success) {
        setWatches((prev) => [r.data, ...prev]);
        setName("");
        setUrl("");
      } else {
        toast.error(r.error);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setWatches((prev) => prev.filter((w) => w.id !== id));
    const r = await deleteCompetitorWatchAction(workspaceId, id);
    if (!r.success) toast.error(r.error);
  }

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radar className="h-4 w-4 text-violet-500" />
          Concurrents à surveiller
        </CardTitle>
        <CardDescription>
          Suivez les nouveaux followers des pages LinkedIn de vos concurrents — captés
          comme leads chauds et priorisés par l&apos;Agent CSO.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Nom du concurrent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="linkedin.com/company/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-[1.5]"
          />
          <Button onClick={handleAdd} disabled={adding || !name.trim() || !url.trim()} size="sm">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {loading ? (
          <p className="text-xs text-gray-400">Chargement…</p>
        ) : watches.length === 0 ? (
          <p className="text-xs text-gray-400">Aucun concurrent suivi pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {watches.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{w.name}</p>
                  <p className="text-gray-400 truncate">{w.linkedInCompanyUrl}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(w.id)}
                  className="shrink-0 h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
