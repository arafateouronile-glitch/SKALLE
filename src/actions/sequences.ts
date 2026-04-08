"use server";

/**
 * 📧 Outreach Sequences - Séquences Multi-Canal
 * 
 * Gestion des séquences de prospection multi-canal:
 * - Création de séquences (LinkedIn, Email, Phone, SMS)
 * - Envoi automatique selon délais
 * - Tracking complet (sent, delivered, opened, clicked, replied)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { decryptIfNeeded } from "@/lib/encryption";
import { generatePersonalizedEmail, type ProspectData } from "@/lib/prospection/email-personalization";
import { generatePersonalizedLinkedInMessage } from "@/lib/prospection/linkedin-outreach";
import {
  generatePersonalizedCallScript,
  calculateOptimalCallTime,
  generateVoicemailMessage,
  generatePersonalizedSMS,
  type PhoneProspectData,
} from "@/lib/prospection/phone-sms-optimization";

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

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES & SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const sequenceStepSchema = z.object({
  stepNumber: z.number().min(1),
  channel: z.enum(["LINKEDIN", "EMAIL", "PHONE", "SMS"]),
  subject: z.string().optional(),
  content: z.string().min(1),
  delayDays: z.number().min(0).default(3),
});

const sequenceSchema = z.object({
  name: z.string().min(1),
  steps: z.array(sequenceStepSchema).min(1),
  isActive: z.boolean().default(true),
});

export type SequenceStepInput = z.infer<typeof sequenceStepSchema>;
export type SequenceInput = z.infer<typeof sequenceSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 CREATE SEQUENCE - Créer une séquence multi-canal
// ═══════════════════════════════════════════════════════════════════════════

export async function createSequence(
  workspaceId: string,
  prospectId: string,
  data: SequenceInput
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  try {
    const session = await requireAuth();

    // Vérifier la propriété du workspace
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Vérifier que le prospect appartient au workspace
    const prospect = await prisma.prospect.findFirst({
      where: { id: prospectId, workspaceId },
    });

    if (!prospect) {
      return { success: false, error: "Prospect non trouvé" };
    }

    // Valider les données
    const parsed = sequenceSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Données invalides" };
    }

    // Créer la séquence avec les étapes
    const sequence = await prisma.outreachSequence.create({
      data: {
        name: parsed.data.name,
        isActive: parsed.data.isActive,
        prospectId,
        workspaceId,
        steps: {
          create: parsed.data.steps.map((step) => ({
            stepNumber: step.stepNumber,
            channel: step.channel,
            subject: step.subject,
            content: step.content,
            delayDays: step.delayDays,
            status: "PENDING",
          })),
        },
      },
      include: { steps: true },
    });

    return { success: true, data: { id: sequence.id } };
  } catch (error) {
    console.error("Create sequence error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 GET SEQUENCES - Récupérer les séquences d'un prospect
// ═══════════════════════════════════════════════════════════════════════════

export async function getSequences(
  workspaceId: string,
  prospectId?: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const where: any = { workspaceId };
    if (prospectId) {
      where.prospectId = prospectId;
    }

    const sequences = await prisma.outreachSequence.findMany({
      where,
      include: {
        prospect: {
          select: { id: true, name: true, email: true, company: true },
        },
        steps: {
          orderBy: { stepNumber: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: sequences };
  } catch (error) {
    console.error("Get sequences error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ▶️ START SEQUENCE - Démarrer une séquence
// ═══════════════════════════════════════════════════════════════════════════

export async function startSequence(
  sequenceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user!.id! },
      select: { id: true },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }
    const sequence = await prisma.outreachSequence.findFirst({
      where: { id: sequenceId, workspaceId: workspace.id },
      include: {
        prospect: true,
        steps: {
          orderBy: { stepNumber: "asc" },
          where: { status: "PENDING" },
        },
      },
    });

    if (!sequence) {
      return { success: false, error: "Séquence non trouvée" };
    }

    // Activer la séquence et planifier l'envoi via Inngest
    await prisma.outreachSequence.update({
      where: { id: sequenceId },
      data: { isActive: true },
    });

    // Déclencher le worker Inngest pour démarrer la séquence
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "sequence/start",
      data: {
        sequenceId,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Start sequence error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ⏸️ PAUSE SEQUENCE - Mettre en pause une séquence
// ═══════════════════════════════════════════════════════════════════════════

export async function pauseSequence(
  sequenceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user!.id! },
      select: { id: true },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }
    const sequence = await prisma.outreachSequence.findFirst({
      where: { id: sequenceId, workspaceId: workspace.id },
    });

    if (!sequence) {
      return { success: false, error: "Séquence non trouvée" };
    }

    await prisma.outreachSequence.update({
      where: { id: sequenceId },
      data: { isActive: false },
    });

    return { success: true };
  } catch (error) {
    console.error("Pause sequence error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 SEND STEP - Envoyer une étape de séquence
// ═══════════════════════════════════════════════════════════════════════════

export async function sendStep(
  stepId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user!.id! },
      select: { id: true },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }
    const step = await prisma.sequenceStep.findFirst({
      where: {
        id: stepId,
        sequence: { workspaceId: workspace.id },
      },
      include: {
        sequence: {
          include: {
            prospect: true,
          },
        },
      },
    });

    if (!step) {
      return { success: false, error: "Étape non trouvée" };
    }

    if (step.status !== "PENDING") {
      return { success: false, error: "Étape déjà envoyée ou annulée" };
    }

    const sequence = await prisma.outreachSequence.findUnique({
      where: { id: step.sequenceId },
      include: { prospect: true },
    });
    if (!sequence) {
      return { success: false, error: "Séquence non trouvée" };
    }
    const prospect = sequence.prospect;
    const workspaceForStep = await prisma.workspace.findUnique({
      where: { id: sequence.workspaceId },
    });

    // Pour les emails: générer un email ultra-personnalisé (Top 1%)
    if (step.channel === "EMAIL" && prospect.email) {
      // Récupérer l'historique des emails précédents pour context
      const previousSteps = await prisma.sequenceStep.findMany({
        where: {
          sequenceId: step.sequenceId,
          channel: "EMAIL",
          stepNumber: { lt: step.stepNumber },
          status: { in: ["SENT", "DELIVERED", "OPENED", "REPLIED"] },
        },
        orderBy: { stepNumber: "asc" },
      });

      const previousEmails = previousSteps.map((s) => ({
        subject: s.subject || "",
        sentAt: s.sentAt || new Date(),
        opened: !!s.openedAt,
        replied: !!s.repliedAt,
      }));

      // Préparer les données du prospect pour personnalisation
      const prospectData: ProspectData = {
        id: prospect.id,
        name: prospect.name,
        firstName: prospect.name.split(" ")[0],
        lastName: prospect.name.split(" ").slice(1).join(" "),
        email: prospect.email,
        company: prospect.company,
        jobTitle: prospect.jobTitle,
        location: prospect.location,
        industry: prospect.industry,
        linkedInUrl: prospect.linkedInUrl,
        notes: prospect.notes || undefined,
        enrichmentData: prospect.enrichmentData as any,
      };

      // Générer l'email ultra-personnalisé
      const personalizedEmail = await generatePersonalizedEmail({
        prospect: prospectData,
        sequenceStep: step.stepNumber,
        ourOffer: process.env.COMPANY_OFFER || "Solutions marketing automatisées avec IA",
        ourCompany: workspaceForStep?.name || "Skalle",
        previousEmails,
      });

      // Mettre à jour le step avec l'email personnalisé
      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: {
          subject: personalizedEmail.subject,
          content: personalizedEmail.content,
          metadata: {
            subjectVariants: personalizedEmail.subjectVariants,
            snippet: personalizedEmail.snippet,
            personalizationScore: personalizedEmail.personalizationScore,
            personalizationPoints: personalizedEmail.personalizationPoints,
            optimalSendTime: personalizedEmail.sendTime.getTime(),
          },
          status: "PENDING", // Sera envoyé au timing optimal
        },
      });

      // Si le timing optimal est dans le futur, programmer l'envoi
      const now = new Date();
      if (personalizedEmail.sendTime > now) {
        // Programmer l'envoi au timing optimal
        const { inngest } = await import("@/inngest/client");
        await inngest.send({
          name: "sequence/step.send",
          data: {
            stepId,
            sequenceId: step.sequenceId,
            delayDays: 0, // Envoi au timing optimal, pas de délai supplémentaire
          },
          ts: personalizedEmail.sendTime.getTime(),
        });

        return { success: true }; // Envoi programmé au timing optimal
      }

      // Si timing optimal = maintenant, continuer avec l'envoi immédiat
      // Le step a déjà été mis à jour avec le contenu personnalisé
    }

    // Pour les autres canaux (LinkedIn, Phone, SMS) ou emails sans personnalisation,
    // récupérer les données du step à jour
    const currentStep = await prisma.sequenceStep.findUnique({
      where: { id: stepId },
    });

    if (!currentStep) {
      return { success: false, error: "Étape non trouvée" };
    }

    // Marquer comme envoyé (seulement si pas déjà marqué)
    if (currentStep.status === "PENDING") {
      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });
    }

    // Envoyer selon le canal
    let deliveryResult: { success: boolean; error?: string; emailId?: string } = { success: true };

    switch (step.channel) {
      case "LINKEDIN":
        // Pour LinkedIn: générer un message ultra-personnalisé (Top 1%)
        if (prospect.linkedInUrl) {
          // Récupérer l'historique des messages LinkedIn précédents
          const previousSteps = await prisma.sequenceStep.findMany({
            where: {
              sequenceId: step.sequenceId,
              channel: "LINKEDIN",
              stepNumber: { lt: step.stepNumber },
              status: { in: ["SENT", "DELIVERED", "REPLIED"] },
            },
            orderBy: { stepNumber: "asc" },
            include: {
              sequence: {
                include: {
                  prospect: true,
                },
              },
            },
          });

          const previousMessages = previousSteps.map((s) => ({
            content: s.content,
            sentAt: s.sentAt || new Date(),
            opened: !!s.openedAt,
            replied: !!s.repliedAt,
            responseTime: s.repliedAt && s.sentAt
              ? (s.repliedAt.getTime() - s.sentAt.getTime()) / (1000 * 60 * 60) // Heures
              : undefined,
          }));

          // Vérifier si la connexion a été acceptée
          const connectionStep = previousSteps.find((s) => s.stepNumber === 1);
          const connectionAccepted = connectionStep?.status === "DELIVERED" || connectionStep?.status === "REPLIED";

          // Préparer les données du prospect pour personnalisation
          const prospectData: any = {
            ...prospect,
            linkedInProfile: prospect.linkedInUrl ? {
              linkedInUrl: prospect.linkedInUrl,
              name: prospect.name,
              jobTitle: prospect.jobTitle,
              company: prospect.company,
              location: prospect.location,
            } : undefined,
          };

          // Générer le message LinkedIn ultra-personnalisé
          const personalizedMessage = await generatePersonalizedLinkedInMessage({
            prospect: prospectData,
            sequenceStep: step.stepNumber,
            ourOffer: process.env.COMPANY_OFFER || "Solutions marketing automatisées avec IA",
            ourCompany: workspaceForStep?.name || "Skalle",
            previousMessages,
            connectionAccepted,
          });

          // Mettre à jour le step avec le message personnalisé
          await prisma.sequenceStep.update({
            where: { id: stepId },
            data: {
              content: personalizedMessage.content,
              metadata: {
                ...((currentStep?.metadata as any) || {}),
                connectionRequest: personalizedMessage.connectionRequest,
                personalizationScore: personalizedMessage.personalizationScore,
                personalizationPoints: personalizedMessage.personalizationPoints,
                optimalSendTime: personalizedMessage.optimalSendTime,
                warmupRequired: personalizedMessage.warmupRequired,
                commentFirst: personalizedMessage.commentFirst,
                recommendations: personalizedMessage.recommendations,
              },
            },
          });

          // Si warm-up requis et étape 1, ne pas envoyer immédiatement
          if (personalizedMessage.warmupRequired && step.stepNumber === 1) {
            return {
              success: true,
              error: "Warm-up required before sending. Please complete warm-up activities first.",
            };
          }

          // Si comment-first recommandé, différer l'envoi et informer l'utilisateur
          if (personalizedMessage.commentFirst && step.stepNumber === 1) {
            logger.warn("Comment-first approach recommended", {
              prospectId: prospect.id,
              recommendations: personalizedMessage.recommendations,
            });
            return {
              success: true,
              error: `Recommandation IA : commentez d'abord un post récent de ce prospect pour augmenter vos chances. Relancez l'envoi après avoir commenté. Conseil : ${personalizedMessage.recommendations?.[0] ?? "engagez-vous avec son contenu LinkedIn"}`,
            };
          }

          // Si timing optimal dans le futur, programmer l'envoi
          const now = new Date();
          if (personalizedMessage.optimalSendTime > now) {
            // Programmer l'envoi au timing optimal
            const { inngest } = await import("@/inngest/client");
            await inngest.send({
              name: "sequence/step.send",
              data: {
                stepId,
                sequenceId: step.sequenceId,
                delayDays: 0,
              },
              ts: personalizedMessage.optimalSendTime instanceof Date ? personalizedMessage.optimalSendTime.getTime() : personalizedMessage.optimalSendTime,
            });

            return { success: true }; // Envoi programmé au timing optimal
          }

          // Envoyer le message LinkedIn (simulé pour l'instant)
          deliveryResult = await sendLinkedInMessage(prospect.linkedInUrl, personalizedMessage.content);
        } else {
          deliveryResult = { success: false, error: "URL LinkedIn non disponible" };
        }
        break;
      case "EMAIL":
        if (!prospect.email) {
          deliveryResult = { success: false, error: "Email non disponible" };
        } else {
          // Récupérer le step avec les données personnalisées
          const updatedStep = await prisma.sequenceStep.findUnique({
            where: { id: stepId },
          });

          const metadata = (updatedStep?.metadata as any) || {};
          const snippet = metadata.snippet || "";

          // Récupérer les pièces jointes de la campagne (si applicable)
          let campaignAttachments: Array<{ filename: string; contentType: string; content: Buffer }> | undefined;
          if (sequence.campaignId) {
            const dbAttachments = await prisma.campaignAttachment.findMany({
              where: { campaignId: sequence.campaignId },
              select: { filename: true, contentType: true, data: true },
            });
            if (dbAttachments.length > 0) {
              campaignAttachments = dbAttachments.map((a) => ({
                filename: a.filename,
                contentType: a.contentType,
                content: Buffer.from(a.data),
              }));
            }
          }

          deliveryResult = await sendEmail(
            prospect.email,
            updatedStep?.subject || step.subject || "",
            updatedStep?.content || step.content,
            snippet, // Preview text pour Gmail
            sequence.workspaceId, // workspaceId pour SMTP config
            stepId, // pixel de tracking
            prospect.id, // lien unsubscribe
            campaignAttachments
          );
        }
        break;
      case "PHONE":
        if (!prospect.phone) {
          deliveryResult = { success: false, error: "Téléphone non disponible" };
        } else {
          // Pour Phone: générer un script ultra-personnalisé (Top 1%)
          // Récupérer l'historique des appels précédents
          const previousSteps = await prisma.sequenceStep.findMany({
            where: {
              sequenceId: step.sequenceId,
              channel: "PHONE",
              stepNumber: { lt: step.stepNumber },
              status: { in: ["SENT", "DELIVERED", "REPLIED"] },
            },
            orderBy: { stepNumber: "asc" },
            include: {
              sequence: {
                include: {
                  prospect: true,
                },
              },
            },
          });

          const previousCalls = previousSteps.map((s) => ({
            date: s.sentAt || s.createdAt,
            outcome: (s.metadata as any)?.outcome || ("no_answer" as const),
            duration: (s.metadata as any)?.duration,
            notes: (s.metadata as any)?.notes,
          }));

          // Préparer les données du prospect pour personnalisation
          const phoneProspectData: PhoneProspectData = {
            id: prospect.id,
            name: prospect.name,
            firstName: prospect.name.split(" ")[0],
            lastName: prospect.name.split(" ").slice(1).join(" "),
            phone: prospect.phone,
            email: prospect.email || undefined,
            company: prospect.company,
            jobTitle: prospect.jobTitle || undefined,
            location: prospect.location || undefined,
            industry: prospect.industry || undefined,
            timezone: (prospect as { timezone?: string | null }).timezone ?? undefined,
            linkedInUrl: prospect.linkedInUrl || undefined,
            notes: prospect.notes || undefined,
            enrichmentData: prospect.enrichmentData as any,
            phoneVerified: prospect.phoneVerified || undefined,
            phoneScore: (prospect as { phoneScore?: number | null }).phoneScore ?? undefined,
            previousCalls,
          };

          // Générer le script d'appel ultra-personnalisé
          const personalizedCallScript = await generatePersonalizedCallScript({
            prospect: phoneProspectData,
            sequenceStep: step.stepNumber,
            ourOffer: process.env.COMPANY_OFFER || "Solutions marketing automatisées avec IA",
            ourCompany: workspaceForStep?.name || "Skalle",
            previousCalls,
          });

          // Calculer le timing optimal
          const optimalCallTime = calculateOptimalCallTime(phoneProspectData, previousCalls);

          // Mettre à jour le step avec le script personnalisé
          await prisma.sequenceStep.update({
            where: { id: stepId },
            data: {
              content: personalizedCallScript.script,
              metadata: JSON.parse(
                JSON.stringify({
                  script: personalizedCallScript.script,
                  opening: personalizedCallScript.opening,
                  valueProposition: personalizedCallScript.valueProposition,
                  objectionHandling: personalizedCallScript.objectionHandling,
                  closing: personalizedCallScript.closing,
                  estimatedDuration: personalizedCallScript.estimatedDuration,
                  personalizationScore: personalizedCallScript.personalizationScore,
                  personalizationPoints: personalizedCallScript.personalizationPoints,
                  optimalCallTime,
                  recommendations: personalizedCallScript.recommendations,
                })
              ),
              status: "PENDING", // Sera envoyé au timing optimal
            },
          });

          // Si le timing optimal est dans le futur, programmer l'appel
          const now = new Date();
          const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const targetDay = DAY_NAMES.indexOf(optimalCallTime.bestDay);
          const [hours, minutes] = optimalCallTime.bestTime.split(":").map(Number);
          // Trouver la prochaine occurrence du jour cible (aujourd'hui inclus si l'heure est dans le futur)
          const callDateTime = new Date();
          callDateTime.setHours(hours, minutes, 0, 0);
          const daysUntilTarget = ((targetDay - callDateTime.getDay()) + 7) % 7;
          // Si le jour cible est aujourd'hui mais l'heure est passée, passer à la semaine suivante
          if (daysUntilTarget > 0 || callDateTime <= now) {
            callDateTime.setDate(callDateTime.getDate() + (daysUntilTarget === 0 ? 7 : daysUntilTarget));
          }
          
          if (callDateTime > now) {
            const { inngest } = await import("@/inngest/client");
            await inngest.send({
              name: "sequence/step.send",
              data: {
                stepId,
                sequenceId: step.sequenceId,
                delayDays: 0,
              },
              ts: callDateTime.getTime(), // Planifier au timing optimal
            });
            return { success: true }; // Appel programmé
          }

          // Si timing optimal = maintenant, continuer avec l'appel immédiat
          deliveryResult = await sendPhoneCall(
            prospect.phone,
            personalizedCallScript.script,
            personalizedCallScript,
            optimalCallTime
          );
        }
        break;
      case "SMS":
        if (!prospect.phone) {
          deliveryResult = { success: false, error: "Téléphone non disponible" };
        } else {
          // Pour SMS: générer un SMS ultra-personnalisé (Top 1%)
          // Récupérer l'historique des appels précédents pour context
          const previousSteps = await prisma.sequenceStep.findMany({
            where: {
              sequenceId: step.sequenceId,
              channel: { in: ["PHONE", "SMS"] },
              stepNumber: { lt: step.stepNumber },
              status: { in: ["SENT", "DELIVERED", "REPLIED"] },
            },
            orderBy: { stepNumber: "asc" },
            include: {
              sequence: {
                include: {
                  prospect: true,
                },
              },
            },
          });

          const previousCalls = previousSteps
            .filter((s) => s.channel === "PHONE")
            .map((s) => ({
              date: s.sentAt || s.createdAt,
              outcome: (s.metadata as any)?.outcome || ("no_answer" as const),
            }));

          // Déterminer le type de follow-up SMS
          const lastPhoneCall = previousSteps.find((s) => s.channel === "PHONE");
          const followUpType: "reminder" | "value_add" | "voicemail_followup" | "meeting_reminder" =
            lastPhoneCall?.status === "DELIVERED" && !lastPhoneCall?.repliedAt
              ? "reminder"
              : lastPhoneCall && (lastPhoneCall.metadata as any)?.outcome === "voicemail"
              ? "voicemail_followup"
              : "value_add";

          // Préparer les données du prospect
          const phoneProspectData: PhoneProspectData = {
            id: prospect.id,
            name: prospect.name,
            firstName: prospect.name.split(" ")[0],
            lastName: prospect.name.split(" ").slice(1).join(" "),
            phone: prospect.phone,
            email: prospect.email || undefined,
            company: prospect.company,
            jobTitle: prospect.jobTitle || undefined,
            location: prospect.location || undefined,
            industry: prospect.industry || undefined,
            timezone: (prospect as { timezone?: string | null }).timezone ?? undefined,
            linkedInUrl: prospect.linkedInUrl || undefined,
            notes: prospect.notes || undefined,
            enrichmentData: prospect.enrichmentData as any,
            phoneVerified: prospect.phoneVerified || undefined,
            phoneScore: (prospect as { phoneScore?: number | null }).phoneScore ?? undefined,
            previousCalls,
          };

          // Générer le SMS ultra-personnalisé
          const personalizedSMS = await generatePersonalizedSMS({
            prospect: phoneProspectData,
            followUpType,
            ourOffer: process.env.COMPANY_OFFER || "Solutions marketing automatisées avec IA",
            ourCompany: workspaceForStep?.name || "Skalle",
            previousCalls,
          });

          // Mettre à jour le step avec le SMS personnalisé
          await prisma.sequenceStep.update({
            where: { id: stepId },
            data: {
              content: personalizedSMS.message,
              metadata: {
                followUpType: personalizedSMS.followUpType,
                personalizationScore: personalizedSMS.personalizationScore,
                personalizationPoints: personalizedSMS.personalizationPoints,
                optimalSendTime:
                  personalizedSMS.optimalSendTime instanceof Date
                    ? personalizedSMS.optimalSendTime.getTime()
                    : personalizedSMS.optimalSendTime,
                recommendations: personalizedSMS.recommendations,
              },
              status: "PENDING", // Sera envoyé au timing optimal
            },
          });

          // Si le timing optimal est dans le futur, programmer l'envoi
          const now = new Date();
          if (personalizedSMS.optimalSendTime > now) {
            const { inngest } = await import("@/inngest/client");
            await inngest.send({
              name: "sequence/step.send",
              data: {
                stepId,
                sequenceId: step.sequenceId,
                delayDays: 0,
              },
              ts:
                personalizedSMS.optimalSendTime instanceof Date
                  ? personalizedSMS.optimalSendTime.getTime()
                  : personalizedSMS.optimalSendTime,
            });
            return { success: true }; // SMS programmé
          }

          // Si timing optimal = maintenant, continuer avec l'envoi immédiat
          deliveryResult = await sendSMS(prospect.phone, personalizedSMS.message, personalizedSMS);
        }
        break;
    }

    const keepPending = (deliveryResult as { keepPending?: boolean }).keepPending;

    if (deliveryResult.success && keepPending) {
      // Step LinkedIn : reste PENDING pour action manuelle dans la file d'attente
      // On planifie quand même la prochaine étape de la séquence
      const nextStep = await prisma.sequenceStep.findFirst({
        where: {
          sequenceId: step.sequenceId,
          stepNumber: step.stepNumber + 1,
          status: "PENDING",
        },
      });
      if (nextStep && sequence.isActive) {
        await scheduleStep(nextStep.id, nextStep.delayDays, step.sequenceId);
      }
    } else if (deliveryResult.success) {
      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
        },
      });

      // Planifier la prochaine étape
      const nextStep = await prisma.sequenceStep.findFirst({
        where: {
          sequenceId: step.sequenceId,
          stepNumber: step.stepNumber + 1,
          status: "PENDING",
        },
      });

      if (nextStep && sequence.isActive) {
        await scheduleStep(nextStep.id, nextStep.delayDays, step.sequenceId);
      }
    } else {
      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: {
          status: "FAILED",
          error: deliveryResult.error || "Erreur d'envoi",
        },
      });
    }

    return deliveryResult;
  } catch (error) {
    console.error("Send step error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 SCHEDULE STEP - Planifier une étape avec Inngest
// ═══════════════════════════════════════════════════════════════════════════

import { inngest } from "@/inngest/client";

async function scheduleStep(stepId: string, delayDays: number, sequenceId: string): Promise<void> {
  try {
    // Si délai = 0, envoyer immédiatement
    if (delayDays === 0) {
      await inngest.send({
        name: "sequence/step.send",
        data: {
          stepId,
          sequenceId,
          delayDays: 0,
        },
      });
    } else {
      // Planifier avec Inngest selon le délai
      const sendDate = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
      
      await inngest.send({
        name: "sequence/step.send",
        data: {
          stepId,
          sequenceId,
          delayDays,
        },
        ts: sendDate instanceof Date ? sendDate.getTime() : sendDate, // Planifier à une date future
      });
    }
  } catch (error) {
    console.error("Error scheduling step:", error);
    // Fallback: envoyer immédiatement si erreur de planification
    await sendStep(stepId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 SEND EMAIL - Envoyer un email (Top 1% optimized)
// ═══════════════════════════════════════════════════════════════════════════

function injectEmailExtras(html: string, stepId: string, prospectId?: string): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const pixelUrl = `${baseUrl}/api/track/open/${stepId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`;

  let extras = pixel;

  if (prospectId) {
    const { generateUnsubscribeToken } = require("@/lib/unsubscribe-token");
    const unsubToken = generateUnsubscribeToken(prospectId);
    const unsubUrl = `${baseUrl}/api/unsubscribe/${unsubToken}`;
    extras += `\n<div style="text-align:center;margin-top:24px;font-size:11px;color:#9ca3af;">` +
      `<a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Se désinscrire</a>` +
      `</div>`;
  }

  if (html.includes("</body>")) {
    return html.replace("</body>", `${extras}</body>`);
  }
  return html + extras;
}

async function sendEmail(
  to: string,
  subject: string,
  content: string,
  snippet?: string,
  workspaceId?: string,
  stepId?: string,
  prospectId?: string,
  attachments?: Array<{ filename: string; contentType: string; content: Buffer }>
): Promise<{ success: boolean; error?: string; emailId?: string }> {
  try {
    const htmlContent = stepId ? injectEmailExtras(content, stepId, prospectId) : content;

    // 1. Priorité: SMTP personnel (Nodemailer)
    if (workspaceId) {
      const smtpConfig = await prisma.smtpConfig.findFirst({
        where: { workspaceId },
      });

      if (smtpConfig && smtpConfig.isVerified) {
        const { createSmtpTransporter, sendEmailViaSMTP } = await import("@/lib/email/smtp-transport");
        const transporter = createSmtpTransporter({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          username: smtpConfig.username,
          password: decryptIfNeeded(smtpConfig.password),
        });

        const result = await sendEmailViaSMTP(transporter, {
          from: smtpConfig.fromEmail,
          fromName: smtpConfig.fromName,
          to,
          subject,
          html: htmlContent,
          attachments,
        });

        transporter.close();
        return result;
      }
    }

    // 2. Fallback: Resend API
    if (process.env.RESEND_API_KEY) {
      const fromEmail = process.env.FROM_EMAIL || "Skalle <noreply@skalle.io>";

      const resendAttachments = attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      }));

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject,
          html: htmlContent,
          ...(resendAttachments?.length ? { attachments: resendAttachments } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || "Erreur Resend" };
      }
      return { success: true, emailId: data.id };
    }

    // 3. Fallback: SendGrid — clé workspace (ExternalIntegration) ou env var
    const { getExternalIntegrationKey } = await import("@/lib/services/integrations/external");
    const sendgridKey = workspaceId
      ? (await getExternalIntegrationKey(workspaceId, "SENDGRID")) ?? process.env.SENDGRID_API_KEY
      : process.env.SENDGRID_API_KEY;

    if (sendgridKey) {
      const sgAttachments = attachments?.map((a) => ({
        content: a.content.toString("base64"),
        filename: a.filename,
        type: a.contentType,
        disposition: "attachment",
      }));

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: process.env.FROM_EMAIL || "noreply@skalle.io" },
          subject,
          content: [{ type: "text/html", value: htmlContent }],
          ...(sgAttachments?.length ? { attachments: sgAttachments } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      return { success: true };
    }

    return { success: false, error: "Aucun service email configuré (SMTP, Resend ou SendGrid)" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💼 SEND LINKEDIN - Envoyer un message LinkedIn (simulé)
// ═══════════════════════════════════════════════════════════════════════════

async function sendLinkedInMessage(
  linkedInUrl: string,
  _message: string
): Promise<{ success: boolean; error?: string; keepPending?: boolean }> {
  if (!linkedInUrl) {
    return { success: false, error: "URL LinkedIn non disponible" };
  }

  // LinkedIn automation n'est pas disponible sans API tierce (Phantombuster, Dux-Soup, etc.).
  // Le step reste PENDING — l'utilisateur l'envoie manuellement via la file d'attente LinkedIn.
  return { success: true, keepPending: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📞 SEND PHONE - Envoyer un appel téléphonique (simulé)
// ═══════════════════════════════════════════════════════════════════════════

async function sendPhoneCall(
  phone: string,
  script: string,
  personalizedScript?: Awaited<ReturnType<typeof generatePersonalizedCallScript>>,
  optimalTime?: ReturnType<typeof calculateOptimalCallTime>
): Promise<{ success: boolean; error?: string }> {
  if (!phone) {
    return { success: false, error: "Téléphone non disponible" };
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return {
      success: false,
      error: "Twilio non configuré — renseignez TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN dans .env",
    };
  }

  // Twilio Voice API — intégration à implémenter
  // Utiliser un numéro local (même indicatif que le lead) + enregistrer l'appel
  console.log(`[Phone] Script: ${personalizedScript?.opening || script.substring(0, 100)}...`);
  if (optimalTime) {
    console.log(`[Phone] Timing: ${optimalTime.bestDay} ${optimalTime.bestTime} (${optimalTime.timezone})`);
  }

  return {
    success: false,
    error: "Intégration Twilio Voice non implémentée — contactez le support pour l'activation",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 SEND SMS - Envoyer un SMS (simulé)
// ═══════════════════════════════════════════════════════════════════════════

async function sendSMS(
  phone: string,
  _message: string,
  _personalizedSMS?: Awaited<ReturnType<typeof generatePersonalizedSMS>>
): Promise<{ success: boolean; error?: string }> {
  if (!phone) {
    return { success: false, error: "Téléphone non disponible" };
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return {
      success: false,
      error: "Twilio non configuré — renseignez TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN dans .env",
    };
  }

  // Twilio SMS API — intégration à implémenter
  return {
    success: false,
    error: "Intégration Twilio SMS non implémentée — contactez le support pour l'activation",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 GET SEQUENCE STATS - Statistiques d'une séquence
// ═══════════════════════════════════════════════════════════════════════════

export async function getSequenceStats(
  sequenceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const sequence: any = await prisma.outreachSequence.findFirst({
      where: {
        id: sequenceId,
        workspace: { userId: session.user!.id! },
      } as any,
      include: {
        steps: {
          orderBy: { stepNumber: "asc" },
        },
      },
    });

    if (!sequence) {
      return { success: false, error: "Séquence non trouvée" };
    }

    const steps = sequence.steps || [];
    const stats = {
      totalSteps: steps.length,
      sentSteps: steps.filter((s: any) => s.status === "SENT" || s.status === "DELIVERED").length,
      deliveredSteps: steps.filter((s: any) => s.status === "DELIVERED").length,
      openedSteps: steps.filter((s: any) => s.openedAt).length,
      repliedSteps: steps.filter((s: any) => s.repliedAt).length,
      failedSteps: steps.filter((s: any) => s.status === "FAILED").length,
      openRate: 0,
      replyRate: 0,
    };

    const deliveredCount = stats.deliveredSteps || 1;
    stats.openRate = Math.round((stats.openedSteps / deliveredCount) * 100);
    stats.replyRate = Math.round((stats.repliedSteps / deliveredCount) * 100);

    return { success: true, data: stats };
  } catch (error) {
    console.error("Get sequence stats error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LINKEDIN QUEUE - File d'attente d'actions LinkedIn
// ═══════════════════════════════════════════════════════════════════════════

export async function getLinkedInQueue(
  workspaceId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const session = await requireAuth();

    const steps = await prisma.sequenceStep.findMany({
      where: {
        channel: "LINKEDIN",
        status: "PENDING",
        sequence: {
          is: {
            workspaceId,
            isActive: true,
          },
        },
      },
      include: {
        sequence: {
          include: {
            prospect: {
              select: {
                id: true,
                name: true,
                company: true,
                jobTitle: true,
                linkedInUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return {
      success: true,
      data: steps.map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        content: s.content,
        linkedInAction: s.linkedInAction || "message",
        prospect: s.sequence.prospect,
        sequenceId: s.sequenceId,
        sequenceName: s.sequence.name,
      })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function markLinkedInStepDone(
  stepId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const step: any = await prisma.sequenceStep.findFirst({
      where: {
        id: stepId,
        channel: "LINKEDIN",
        status: "PENDING",
        sequence: { workspace: { userId: session.user!.id! } } as any,
      },
      include: { sequence: true },
    });

    if (!step) {
      return { success: false, error: "Etape non trouvee" };
    }

    // Marquer comme SENT
    await prisma.sequenceStep.update({
      where: { id: stepId },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    // Planifier le step suivant si applicable
    const nextStep = await prisma.sequenceStep.findFirst({
      where: {
        sequenceId: step.sequenceId,
        stepNumber: step.stepNumber + 1,
        status: "PENDING",
      },
    });

    if (nextStep && step.sequence?.isActive) {
      const { inngest: inngestClient } = await import("@/inngest/client");
      if (nextStep.delayDays === 0) {
        await inngestClient.send({
          name: "sequence/step.send",
          data: {
            stepId: nextStep.id,
            sequenceId: step.sequenceId,
            delayDays: 0,
          },
        });
      } else {
        await inngestClient.send({
          name: "sequence/step.send",
          data: {
            stepId: nextStep.id,
            sequenceId: step.sequenceId,
            delayDays: nextStep.delayDays,
          },
          ts: new Date(Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000).getTime(),
        } as any);
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
