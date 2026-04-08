"use server";

/**
 * 📧 Email Campaign Actions
 *
 * Server actions pour la gestion des campagnes email et config SMTP.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifySmtpConnection, SMTP_PRESETS } from "@/lib/email/smtp-transport";
import { encrypt, decryptIfNeeded } from "@/lib/encryption";
import { personalizeEmail, hasAIPersonalization } from "@/lib/email/personalize-email";
import { getDefaultCampaignTemplates, type StepTemplate } from "@/lib/email/template-personalization";
import { getOpenAI } from "@/lib/ai/langchain";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!workspace) {
    throw new Error("Workspace non trouvé");
  }
  return workspace;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 SMTP CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  provider: z.string().default("custom"),
  label: z.string().optional(),
  imapHost: z.string().optional(),
  imapPort: z.number().optional(),
  imapSecure: z.boolean().optional(),
});

export async function saveSmtpConfig(
  workspaceId: string,
  config: z.input<typeof smtpConfigSchema>
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const parsed = smtpConfigSchema.safeParse(config);
    if (!parsed.success) {
      return { success: false, error: "Configuration invalide" };
    }

    const preset = SMTP_PRESETS[parsed.data.provider] || SMTP_PRESETS.custom;

    // Vérifier s'il y a déjà des configs pour ce workspace
    const existingCount = await prisma.smtpConfig.count({
      where: { workspaceId },
    });

    const result = await prisma.smtpConfig.upsert({
      where: {
        workspaceId_fromEmail: {
          workspaceId,
          fromEmail: parsed.data.fromEmail,
        },
      },
      create: {
        workspaceId,
        host: parsed.data.host,
        port: parsed.data.port,
        secure: parsed.data.secure,
        username: parsed.data.username,
        password: encrypt(parsed.data.password),
        fromEmail: parsed.data.fromEmail,
        fromName: parsed.data.fromName,
        provider: parsed.data.provider,
        label: parsed.data.label || "Principal",
        imapHost: parsed.data.imapHost || null,
        imapPort: parsed.data.imapPort || null,
        imapSecure: parsed.data.imapSecure ?? true,
        dailyLimit: preset.dailyLimit,
        perMinuteLimit: preset.perMinuteLimit,
        isDefault: existingCount === 0,
      },
      update: {
        host: parsed.data.host,
        port: parsed.data.port,
        secure: parsed.data.secure,
        username: parsed.data.username,
        password: encrypt(parsed.data.password),
        fromName: parsed.data.fromName,
        provider: parsed.data.provider,
        label: parsed.data.label,
        imapHost: parsed.data.imapHost,
        imapPort: parsed.data.imapPort,
        imapSecure: parsed.data.imapSecure,
        dailyLimit: preset.dailyLimit,
        perMinuteLimit: preset.perMinuteLimit,
        isVerified: false,
      },
    });

    return { success: true, data: { id: result.id } };
  } catch (error) {
    console.error("Save SMTP config error:", error);
    return { success: false, error: String(error) };
  }
}

export async function testSmtpConnection(
  configId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const config = await prisma.smtpConfig.findFirst({
      where: {
        id: configId,
        workspace: { userId: session.user!.id! },
      },
    });

    if (!config) {
      return { success: false, error: "SMTP non configuré" };
    }

    const result = await verifySmtpConnection({
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      password: decryptIfNeeded(config.password),
    });

    if (result.success) {
      await prisma.smtpConfig.update({
        where: { id: configId },
        data: { isVerified: true, lastVerifiedAt: new Date() },
      });
    }

    return result;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getSmtpConfigs(
  workspaceId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const configs = await prisma.smtpConfig.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return {
      success: true,
      data: configs.map((config) => ({
        ...config,
        password: "••••••••",
      })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteSmtpConfig(
  configId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const config = await prisma.smtpConfig.findFirst({
      where: {
        id: configId,
        workspace: { userId: session.user!.id! },
      },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    await prisma.smtpConfig.delete({ where: { id: configId } });

    // Si c'était le default, promouvoir un autre
    if (config.isDefault) {
      const next = await prisma.smtpConfig.findFirst({
        where: { workspaceId: config.workspaceId },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await prisma.smtpConfig.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function setDefaultSmtpConfig(
  configId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const config = await prisma.smtpConfig.findFirst({
      where: {
        id: configId,
        workspace: { userId: session.user!.id! },
      },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    // Retirer le default de tous les autres
    await prisma.smtpConfig.updateMany({
      where: { workspaceId: config.workspaceId },
      data: { isDefault: false },
    });

    await prisma.smtpConfig.update({
      where: { id: configId },
      data: { isDefault: true },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CAMPAIGN CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function createCampaign(
  workspaceId: string,
  data: {
    name: string;
    prospectIds: string[];
    stepTemplates: StepTemplate[];
    personalizationMode: "ai" | "template";
    smtpConfigId?: string;
  }
): Promise<{ success: boolean; campaignId?: string; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    if (!data.name || data.prospectIds.length === 0 || data.stepTemplates.length === 0) {
      return { success: false, error: "Données manquantes" };
    }

    // Vérifier que les prospects existent et appartiennent au workspace
    const prospects = await prisma.prospect.findMany({
      where: {
        id: { in: data.prospectIds },
        workspaceId,
      },
      select: { id: true, email: true, name: true },
    });

    if (prospects.length === 0) {
      return { success: false, error: "Aucun prospect trouvé" };
    }

    // Créer la campagne
    const campaign = await prisma.emailCampaign.create({
      data: {
        name: data.name,
        workspaceId,
        smtpConfigId: data.smtpConfigId || null,
        stepTemplates: data.stepTemplates as any,
        personalizationMode: data.personalizationMode,
        totalProspects: prospects.length,
        status: "DRAFT",
      },
    });

    // Créer une OutreachSequence + SequenceSteps pour chaque prospect
    for (const prospect of prospects) {
      const sequence = await prisma.outreachSequence.create({
        data: {
          prospectId: prospect.id,
          name: `${data.name} - ${prospect.name}`,
          workspaceId,
          campaignId: campaign.id,
          isActive: false,
        },
      });

      // Créer les steps (non personnalisés pour l'instant)
      for (const template of data.stepTemplates) {
        await prisma.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: template.stepNumber,
            channel: "EMAIL",
            subject: template.subject,
            content: template.content,
            delayDays: template.delayDays,
            status: "PENDING",
          },
        });
      }
    }

    return { success: true, campaignId: campaign.id };
  } catch (error) {
    console.error("Create campaign error:", error);
    return { success: false, error: String(error) };
  }
}

export async function getCampaigns(
  workspaceId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const campaigns = await prisma.emailCampaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        sequences: {
          include: {
            prospect: { select: { id: true, name: true, email: true, company: true } },
            steps: { select: { status: true, stepNumber: true, sentAt: true } },
          },
        },
      },
    });

    return { success: true, data: campaigns };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getCampaignDetail(
  campaignId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        sequences: {
          include: {
            prospect: true,
            steps: { orderBy: { stepNumber: "asc" } },
          },
        },
      },
    });

    if (!campaign) {
      return { success: false, error: "Campagne non trouvée" };
    }

    return { success: true, data: campaign };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 CAMPAIGN LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

export async function personalizeCampaign(
  campaignId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        sequences: {
          include: {
            prospect: true,
            steps: { orderBy: { stepNumber: "asc" } },
          },
        },
      },
    });

    if (!campaign) {
      return { success: false, error: "Campagne non trouvée" };
    }

    // Récupérer la config SMTP : campagne-spécifique ou default du workspace
    const smtpConfig = campaign.smtpConfigId
      ? await prisma.smtpConfig.findUnique({ where: { id: campaign.smtpConfigId } })
      : await prisma.smtpConfig.findFirst({
          where: { workspaceId: campaign.workspaceId, isDefault: true },
        });

    const sender = {
      name: smtpConfig?.fromName || "Équipe",
      email: smtpConfig?.fromEmail || "",
      company: "Skalle",
    };

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "PERSONALIZING" },
    });

    const stepTemplates = campaign.stepTemplates as unknown as StepTemplate[];

    // Personnaliser chaque step de chaque séquence
    for (const sequence of campaign.sequences) {
      for (const step of sequence.steps) {
        const template = stepTemplates.find(
          (t) => t.stepNumber === step.stepNumber
        );
        if (!template) continue;

        const result = await personalizeEmail({
          prospect: sequence.prospect,
          stepTemplate: template,
          mode: campaign.personalizationMode as "ai" | "template",
          sender,
        });

        await prisma.sequenceStep.update({
          where: { id: step.id },
          data: {
            subject: result.subject,
            content: result.content,
            metadata: {
              personalizationScore: result.personalizationScore,
              personalizationMode: result.mode,
              personalizedAt: new Date().toISOString(),
            },
          },
        });
      }
    }

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "READY" },
    });

    return { success: true };
  } catch (error) {
    console.error("Personalize campaign error:", error);
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    }).catch(() => {});
    return { success: false, error: String(error) };
  }
}

export async function launchCampaign(
  campaignId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return { success: false, error: "Campagne non trouvée" };
    }

    if (campaign.status !== "READY" && campaign.status !== "PAUSED") {
      return { success: false, error: `Campagne en statut ${campaign.status}, ne peut pas être lancée` };
    }

    // Vérifier SMTP : campagne-spécifique ou default du workspace
    const smtp = campaign.smtpConfigId
      ? await prisma.smtpConfig.findUnique({ where: { id: campaign.smtpConfigId } })
      : await prisma.smtpConfig.findFirst({
          where: { workspaceId: campaign.workspaceId, isDefault: true },
        });

    const hasEmailFallback = !!(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);
    if ((!smtp || !smtp.isVerified) && !hasEmailFallback) {
      return { success: false, error: "Aucun provider email configuré. Configurez un SMTP ou ajoutez RESEND_API_KEY / SENDGRID_API_KEY." };
    }

    // Réinitialiser les steps 1 FAILED non envoyés (permet de relancer une campagne)
    await prisma.sequenceStep.updateMany({
      where: {
        sequence: { campaignId },
        stepNumber: 1,
        status: "FAILED",
        sentAt: null,
      },
      data: { status: "PENDING", error: null },
    });

    // Activer les séquences et passer en SENDING
    await prisma.outreachSequence.updateMany({
      where: { campaignId },
      data: { isActive: true },
    });

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "SENDING" },
    });

    // Déclencher l'envoi via Inngest
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "campaign/launch",
        data: { campaignId },
      });
    } catch (inngestError) {
      // Inngest indisponible → remettre en PAUSED pour permettre un retry
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: "PAUSED" },
      });
      await prisma.outreachSequence.updateMany({
        where: { campaignId },
        data: { isActive: false },
      });
      console.error("Inngest send error:", inngestError);
      return { success: false, error: "Serveur Inngest non disponible. Lancez `npm run dev:all`." };
    }

    return { success: true };
  } catch (error) {
    console.error("Launch campaign error:", error);
    return { success: false, error: String(error) };
  }
}

export async function pauseCampaign(
  campaignId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "PAUSED" },
    });

    await prisma.outreachSequence.updateMany({
      where: { campaignId },
      data: { isActive: false },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 👁️ PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

export async function previewPersonalization(
  workspaceId: string,
  prospectId: string,
  stepTemplate: StepTemplate,
  mode: "ai" | "template"
): Promise<{ success: boolean; data?: { subject: string; content: string; score: number }; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const prospect = await prisma.prospect.findFirst({
      where: { id: prospectId, workspaceId },
    });

    if (!prospect) {
      return { success: false, error: "Prospect non trouvé" };
    }

    const smtpConfig = await prisma.smtpConfig.findFirst({
      where: { workspaceId, isDefault: true },
    });

    const sender = {
      name: smtpConfig?.fromName || "Équipe",
      email: smtpConfig?.fromEmail || "",
      company: "Skalle",
    };

    const result = await personalizeEmail({
      prospect,
      stepTemplate,
      mode,
      sender,
    });

    return {
      success: true,
      data: { subject: result.subject, content: result.content, score: result.personalizationScore },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 GÉNÉRATION IA - Template à partir du but de la campagne
// ═══════════════════════════════════════════════════════════════════════════

export async function generateCampaignTemplatesFromGoal(
  campaignGoal: string,
  stepCount: 2 | 3
): Promise<{ success: boolean; templates?: StepTemplate[]; error?: string }> {
  try {
    if (!hasAIPersonalization()) {
      return { success: false, error: "Clé API OpenAI requise pour la génération" };
    }
    if (!campaignGoal?.trim()) {
      return { success: false, error: "Indiquez le but de la campagne" };
    }

    const llm = getOpenAI();
    const prompt = `Tu es un expert en cold email B2B. À partir du but de campagne suivant, rédige une séquence de ${stepCount} emails (premier contact, relance(s)) au format JSON.

But de la campagne :
"""
${campaignGoal.trim()}
"""

Règles :
- Chaque email doit être personnalisable par prospect : utilise les variables {firstName}, {company}, {jobTitle}, {industry}, {senderName}, {senderCompany} dans le contenu et l'objet.
- Ton professionnel mais humain, court (pas de pavés).
- Premier email : accroche claire, valeur proposée, call-to-action (ex. échange de 15 min).
- Emails suivants : relances courtes, rappel de la valeur, délais en jours (2-5 jours entre chaque).
- Contenu en HTML simple : <p>, <br/>, pas de CSS.

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni \`\`\`json. Format :
[
  { "stepNumber": 1, "subject": "Objet avec {firstName}", "content": "<p>...</p>", "delayDays": 0 },
  { "stepNumber": 2, "subject": "Re: ...", "content": "<p>...</p>", "delayDays": 3 }
]
Pour 3 emails, ajoute un 3e objet avec stepNumber 3 et delayDays 5.`;

    const response = await llm.invoke(prompt);
    const text = typeof response.content === "string" ? response.content : String(response.content ?? "");
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr) as Array<{
      stepNumber: number;
      subject: string;
      content: string;
      delayDays: number;
    }>;

    const templates: StepTemplate[] = parsed
      .filter((t) => t.stepNumber >= 1 && t.stepNumber <= stepCount)
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .slice(0, stepCount)
      .map((t) => ({
        stepNumber: t.stepNumber,
        subject: t.subject || "",
        content: t.content || "",
        delayDays: typeof t.delayDays === "number" ? t.delayDays : 3,
      }));

    if (templates.length === 0) {
      return { success: false, error: "Aucun template valide généré" };
    }

    // S'assurer que stepNumber est 1, 2, 3...
    templates.forEach((t, i) => {
      t.stepNumber = i + 1;
    });

    return { success: true, templates };
  } catch (error) {
    console.error("generateCampaignTemplatesFromGoal error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la génération",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ UTILS
// ═══════════════════════════════════════════════════════════════════════════

export async function getDefaultTemplates(): Promise<{
  success: boolean;
  templates2?: StepTemplate[];
  templates3?: StepTemplate[];
  hasAI?: boolean;
}> {
  return {
    success: true,
    templates2: getDefaultCampaignTemplates(2),
    templates3: getDefaultCampaignTemplates(3),
    hasAI: hasAIPersonalization(),
  };
}
