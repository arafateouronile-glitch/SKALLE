/**
 * GET /api/track/open/[trackingId]
 *
 * Pixel de tracking d'ouverture email.
 * Retourne un GIF 1x1 transparent et enregistre l'ouverture en base.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackEmailMetrics } from "@/lib/prospection/deliverability";

// GIF 1x1 pixel transparent (base64)
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params;

  // Enregistrer l'ouverture de manière non-bloquante
  if (trackingId) {
    setImmediate(async () => {
      try {
        const step = await prisma.sequenceStep.findUnique({
          where: { id: trackingId },
          select: {
            id: true,
            openedAt: true,
            sequence: { select: { workspaceId: true } },
          },
        });

        if (step && !step.openedAt) {
          await prisma.sequenceStep.update({
            where: { id: trackingId },
            data: {
              openedAt: new Date(),
              status: "OPENED",
            },
          });

          if (step.sequence?.workspaceId) {
            await trackEmailMetrics(step.sequence.workspaceId, "opened").catch(
              () => {}
            );
          }
        }
      } catch {
        // Silencieux — ne pas bloquer la réponse pixel
      }
    });
  }

  return new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
