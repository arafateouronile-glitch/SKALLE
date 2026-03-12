"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Code2,
  Key,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronRight,
  Globe,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

// ── Composant CodeBlock ───────────────────────────────────────────────────────

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const copy = () => {
    navigator.clipboard.writeText(code.trim());
    toast.success("Copié !");
  };
  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          className="h-6 px-2 text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <Copy className="h-3 w-3 mr-1" />
          Copier
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="text-gray-100 font-mono leading-relaxed">{code.trim()}</code>
      </pre>
    </div>
  );
}

// ── Composant Endpoint ────────────────────────────────────────────────────────

function EndpointBadge({ method }: { method: "POST" | "GET" | "DELETE" | "PATCH" }) {
  const colors = {
    POST: "bg-emerald-100 text-emerald-700 border-emerald-200",
    GET: "bg-blue-100 text-blue-700 border-blue-200",
    DELETE: "bg-red-100 text-red-700 border-red-200",
    PATCH: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors[method]}`}>
      {method}
    </span>
  );
}

function ParamRow({
  name,
  type,
  required,
  description,
}: {
  name: string;
  type: string;
  required: boolean;
  description: string;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 pr-4 align-top">
        <code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
          {name}
        </code>
      </td>
      <td className="py-2 pr-4 align-top">
        <code className="text-xs text-gray-500">{type}</code>
      </td>
      <td className="py-2 pr-4 align-top">
        {required ? (
          <Badge className="bg-red-50 text-red-600 border-red-200 text-[10px]">requis</Badge>
        ) : (
          <Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">
            optionnel
          </Badge>
        )}
      </td>
      <td className="py-2 align-top text-sm text-gray-600">{description}</td>
    </tr>
  );
}

function EndpointCard({
  method,
  path,
  title,
  description,
  children,
}: {
  method: "POST" | "GET" | "DELETE" | "PATCH";
  path: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EndpointBadge method={method} />
            <code className="text-sm font-mono text-gray-800">{path}</code>
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <CardTitle className="text-gray-900 text-base mt-1">{title}</CardTitle>
        <CardDescription className="text-gray-500">{description}</CardDescription>
      </CardHeader>
      {open && <CardContent className="space-y-6">{children}</CardContent>}
    </Card>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

const BASE_URL = "https://votre-domaine.com";

const CURL_LEADS = `curl -X POST ${BASE_URL}/api/v1/leads \\
  -H "Authorization: Bearer sk_live_VOTRE_CLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Alice Martin",
    "company": "Acme Corp",
    "email": "alice@acme.com",
    "jobTitle": "Directrice Marketing",
    "linkedInUrl": "https://linkedin.com/in/alice-martin",
    "notes": "Intéressée par notre offre AGENCY"
  }'`;

const JS_LEADS = `const response = await fetch("${BASE_URL}/api/v1/leads", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_VOTRE_CLE",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Alice Martin",
    company: "Acme Corp",
    email: "alice@acme.com",
    jobTitle: "Directrice Marketing",
    linkedInUrl: "https://linkedin.com/in/alice-martin",
    notes: "Intéressée par notre offre AGENCY",
  }),
});

const data = await response.json();
// { id: "...", name: "Alice Martin", company: "Acme Corp", email: "...", createdAt: "..." }`;

const PYTHON_LEADS = `import requests

response = requests.post(
    "${BASE_URL}/api/v1/leads",
    headers={
        "Authorization": "Bearer sk_live_VOTRE_CLE",
        "Content-Type": "application/json",
    },
    json={
        "name": "Alice Martin",
        "company": "Acme Corp",
        "email": "alice@acme.com",
        "jobTitle": "Directrice Marketing",
        "linkedInUrl": "https://linkedin.com/in/alice-martin",
        "notes": "Intéressée par notre offre AGENCY",
    },
)

data = response.json()
# {"id": "...", "name": "Alice Martin", "company": "Acme Corp", ...}`;

