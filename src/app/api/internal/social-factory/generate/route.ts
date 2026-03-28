import { type NextRequest, NextResponse } from "next/server";
import { runSocialFactoryJob } from "@/lib/services/social/factory-job";

// Allow up to 5 minutes on Vercel Fluid compute / long-running environments
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Protect with internal secret
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contentPlanId, workspaceId, userId, vision, niche, objectives, month, year } = body;

  if (!contentPlanId || !workspaceId || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Run synchronously — this route is called fire-and-forget from the server action
  await runSocialFactoryJob({ contentPlanId, workspaceId, userId, vision, niche, objectives, month, year });

  return NextResponse.json({ ok: true });
}
