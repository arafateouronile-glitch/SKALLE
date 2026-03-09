"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude, prospectionSequencePrompt, getStringParser } from "@/lib/ai/langchain";
import { z } from "zod";
import { inngest } from "@/inngest/client";

const prospectSchema = z.object({
  name: z.string().min(2),
  linkedInUrl: z.string().url().optional().or(z.literal("")),
  company: z.string().min(1),
  jobTitle: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export async function createProspect(
  workspaceId: string,
  data: z.infer<typeof prospectSchema>
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const parsed = prospectSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Données invalides" };
    }

    // Verifier les doublons
    if (parsed.data.email) {
      const existing = await prisma.prospect.findFirst({
        where: { workspaceId, email: parsed.data.email },
      });
      if (existing) {
        return { success: false, error: "Un prospect avec cet email existe deja" };
      }
    }

    const prospect = await prisma.prospect.create({
      data: {
        ...parsed.data,
        linkedInUrl: parsed.data.linkedInUrl || "",
        workspaceId,
      },
    });

    // Déclencher l'enrichissement automatique et le scoring initial (background)
    try {
      await inngest.send({
        name: "prospect/created",
        data: { prospectId: prospect.id, workspaceId, userId: session.user.id },
      });
    } catch {
      // Ne pas bloquer la création si Inngest échoue
    }

    return { success: true, data: prospect };
  } catch (error) {
    console.error("Create prospect error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function updateProspect(
  prospectId: string,
  data: Partial<z.infer<typeof prospectSchema>> & { status?: "NEW" | "CONTACTED" | "REPLIED" | "CONVERTED" | "REJECTED" }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const prospect = await prisma.prospect.update({
      where: {
        id: prospectId,
        workspace: { userId: session.user.id },
      },
      data: {
        ...data,
        status: data.status,
      },
    });

    return { success: true, data: prospect };
  } catch (error) {
    console.error("Update prospect error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function deleteProspect(prospectId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    await prisma.prospect.delete({
      where: {
        id: prospectId,
        workspace: { userId: session.user.id },
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Delete prospect error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function getProspects(workspaceId: string, listId?: string) {
  const session = await auth();
  if (!session?.user?.id) return [];

  const where: any = {
    workspaceId,
    workspace: { userId: session.user.id },
  };

  if (listId) {
    where.lists = { some: { prospectListId: listId } };
  }

  return prisma.prospect.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

interface ProspectionMessages {
  message1: string;
  message2: string;
  message3: string;
}

export async function generateProspectionSequence(
  prospectId: string
): Promise<{ success: boolean; data?: ProspectionMessages; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const prospect = await prisma.prospect.findFirst({
      where: {
        id: prospectId,
        workspace: { userId: session.user.id },
      },
      include: { workspace: true },
    });

    if (!prospect) {
      return { success: false, error: "Prospect non trouvé" };
    }

    // Generate messages with Claude
    const chain = prospectionSequencePrompt.pipe(getClaude()).pipe(getStringParser());
    const result = await chain.invoke({
      name: prospect.name,
      company: prospect.company,
      jobTitle: prospect.jobTitle || "Non spécifié",
      notes: prospect.notes || "Aucune note",
    });

    // Parse JSON response
    let messages: ProspectionMessages;
    try {
      messages = JSON.parse(result);
    } catch {
      // If JSON parsing fails, try to extract messages from text
      messages = {
        message1: result.split("Message 2")[0]?.trim() || result,
        message2: result.split("Message 2")[1]?.split("Message 3")[0]?.trim() || "",
        message3: result.split("Message 3")[1]?.trim() || "",
      };
    }

    // Save messages to prospect
    await prisma.prospect.update({
      where: { id: prospectId },
      data: { messages: JSON.parse(JSON.stringify(messages)) },
    });

    // Track API usage
    await prisma.aPIUsage.create({
      data: {
        service: "anthropic",
        operation: "prospection",
        credits: 1,
        workspaceId: prospect.workspaceId,
      },
    });

    return { success: true, data: messages };
  } catch (error) {
    console.error("Generate prospection error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}
