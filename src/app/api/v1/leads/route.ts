/**
 * API publique Skalle v1 — Inbound
 * POST /api/v1/leads : injecter un lead dans le CRM depuis l'extérieur (Typeform, Zapier, Make).
 *
 * Auth : Authorization: Bearer <sk_live_xxx>
 * Body : { name, company, email?, jobTitle?, linkedInUrl?, notes? }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSkalleApi, consumeApiCredits } from "@/lib/skalle-api-auth";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  jobTitle: z.string().max(200).optional(),
  linkedInUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateSkalleApi(req, "api_lead");
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.email) {
    const existing = await prisma.prospect.findFirst({
      where: {
        workspaceId: auth.workspaceId,
        email: data.email,
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Un prospect avec cet email existe déjà" },
        { status: 409 }
      );
    }
  }

  const prospect = await prisma.prospect.create({
    data: {
      name: data.name,
      company: data.company,
      email: data.email || null,
      jobTitle: data.jobTitle ?? null,
      linkedInUrl: data.linkedInUrl || "",
      notes: data.notes ?? null,
      workspaceId: auth.workspaceId,
      source: "SEO_INBOUND",
    },
  });

  const creditResult = await consumeApiCredits(
    auth.userId,
    "api_lead",
    auth.workspaceId
  );
  if (!creditResult.success) {
    return NextResponse.json(
      { error: creditResult.error ?? "Erreur crédits" },
      { status: 402 }
    );
  }

  try {
    await inngest.send({
      name: "prospect/created",
      data: {
        prospectId: prospect.id,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      },
    });
  } catch {
    // Ne pas bloquer la réponse
  }

  return NextResponse.json(
    {
      id: prospect.id,
      name: prospect.name,
      company: prospect.company,
      email: prospect.email,
      createdAt: prospect.createdAt,
    },
    { status: 201 }
  );
}