const CURL_SEO = `curl -X POST ${BASE_URL}/api/v1/seo/generate \\
  -H "Authorization: Bearer sk_live_VOTRE_CLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keyword": "logiciel CRM PME 2025",
    "tone": "professional",
    "language": "fr"
  }'`;

const JS_SEO = `const response = await fetch("${BASE_URL}/api/v1/seo/generate", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_VOTRE_CLE",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    keyword: "logiciel CRM PME 2025",
    tone: "professional",   // professional | casual | expert | friendly
    language: "fr",         // fr | en | es | de | ...
  }),
});

// HTTP 202 Accepted — la génération est asynchrone
const data = await response.json();
// {
//   success: true,
//   data: {
//     jobId: "01HXY...",
//     message: "Génération lancée. L'article apparaîtra dans votre workspace.",
//     keyword: "logiciel CRM PME 2025"
//   }
// }`;

const PYTHON_SEO = `import requests

response = requests.post(
    "${BASE_URL}/api/v1/seo/generate",
    headers={
        "Authorization": "Bearer sk_live_VOTRE_CLE",
        "Content-Type": "application/json",
    },
    json={
        "keyword": "logiciel CRM PME 2025",
        "tone": "professional",
        "language": "fr",
    },
)

# HTTP 202 Accepted
data = response.json()
# {"success": True, "data": {"jobId": "...", "keyword": "..."}}`;

const ZAPIER_SNIPPET = `// Dans Zapier — étape "Code by Zapier" (JavaScript)
const response = await fetch("${BASE_URL}/api/v1/leads", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${inputData.apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: inputData.name,
    company: inputData.company,
    email: inputData.email,
  }),
});
return await response.json();`;

