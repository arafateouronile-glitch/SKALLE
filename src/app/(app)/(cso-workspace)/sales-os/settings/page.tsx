import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  User,
  CreditCard,
  Zap,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { CalendarLinkForm } from "@/components/modules/calendar-link-form";
import { ProfileForm } from "@/components/modules/settings/profile-form";
import { SignatureForm } from "@/components/modules/settings/signature-form";
import { SmtpConfigForm } from "@/components/campaigns/smtp-config-form";
import { ChromeExtensionCard } from "@/components/modules/cso/chrome-extension-card";
import { BrandVoiceCard } from "@/components/modules/cso/brand-voice-card";
import { ApolloSettingsCard } from "@/components/modules/cso/apollo-settings-card";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Gratuit",
  BUSINESS: "Business",
  AGENCY: "Agence",
  SCALE: "Scale",
};

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-700",
  BUSINESS: "bg-blue-100 text-blue-700",
  AGENCY: "bg-violet-100 text-violet-700",
  SCALE: "bg-amber-100 text-amber-700",
};

export default async function SalesSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      plan: true,
      credits: true,
      workspaces: {
        select: {
          id: true,
          name: true,
          hasCmoAccess: true,
          hasCsoAccess: true,
          calendarLink: true,
          brandVoice: true,
          signature: true,
          extensionTokens: {
            select: { token: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        take: 1,
      },
    },
  });

  if (!user) redirect("/login");

  const workspace = user.workspaces[0];
  const extensionToken = workspace?.extensionTokens?.[0]?.token ?? null;

  const personas = workspace
    ? await prisma.persona.findMany({
        where: { workspaceId: workspace.id, status: { in: ["ACTIVE", "RUNNING", "PAUSED"] } },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
        take: 10,
      })
    : [];
  const planLabel = PLAN_LABELS[user.plan] ?? user.plan;
  const planColor = PLAN_COLORS[user.plan] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-violet-600" />
          Paramètres
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Gérez votre compte et votre abonnement Skalle CSO.
        </p>
      </div>

      {/* Profile */}
      <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            Profil
          </CardTitle>
          <CardDescription>Informations de votre compte</CardDescription>
        </CardHeader>
        {workspace ? (
          <ProfileForm
            workspaceId={workspace.id}
            userName={user.name ?? null}
            email={user.email!}
            workspaceName={workspace.name}
          />
        ) : (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Nom</p>
                <p className="text-sm font-medium text-gray-900">{user.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Plan & Crédits */}
      <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-500" />
            Plan & Crédits
          </CardTitle>
          <CardDescription>Votre abonnement et vos crédits IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">Plan actuel</p>
              <Badge className={`${planColor} border-0`}>{planLabel}</Badge>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Crédits disponibles</p>
              <p className="text-2xl font-bold text-gray-900">
                {user.credits.toLocaleString("fr-FR")}
              </p>
            </div>
          </div>

          <Separator />

          {/* Accès produits */}
          <div>
            <p className="text-xs text-gray-500 mb-3">Accès produits</p>
            <div className="flex gap-3">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
                  workspace?.hasCmoAccess
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-gray-50 border-gray-200 text-gray-400"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Marketing OS (CMO)
                {workspace?.hasCmoAccess ? " ✓" : " ✗"}
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
                  workspace?.hasCsoAccess
                    ? "bg-violet-50 border-violet-200 text-violet-700"
                    : "bg-gray-50 border-gray-200 text-gray-400"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Sales OS (CSO)
                {workspace?.hasCsoAccess ? " ✓" : " ✗"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMTP — Compte email d'envoi */}
      {workspace && (
        <SmtpConfigForm workspaceId={workspace.id} />
      )}

      {/* Brand Voice — contexte produit */}
      {workspace && (
        <BrandVoiceCard
          workspaceId={workspace.id}
          initial={(workspace.brandVoice ?? {}) as Record<string, unknown>}
        />
      )}

      {/* Apollo — Découverte de prospects */}
      {workspace && (
        <ApolloSettingsCard
          workspaceId={workspace.id}
          personas={personas}
        />
      )}

      {/* Signature */}
      {workspace && (
        <SignatureForm
          workspaceId={workspace.id}
          initial={workspace.signature ?? null}
        />
      )}

      {/* Extension Chrome */}
      {workspace && (
        <ChromeExtensionCard
          token={extensionToken}
          workspaceId={workspace.id}
        />
      )}

      {/* Lien de réservation d'appel */}
      {workspace && (
        <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-violet-500" />
              Séquences & Automatisation
            </CardTitle>
            <CardDescription>Configurez les éléments injectés dans vos séquences</CardDescription>
          </CardHeader>
          <CardContent>
            <CalendarLinkForm
              workspaceId={workspace.id}
              currentLink={workspace.calendarLink ?? null}
            />
          </CardContent>
        </Card>
      )}

      {/* Si l'utilisateur a aussi le CMO, lien vers les paramètres complets */}
      {workspace?.hasCmoAccess && (
        <Link
          href="/marketing-os/settings"
          className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200/40 text-sm font-medium text-emerald-700 hover:bg-emerald-100/80 transition-all"
        >
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
            <Settings className="h-3.5 w-3.5 text-white" />
          </div>
          Paramètres complets (Marketing OS)
          <ArrowRight className="ml-auto h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
