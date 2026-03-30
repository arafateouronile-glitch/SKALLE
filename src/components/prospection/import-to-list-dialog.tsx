"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { importLeads } from "@/actions/leads";
import {
  createProspectList,
  getProspectLists,
} from "@/actions/prospect-lists";

interface ImportToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  leads: Array<{
    name: string;
    email?: string;
    phone?: string;
    linkedInUrl?: string;
    company: string;
    jobTitle?: string;
    location?: string;
    industry?: string;
  }>;
  onImported: (listId: string) => void;
}

export function ImportToListDialog({
  open,
  onOpenChange,
  workspaceId,
  leads,
  onImported,
}: ImportToListDialogProps) {
  const [lists, setLists] = useState<
    Array<{ id: string; name: string; _count: { prospects: number } }>
  >([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  useEffect(() => {
    if (open) {
      loadLists();
    }
  }, [open]);

  const loadLists = async () => {
    setIsLoadingLists(true);
    try {
      const result = await getProspectLists(workspaceId);
      if (result.success && result.data) {
        setLists(result.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingLists(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setIsCreatingList(true);
    try {
      const result = await createProspectList(workspaceId, newListName.trim());
      if (result.success && result.data) {
        setSelectedListId(result.data.id);
        setNewListName("");
        await loadLists();
        toast.success(`Liste "${result.data.name}" creee`);
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Erreur lors de la creation");
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleImport = async () => {
    if (!selectedListId) {
      toast.error("Selectionnez ou creez une liste");
      return;
    }

    setIsImporting(true);
    try {
      const result = await importLeads(
        workspaceId,
        leads,
        selectedListId
      );

      if (result.success) {
        toast.success(`${result.imported} leads importes dans la liste !`);
        onImported(selectedListId);
        onOpenChange(false);
        setSelectedListId("");
      } else {
        toast.error(result.error || "Erreur d'import");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-purple-400" />
            Importer dans une liste
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {leads.length} lead{leads.length > 1 ? "s" : ""} selectionne
            {leads.length > 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Choisir une liste existante */}
          <div className="space-y-2">
            <Label className="text-gray-700">Liste existante</Label>
            {isLoadingLists ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement...
              </div>
            ) : (
              <Select
                value={selectedListId}
                onValueChange={setSelectedListId}
              >
                <SelectTrigger className="bg-gray-100 border-gray-300">
                  <SelectValue placeholder="Choisir une liste..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list._count.prospects} prospects)
                    </SelectItem>
                  ))}
                  {lists.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-gray-9000">
                      Aucune liste. Creez-en une ci-dessous.
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Separateur */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-9000 uppercase">ou</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Creer une nouvelle liste */}
          <div className="space-y-2">
            <Label className="text-gray-700">Nouvelle liste</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nom de la liste..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateList();
                }}
                className="bg-gray-100 border-gray-300 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateList}
                disabled={isCreatingList || !newListName.trim()}
                className="border-gray-300"
              >
                {isCreatingList ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-gray-300 text-gray-700"
          >
            Annuler
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !selectedListId}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Importer ({leads.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