export default function DeveloperPage() {
  return (
    <div className="space-y-10 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Code2 className="h-8 w-8 text-emerald-600" />
          <h1 className="text-3xl font-bold text-gray-900">API Reference</h1>
        </div>
        <p className="text-gray-500">
          Intégrez Skalle dans vos workflows — Zapier, Make, Airtable, ou tout outil capable d&apos;envoyer des requêtes HTTP.
        </p>
      </div>

      {/* Auth */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Lock className="h-5 w-5 text-emerald-600" />
          Authentification
        </h2>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Toutes les requêtes doivent inclure un header{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">Authorization</code>{" "}
              avec une clé API au format{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">Bearer sk_live_…</code>.
            </p>

            <CodeBlock
              language="HTTP Header"
              code="Authorization: Bearer sk_live_a1b2c3d4e5f6..."
            />

            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                <strong>Accès réservé aux plans AGENCY et SCALE.</strong> Créez vos clés dans{" "}
                <Link
                  href="/marketing-os/settings?tab=api"
                  className="underline hover:text-amber-900"
                >
                  Paramètres → Clés API
                </Link>
                .
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Base URL */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-600" />
          Base URL
        </h2>
        <CodeBlock language="URL" code={`${BASE_URL}/api/v1`} />
      </section>

      {/* Endpoints */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Zap className="h-5 w-5 text-emerald-600" />
          Endpoints
        </h2>

        {/* POST /leads */}
        <EndpointCard
          method="POST"
          path="/api/v1/leads"
          title="Créer un prospect"
          description="Injecte un lead dans votre CRM depuis n'importe quel outil externe (Typeform, Zapier, Make, formulaire site…). Déclenche automatiquement l'enrichissement IA du prospect."
        >
          {/* Paramètres */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Corps de la requête (JSON)</h4>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Champ</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Type</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Statut</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Description</th>
                  </tr>
                </thead>
                <tbody className="px-3 divide-y divide-gray-100">
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">name</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge className="bg-red-50 text-red-600 border-red-200 text-[10px]">requis</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">Nom complet du prospect (max 200 car.)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">company</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge className="bg-red-50 text-red-600 border-red-200 text-[10px]">requis</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">Nom de l'entreprise (max 200 car.)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">email</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">optionnel</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">Email professionnel. Doit être unique par workspace.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">jobTitle</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">optionnel</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">Poste du prospect (max 200 car.)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">linkedInUrl</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string (url)</code></td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">optionnel</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">URL LinkedIn complète</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">notes</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">optionnel</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">Notes contextuelles (max 2000 car.)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Réponse */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Réponse — <code className="text-emerald-600">201 Created</code>
              </h4>
              <CodeBlock
                language="JSON"
                code={`{
  "id": "clx8f9z0a000001q2...",
  "name": "Alice Martin",
  "company": "Acme Corp",
  "email": "alice@acme.com",
  "createdAt": "2025-03-11T08:30:00.000Z"
}`}
              />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Coût en crédits</h4>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="font-semibold text-gray-900">1 crédit</span>
                  <span className="text-gray-500">par prospect créé</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Débité après la création réussie du prospect.
                </p>
              </div>
            </div>
          </div>

          {/* Code examples */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Exemples</h4>
            <Tabs defaultValue="curl">
              <TabsList className="bg-gray-100 border border-gray-200">
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="js">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="zapier">Zapier</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-3">
                <CodeBlock language="bash" code={CURL_LEADS} />
              </TabsContent>
              <TabsContent value="js" className="mt-3">
                <CodeBlock language="javascript" code={JS_LEADS} />
              </TabsContent>
              <TabsContent value="python" className="mt-3">
                <CodeBlock language="python" code={PYTHON_LEADS} />
              </TabsContent>
              <TabsContent value="zapier" className="mt-3">
                <CodeBlock language="javascript" code={ZAPIER_SNIPPET} />
              </TabsContent>
            </Tabs>
          </div>
        </EndpointCard>

        {/* POST /seo/generate */}
        <EndpointCard
          method="POST"
          path="/api/v1/seo/generate"
          title="Générer un article SEO"
          description="Déclenche la génération asynchrone d'un article SEO optimisé. Répond immédiatement en 202 — l'article apparaît dans votre workspace une fois rédigé (généralement < 2 min)."
        >
          {/* Paramètres */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Corps de la requête (JSON)</h4>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Champ</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Type</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Statut</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">keyword</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge className="bg-red-50 text-red-600 border-red-200 text-[10px]">requis</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">Mot-clé cible principal (max 300 car.)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">tone</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string</code></td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">optionnel</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">
                      Ton de rédaction. Valeurs : <code className="bg-gray-100 px-1 rounded text-xs">professional</code>{" "}
                      <code className="bg-gray-100 px-1 rounded text-xs">casual</code>{" "}
                      <code className="bg-gray-100 px-1 rounded text-xs">expert</code>{" "}
                      <code className="bg-gray-100 px-1 rounded text-xs">friendly</code>.
                      Défaut : <code className="bg-gray-100 px-1 rounded text-xs">professional</code>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3"><code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">language</code></td>
                    <td className="py-2 px-3"><code className="text-xs text-gray-500">string (ISO 639-1)</code></td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">optionnel</Badge></td>
                    <td className="py-2 px-3 text-sm text-gray-600">
                      Langue de rédaction (ex. <code className="bg-gray-100 px-1 rounded text-xs">fr</code>{" "}
                      <code className="bg-gray-100 px-1 rounded text-xs">en</code>{" "}
                      <code className="bg-gray-100 px-1 rounded text-xs">es</code>).
                      Défaut : <code className="bg-gray-100 px-1 rounded text-xs">fr</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Réponse */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Réponse — <code className="text-blue-600">202 Accepted</code>
              </h4>
              <CodeBlock
                language="JSON"
                code={`{
  "success": true,
  "data": {
    "jobId": "01HXY4Z9ABCDEF...",
    "message": "Génération lancée. L'article apparaîtra dans votre workspace.",
    "keyword": "logiciel CRM PME 2025"
  }
}`}
              />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Coût en crédits</h4>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="font-semibold text-gray-900">20 crédits</span>
                  <span className="text-gray-500">par article</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Débités immédiatement à la réception de la requête.
                  La génération est asynchrone — l&apos;article apparaît sous ~2 min.
                </p>
              </div>
            </div>
          </div>

          {/* Code examples */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Exemples</h4>
            <Tabs defaultValue="curl">
              <TabsList className="bg-gray-100 border border-gray-200">
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="js">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-3">
                <CodeBlock language="bash" code={CURL_SEO} />
              </TabsContent>
              <TabsContent value="js" className="mt-3">
                <CodeBlock language="javascript" code={JS_SEO} />
              </TabsContent>
              <TabsContent value="python" className="mt-3">
                <CodeBlock language="python" code={PYTHON_SEO} />
              </TabsContent>
            </Tabs>
          </div>
        </EndpointCard>
      </section>

      {/* Codes d'erreur */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-emerald-600" />
          Codes d&apos;erreur
        </h2>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Code HTTP</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Signification</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Cause courante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    {
                      code: "400",
                      color: "bg-orange-100 text-orange-700",
                      label: "Bad Request",
                      cause: "Corps JSON invalide ou champ requis manquant / hors limites",
                    },
                    {
                      code: "401",
                      color: "bg-red-100 text-red-700",
                      label: "Unauthorized",
                      cause: "Header Authorization absent, mal formaté, ou clé API invalide",
                    },
                    {
                      code: "402",
                      color: "bg-amber-100 text-amber-700",
                      label: "Payment Required",
                      cause: "Crédits insuffisants sur votre compte",
                    },
                    {
                      code: "403",
                      color: "bg-purple-100 text-purple-700",
                      label: "Forbidden",
                      cause: "Plan insuffisant — AGENCY ou SCALE requis",
                    },
                    {
                      code: "409",
                      color: "bg-blue-100 text-blue-700",
                      label: "Conflict",
                      cause: "Un prospect avec cet email existe déjà dans le workspace",
                    },
                    {
                      code: "500",
                      color: "bg-gray-100 text-gray-700",
                      label: "Internal Server Error",
                      cause: "Erreur serveur — contactez le support si le problème persiste",
                    },
                  ].map((row) => (
                    <tr key={row.code} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${row.color}`}>
                          {row.code}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-800">{row.label}</td>
                      <td className="py-3 px-4 text-gray-500">{row.cause}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Format d&apos;erreur</h4>
          <CodeBlock
            language="JSON"
            code={`{
  "error": "Crédits insuffisants. Requis: 20, Disponibles: 5"
}

// Ou avec détails de validation (400)
{
  "error": "Données invalides",
  "details": {
    "fieldErrors": { "keyword": ["String must contain at least 1 character(s)"] },
    "formErrors": []
  }
}`}
          />
        </div>
      </section>

      {/* Plans & Crédits */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Key className="h-5 w-5 text-emerald-600" />
          Plans & Accès API
        </h2>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Plan</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Crédits/mois</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Accès API</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Clés max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { plan: "FREE", credits: "100", api: false, keys: "—" },
                    { plan: "BUSINESS", credits: "600", api: false, keys: "—" },
                    { plan: "AGENCY", credits: "2 000", api: true, keys: "10" },
                    { plan: "SCALE", credits: "6 000", api: true, keys: "10" },
                  ].map((row) => (
                    <tr key={row.plan} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            row.api
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-gray-100 text-gray-500 border-gray-200"
                          }
                        >
                          {row.plan}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-700">{row.credits}</td>
                      <td className="py-3 px-4">
                        {row.api ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500">{row.keys}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-gray-900 text-base">Coût des opérations API</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { op: "POST /api/v1/leads", cost: 1, desc: "Création d'un prospect" },
                { op: "POST /api/v1/seo/generate", cost: 20, desc: "Génération article SEO" },
              ].map((item) => (
                <div
                  key={item.op}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <div>
                    <code className="text-xs font-mono text-gray-700">{item.op}</code>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <Zap className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-sm font-bold text-gray-900">{item.cost}</span>
                    <span className="text-xs text-gray-400">cr.</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Lien clés API */}
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">Prêt à intégrer ?</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Générez votre première clé API depuis les paramètres.
          </p>
        </div>
        <Link href="/marketing-os/settings">
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <Key className="h-4 w-4 mr-2" />
            Gérer mes clés
          </Button>
        </Link>
      </div>
    </div>
  );
}
