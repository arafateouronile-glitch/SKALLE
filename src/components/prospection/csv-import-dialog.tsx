"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Loader2, Upload, FileSpreadsheet, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { importProspectsCSV, previewCSV } from "@/actions/csv-import-export";
import {
  createProspectList,
  getProspectLists,
} from "@/actions/prospect-lists";
import { useEffect } from "react";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImported: () => void;
}

export function CSVImportDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: CSVImportDialogProps) {
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{
    headers: string[];
    mappings: Record<string, string | null>;
    preview: Record<string, string>[];
    totalRows: number;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [lists, setLists] = useState<Array<{ id: string; name: string; _count: { prospects: number } }>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);

  useEffect(() => {
    if (open) {
      loadLists();
      setStep("upload");
      setCsvContent("");
      setFileName("");
      setPreview(null);
    }
  }, [open]);

  const loadLists = async () => {
    const result = await getProspectLists(workspaceId);
    if (result.success && result.data) {
      setLists(result.data);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    const text = await file.text();
    setCsvContent(text);
    setFileName(file.name);

    const result = await previewCSV(text);
    if (result.success) {
      setPreview({
        headers: result.headers || [],
        mappings: result.mappings || {},
        preview: result.preview || [],
        totalRows: result.totalRows || 0,
      });
      setStep("preview");
    } else {
      toast.error(result.error || "Erreur de lecture du fichier");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
        handleFileSelect(file);
      } else {
        toast.error("Veuillez deposer un fichier CSV");
      }
    },
    [handleFileSelect]
  );

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
      }
    } catch {
      toast.error("Erreur lors de la creation");
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleImport = async () => {
    if (!csvContent) return;
    setIsImporting(true);
    setStep("importing");

    try {
      const result = await importProspectsCSV(
        workspaceId,
        csvContent,
        selectedListId || undefined
      );

      if (result.success) {
        const parts = [];
        if (result.imported) parts.push(`${result.imported} importes`);
        if (result.duplicates) parts.push(`${result.duplicates} doublons mis a jour`);
        if (result.errors) parts.push(`${result.errors} erreurs`);
        toast.success(parts.join(", "));
        onImported();
        onOpenChange(false);
      } else {
        toast.error(result.error || "Erreur d'import");
        setStep("preview");
      }
    } catch {
      toast.error("Une erreur est survenue");
      setStep("preview");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-400" />
            Importer un fichier CSV
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {step === "upload" && "Deposez ou selectionnez un fichier CSV"}
            {step === "preview" && `${preview?.totalRows || 0} lignes detectees`}
            {step === "importing" && "Import en cours..."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === "upload" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-purple-500 transition-colors cursor-pointer"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".csv";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileSelect(file);
                };
                input.click();
              }}
            >
              <Upload className="h-10 w-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 mb-1">
                Glissez-deposez un fichier CSV ici
              </p>
              <p className="text-sm text-slate-500">
                ou cliquez pour selectionner un fichier
              </p>
            </div>
          )}

          {step === "preview" && preview && (
            <>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-slate-300">
                    {fileName} - {preview.totalRows} prospects
                  </span>
                </div>

                {/* Colonnes detectees */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {preview.headers.map((h) => (
                    <span
                      key={h}
                      className={`text-xs px-2 py-0.5 rounded ${
                        preview.mappings[h]
                          ? "bg-green-900/50 text-green-300"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {h} {preview.mappings[h] ? `→ ${preview.mappings[h]}` : "(ignore)"}
                    </span>
                  ))}
                </div>

                {/* Preview */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {preview.headers.slice(0, 6).map((h) => (
                          <th key={h} className="text-left text-slate-400 pb-1 pr-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          {preview.headers.slice(0, 6).map((h) => (
                            <td key={h} className="text-slate-300 py-1 pr-3 truncate max-w-[150px]">
                              {row[h] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selection de liste */}
              <div className="space-y-2">
                <Label className="text-slate-300">Liste de destination (optionnel)</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Choisir une liste..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name} ({list._count.prospects})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nouvelle liste..."
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateList();
                    }}
                    className="bg-slate-800 border-slate-700 flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateList}
                    disabled={isCreatingList || !newListName.trim()}
                    className="border-slate-700"
                  >
                    {isCreatingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              <p className="text-slate-300">Import en cours...</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === "preview") {
                setStep("upload");
                setPreview(null);
                setCsvContent("");
              } else {
                onOpenChange(false);
              }
            }}
            className="border-slate-700 text-slate-300"
          >
            {step === "preview" ? "Retour" : "Annuler"}
          </Button>
          {step === "preview" && (
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="bg-green-600 hover:bg-green-700"
            >
              <Upload className="h-4 w-4 mr-2" />
              Importer ({preview?.totalRows || 0} prospects)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
