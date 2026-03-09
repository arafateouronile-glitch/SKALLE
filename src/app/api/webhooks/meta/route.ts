/**
 * 🔔 Meta Webhook Route
 *
 * Reçoit les notifications en temps réel de Meta :
 * - Nouveaux commentaires sur les posts IG/FB
 * - Réactions sur les posts
 * - Messages reçus
 *
 * GET  : Vérification du webhook (Meta challenge)
 * POST : Réception des événements
 */

import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════════════════
// GET : Webhook Verification
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("Meta webhook verified");
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST : Receive Events
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  const body = await request.text();

  // Vérification obligatoire de la signature X-Hub-Signature-256
  if (!process.env.META_APP_SECRET) {
    console.error("Meta webhook: META_APP_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 403 });
  }

  const expected = Buffer.from(
    "sha256=" +
      crypto.createHmac("sha256", process.env.META_APP_SECRET).update(body).digest("hex")
  );
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    console.error("Meta webhook: Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const data = JSON.parse(body);

  // Traiter les événements par type d'objet
  if (data.object === "instagram" || data.object === "page") {
    // Envoyer à Inngest pour traitement asynchrone
    try {
      await inngest.send({
        name: "meta/webhook.received",
        data: {
          object: data.object,
          entries: data.entry || [],
        },
      });
    } catch (error) {
      console.error("Failed to send webhook event to Inngest:", error);
    }
  }

  // Meta attend toujours un 200 OK
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
