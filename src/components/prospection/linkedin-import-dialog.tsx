"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Loader2, Upload, Linkedin, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { parseLinkedInCSV, type LinkedInFormat } from "@/lib/prospection/linkedin-csv-parser";
import { importLeads } from "@/actions/leads";
import {
  createProspectList,
  getProspectLists,
} from "@/actions/prospect-lists";

const FORMAT_LABELS: Record<LinkedInFormat, string> = {
  basic: "LinkedIn Basic (Connections)",
  sales_nav: "Sales Navigator",
  recruiter: "Recruiter Lite",
  unknown: "Format inconnu",
};

interface LinkedInImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImported: () => void;
}

export function LinkedInImportDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: LinkedInImportDialogProps) {
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [parseResult, setParseResult] = useState<ReturnType<typeof parseLinkedInCSV> | null>(null);
  const [fileName, setFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [lists, setLists] = useState<Array<{ id: string; name: string; _count: { prospects: number } }>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);

  useEffect(() => {
    if (open) {
      loadLists();
      setStep("upload");
      setParseResult(null);
      setFileName("");
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
    setFileName(file.name);

    const result = parseLinkedInCSV(text);
    setParseResult(result);

    if (result.leads.length > 0) {
      setStep("preview");
    } else {
      toast.error("Aucun prospect detecte dans ce fichier");
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
    if (!parseResult || parseResult.leads.length === 0) return;
    setIsImporting(true);
    setStep("importing");

    try {
      const result = await importLeads(
        workspaceId,
        parseResult.leads.map((l) => ({
          name: l.name,
          email: l.email,
          company: l.company,
          jobTitle: l.jobTitle,
          location: l.location,
          linkedInUrl: l.linkedInUrl,
          industry: l.industry,
        })),
        selectedListId || undefined
      );

      if (result.success) {
        const parts = [];
        if (result.imported) parts.push(`${result.imported} importes`);
        if (result.duplicates) parts.push(`${result.duplicates} doublons`);
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
      <DialogContent className="bg-white border-gray-200 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-blue-400" />
            Importer depuis LinkedIn
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {step === "upload" && "Importez un export CSV de LinkedIn Basic, Sales Navigator ou Recruiter Lite"}
            {step === "preview" && parseResult && `${FORMAT_LABELS[parseResult.format]} - ${parseResult.leads.length} prospects`}
            {step === "importing" && "Import en cours..."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === "upload" && (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
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
                <Linkedin className="h-10 w-10 text-blue-500/50 mx-auto mb-3" />
                <p className="text-gray-700 mb-1">
                  Deposez votre export LinkedIn CSV
                </p>
                <p className="text-sm text-gray-9000">
                  Formats supportes : Basic, Sales Navigator, Recruiter Lite
                </p>
              </div>

              <div className="text-xs text-gray-9000 space-y-1">
                <p>Comment exporter depuis LinkedIn :</p>
                <p>1. LinkedIn Basic : Parametres &gt; Obtenir une copie de vos donnees &gt; Connections</p>
                <p>2. Sales Navigator : Lead Lists &gt; Export</p>
                <p>3. Recruiter : Projects &gt; Export to CSV</p>
              </div>
            </>
          )}

          {step === "preview" && parseResult && (
            <>
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  {parseResult.format !== "unknown" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-400" />
                  )}
                  <span className="text-sm text-gray-700">
                    {FORMAT_LABELS[parseResult.format]} - {fileName}
                  </span>
                </div>

                <p className="text-sm text-gray-500 mb-3">
                  {parseResult.leads.length} prospects detectes sur {parseResult.totalRows} lignes
                </p>

                {parseResult.errors.length > 0 && (
                  <div className="text-xs text-yellow-400 mb-2">
                    {parseResult.errors.slice(0, 3).map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                )}

                {/* Preview des premiers leads */}
                <div className="space-y-1">
                  {parseResult.leads.slice(0, 5).map((lead, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs text-gray-700 py-1 border-b border-gray-300/50">
                      <span className="font-medium w-32 truncate">{lead.name}</span>
                      <span className="text-gray-500 w-28 truncate">{lead.company}</span>
                      <span className="text-gray-9000 truncate">{lead.jobTitle || "-"}</span>
                      {lead.email && <span className="text-green-400 text-[10px]">email</span>}
                      {lead.linkedInUrl && <span className="text-blue-400 text-[10px]">linkedin</span>}
                    </div>
                  ))}
                  {parseResult.leads.length > 5 && (
                    <p className="text-xs text-gray-9000 pt-1">
                      et {parseResult.leads.length - 5} de plus...
                    </p>
                  )}
                </div>
              </div>

              {/* Selection de liste */}
              <div className="space-y-2">
                <Label className="text-gray-700">Liste de destination (optionnel)</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger className="bg-gray-100 border-gray-300">
                    <SelectValue placeholder="Choisir une liste..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
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
                    className="bg-gray-100 border-gray-300 flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateList}
                    disabled={isCreatingList || !newListName.trim()}
                    className="border-gray-300"
                  >
                    {isCreatingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              <p className="text-gray-700">Import en cours...</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === "preview") {
                setStep("upload");
                setParseResult(null);
              } else {
                onOpenChange(false);
              }
            }}
            className="border-gray-300 text-gray-700"
          >
            {step === "preview" ? "Retour" : "Annuler"}
          </Button>
          {step === "preview" && parseResult && (
            <Button
              onClick={handleImport}
              disabled={isImporting || parseResult.leads.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="h-4 w-4 mr-2" />
              Importer ({parseResult.leads.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
