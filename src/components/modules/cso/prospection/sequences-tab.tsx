"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Users, Plus, Loader2, Linkedin, Mail, MessageCircle, Send, Play, Pause,
} from "lucide-react";
import { startSequence, pauseSequence } from "@/actions/sequences";
import { toast } from "sonner";

export function SequencesTab({ workspaceId }: { workspaceId: string }) {
  const [sequences, setSequences] = useState<any[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadSequences(); }, []);

  const loadSequences = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sequences?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const result = await res.json();
      if (result.success && result.data) setSequences(result.data);
    } catch {
      toast.error("Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSequence = async (sequenceId: string) => {
    try {
      const result = await startSequence(sequenceId);
      if (result.success) { toast.success("Séquence démarrée !"); loadSequences(); }
      else toast.error(result.error || "Erreur");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const handlePauseSequence = async (sequenceId: string) => {
    try {
      const result = await pauseSequence(sequenceId);
      if (result.success) { toast.success("Séquence mise en pause"); loadSequences(); }
      else toast.error(result.error || "Erreur");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "LINKEDIN": return <Linkedin className="h-4 w-4 text-blue-400" />;
      case "EMAIL": return <Mail className="h-4 w-4 text-emerald-600" />;
      default: return <Send className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      PENDING: { label: "En attente", color: "bg-gray-500/20 text-gray-400" },
      SENT: { label: "Envoyé", color: "bg-blue-500/20 text-blue-400" },
      DELIVERED: { label: "Délivré", color: "bg-green-500/20 text-green-400" },
      OPENED: { label: "Ouvert", color: "bg-emerald-500/20 text-emerald-400" },
      REPLIED: { label: "Répondu", color: "bg-emerald-500/20 text-emerald-400" },
      FAILED: { label: "Échoué", color: "bg-red-500/20 text-red-400" },
    };
    const config = statusConfig[status] ?? statusConfig.PENDING;
    return <Badge variant="outline" className={config.color}>{config.label}</Badge>;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Séquences Multi-Canal</h2>
          <p className="text-gray-500 mt-1">Gérez vos séquences de prospection LinkedIn et Email</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600">
              <Plus className="h-4 w-4 mr-2" /> Nouvelle séquence
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Créer une séquence</DialogTitle>
              <DialogDescription className="text-gray-500">
                Utilisez l&apos;onglet <strong>Outreach</strong> pour créer et gérer vos séquences multi-canal LinkedIn et Email.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-gray-500">Ce module est accessible depuis la page Outreach.</p>
              <a href="/sales-os/outreach" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
                Aller à Outreach →
              </a>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {sequences.length === 0 ? (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardContent className="py-16 text-center">
            <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune séquence</h3>
            <p className="text-gray-500 mb-4">Créez votre première séquence multi-canal</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {sequences.map((sequence) => (
              <Card key={sequence.id}
                className={`bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 cursor-pointer transition-all ${selectedSequence?.id === sequence.id ? "ring-2 ring-emerald-500" : "hover:border-gray-300"}`}
                onClick={() => setSelectedSequence(sequence)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">{sequence.name}</h3>
                        <Badge variant={sequence.isActive ? "default" : "outline"}
                          className={sequence.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                          {sequence.isActive ? "Active" : "Pause"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <Users className="h-3 w-3" /> {sequence.prospect?.name}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sequence.steps?.map((step: any) => (
                          <Badge key={step.id} variant="outline" className="text-xs flex items-center gap-1">
                            {getChannelIcon(step.channel)} Étape {step.stepNumber}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sequence.isActive ? (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handlePauseSequence(sequence.id); }}>
                          <Pause className="h-3 w-3 mr-1" /> Pause
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleStartSequence(sequence.id); }}>
                          <Play className="h-3 w-3 mr-1" /> Démarrer
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            {selectedSequence ? (
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-lg">{selectedSequence.name}</CardTitle>
                  <CardDescription className="text-gray-500">{selectedSequence.prospect?.name}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedSequence.steps?.map((step: any) => (
                    <div key={step.id} className="bg-white/50 backdrop-blur-sm rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getChannelIcon(step.channel)}
                          <span className="text-sm font-medium text-gray-900">Étape {step.stepNumber} - {step.channel}</span>
                        </div>
                        {getStatusBadge(step.status)}
                      </div>
                      {step.subject && <div className="text-xs text-gray-500 mb-1">Objet: {step.subject}</div>}
                      {step.content && <div className="text-sm text-gray-700 mb-2">{step.content.slice(0, 100)}...</div>}
                      <div className="text-xs text-gray-400">Délai: {step.delayDays} jours</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardContent className="py-12 text-center text-gray-500 text-sm">
                  Sélectionnez une séquence pour voir les détails
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
