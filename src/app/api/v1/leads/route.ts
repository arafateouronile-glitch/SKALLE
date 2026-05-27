/**
 * API publique Skalle v1 — Leads
 *
 * GET  /api/v1/leads : lister les leads du workspace (?cursor, ?limit, ?status)
 * POST /api/v1/leads : injecter un lead depuis l'extérieur (Typeform, Zapier, Make)
 *
 * Auth : Authorization: Bearer <sk_live_xxx>
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSkalleApi, consumeApiCredits } from "@/lib/skalle-api-auth";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const VALID_STATUSES = new Set([
  "NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED",
  "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED", "UNSUBSCRIBED",
]);

export async function GET(req: NextRequest) {
  const auth = await authenticateSkalleApi(req, "api_lead");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = req.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? 50)), 100);
  const statusParam = searchParams.get("status");

  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const leads = await prisma.prospect.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(statusParam ? { status: statusParam as never } : {}),
    },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      jobTitle: true,
      linkedInUrl: true,
      status: true,
      emailStatus: true,
      source: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = leads.length > limit;
  const items = hasMore ? leads.slice(0, limit) : leads;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ leads: items, nextCursor, count: items.length });
}

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
