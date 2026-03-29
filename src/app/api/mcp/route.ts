/**
 * /api/mcp — SKALLE MCP Server endpoint (StreamableHTTP transport)
 *
 * External MCP clients (Claude Desktop, Cursor, etc.) connect here
 * using their SKALLE API key as Bearer token.
 *
 * Auth: Authorization: Bearer sk_<apikey>
 * Plans: SCALE only (apiAccess = true)
 *
 * MCP spec requires POST for all RPC messages.
 * GET is used by some clients for SSE streaming (handled by transport).
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateSkalleApi } from "@/lib/skalle-api-auth";
import { handleMcpRequest } from "@/lib/mcp/server";
import { prisma } from "@/lib/prisma";

// MCP connections can be long-running (streaming)
export const maxDuration = 300;

async function logAccess(
  workspaceId: string,
  apiKeyId: string,
  req: Request,
  success: boolean,
  durationMs: number,
  errorMsg?: string
) {
  // Fire-and-forget
  prisma.mCPAccessLog
    .create({
      data: {
        workspaceId,
        apiKeyId,
        method: req.method,
        success,
        durationMs,
        errorMsg,
      },
    })
    .catch(() => {});
}

async function handleRequest(req: NextRequest): Promise<Response> {
  const start = Date.now();

  const auth = await authenticateSkalleApi(req, "api_lead");

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { workspaceId, apiKeyId } = auth;

  try {
    const response = await handleMcpRequest(req, workspaceId);
    logAccess(workspaceId, apiKeyId, req, true, Date.now() - start);
    return response;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logAccess(workspaceId, apiKeyId, req, false, Date.now() - start, errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = handleRequest;
export const GET = handleRequest;
export const DELETE = handleRequest;
