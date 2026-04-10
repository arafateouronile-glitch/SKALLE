"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileSpreadsheet,
  Trash2,
  Download,
  CheckCircle2,
  Linkedin,
  Users,
  Mail,
  Building2,
  Link,
  RefreshCw,
} from "lucide-react";
import {
  getContactsFromDb,
  getContactDbStats,
  deleteContact,
  exportContactsCsv,
} from "@/actions/contact-db";
import { toast } from "sonner";

export default function AdminContactDbPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (p = 1, s = search, v = verifiedOnly) => {
    setIsLoading(true);
    try {
      const [contactsRes, statsRes] = await Promise.all([
        getContactsFromDb({ page: p, limit: 50, search: s || undefined, emailVerifiedOnly: v }),
        getContactDbStats(),
      ]);
      if (contactsRes.success) {
        setContacts(contactsRes.contacts ?? []);
        setTotal(contactsRes.total ?? 0);
        setPages(contactsRes.pages ?? 1);
      } else {
        toast.error(contactsRes.error ?? "Erreur lors du chargement");
      }
      if (statsRes.success) setStats(statsRes);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(1); load(1, val, verifiedOnly); }, 400);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteContact(id);
    if (res.success) {
      toast.success("Contact supprimé");
      load(page);
    } else {
      toast.error(res.error ?? "Erreur lors de la suppression");
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportContactsCsv();
      if (!res.success || !res.csv) {
        toast.error(res.error ?? "Erreur export");
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-db-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export CSV téléchargé");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-violet-600" />
              Base de Contacts
            </h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Tous les contacts accumulés depuis les recherches des clients · Admin uniquement
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load(page)} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exporter CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total contacts", value: stats.total, icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
              { label: "Emails vérifiés", value: stats.verified, icon: Mail, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Avec LinkedIn", value: stats.withLinkedIn, icon: Link, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Entreprises uniques", value: stats.companies, icon: Building2, color: "text-orange-600", bg: "bg-orange-50" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className="bg-white border-gray-200/60 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${color}`}>{value ?? 0}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Sources breakdown */}
        {stats?.bySource && Object.keys(stats.bySource).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sources :</span>
            {Object.entries(stats.bySource as Record<string, number>).map(([src, count]) => (
              <Badge key={src} variant="outline" className={`text-xs ${src === "apollo" ? "border-orange-200 text-orange-600" : "border-gray-200 text-gray-500"}`}>
                {src} · {count}
              </Badge>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Input
            placeholder="Rechercher par nom, email, entreprise..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-sm bg-white border-gray-200"
          />
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => { setVerifiedOnly(e.target.checked); setPage(1); load(1, search, e.target.checked); }}
              className="rounded"
            />
            Emails vérifiés uniquement
          </label>
          <span className="ml-auto text-sm text-gray-400">{total} contact{total > 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <Card className="bg-white border-gray-200/60 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <FileSpreadsheet className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Aucun contact dans la base</p>
                <p className="text-xs mt-1 text-gray-300">
                  Les contacts sont sauvegardés automatiquement lors des recherches clients
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/60">
                    <tr>
                      {["Nom", "Poste", "Entreprise", "Email", "Localisation", "Vu", "Source", ""].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                          {c.linkedInUrl && (
                            <a href={c.linkedInUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-400 hover:text-blue-600 inline-flex items-center">
                              <Linkedin className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{c.jobTitle || "—"}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.company || "—"}</td>
                        <td className="px-4 py-3">
                          {c.email ? (
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className={c.emailVerified ? "text-emerald-600 font-medium" : "text-gray-500"}>{c.email}</span>
                              {c.emailVerified && <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{c.location || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{c.seenCount}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${c.source === "apollo" ? "border-orange-200 text-orange-600" : "border-gray-200 text-gray-500"}`}>
                            {c.source}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                            title="Supprimer ce contact"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { setPage(page - 1); load(page - 1); }}>
              Précédent
            </Button>
            <span className="text-sm text-gray-500">Page {page} / {pages}</span>
            <Button variant="outline" size="sm" disabled={page === pages} onClick={() => { setPage(page + 1); load(page + 1); }}>
              Suivant
            </Button>
          </div>
        )}

        {/* Top companies */}
        {stats?.topCompanies?.length > 0 && (
          <Card className="bg-white border-gray-200/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Top entreprises</CardTitle>
              <CardDescription className="text-xs">Les entreprises les plus représentées dans la base</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(stats.topCompanies as { company: string; count: number }[]).map(({ company, count }) => (
                  <Badge key={company} variant="outline" className="text-xs border-gray-200 text-gray-600">
                    {company} · {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
