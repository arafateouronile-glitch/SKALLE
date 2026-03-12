import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  useCredits: vi.fn(),
}));

vi.mock("@/lib/ai/agents", () => ({
  agentRegistry: {
    seo: {
      agent: {
        stream: vi.fn(),
      },
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lit tous les chunks d'un ReadableStream et retourne le texte brut. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
}

/** Parse les événements SSE d'une chaîne brute. */
function parseSSEEvents(raw: string): Array<Record<string, unknown>> {
  return raw
    .split("\n\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, "")));
}

/** Crée un AgentResult minimal valide. */
function makeAgentResult(output = "ok"): import("@/lib/ai/agents/base-agent").AgentResult {
  return {
    success: true,
    agentName: "seo",
    result: output,
    steps: [],
    duration: 0,
    iterations: 1,
  };
}

/** Crée un Request POST avec le body fourni. */
function makeRequest(body: Record<string, unknown> = { input: "test input" }): Request {
  return new Request("http://localhost/api/agents/seo/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Imports après mocks ───────────────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { useCredits } from "@/lib/credits";
import { agentRegistry } from "@/lib/ai/agents";
import { POST } from "@/app/api/agents/[agentId]/stream/route";

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/agents/[agentId]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });
    expect(res.status).toBe(401);
  });

  it("retourne 401 si session sans userId", async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as never);

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });
    expect(res.status).toBe(401);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("retourne 404 pour un agentId inconnu", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "unknown" }) });
    expect(res.status).toBe(404);
  });

  it("retourne 400 si le body JSON est invalide", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    const req = new Request("http://localhost/api/agents/seo/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req, { params: Promise.resolve({ agentId: "seo" }) });
    expect(res.status).toBe(400);
  });

  it("retourne 400 si le champ 'input' est absent", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    const res = await POST(makeRequest({ context: {} }), { params: Promise.resolve({ agentId: "seo" }) });
    expect(res.status).toBe(400);
  });

  // ── Crédits ─────────────────────────────────────────────────────────────────

  it("retourne 402 si les crédits sont insuffisants", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(useCredits).mockRejectedValue(new Error("Crédits insuffisants"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toContain("Crédits insuffisants");
  });

  // ── Streaming ───────────────────────────────────────────────────────────────

  it("retourne les headers SSE corrects", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, remainingCredits: 99 });
    vi.mocked(agentRegistry.seo.agent.stream).mockImplementation(async function* () {
      yield { type: "done" as const, result: makeAgentResult("ok") };
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("stream un événement 'done' quand l'agent termine normalement", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, remainingCredits: 99 });
    vi.mocked(agentRegistry.seo.agent.stream).mockImplementation(async function* () {
      yield { type: "step" as const, content: "Recherche en cours..." };
      yield { type: "token" as const, content: "Voici" };
      yield { type: "done" as const, result: makeAgentResult("Article généré") };
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });
    const raw = await readStream(res.body!);
    const events = parseSSEEvents(raw);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "step", content: "Recherche en cours..." });
    expect(events[1]).toEqual({ type: "token", content: "Voici" });
    expect(events[2].type).toBe("done");
  });

  it("stream un événement 'error' si l'agent lève une exception", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, remainingCredits: 99 });
    vi.mocked(agentRegistry.seo.agent.stream).mockImplementation(async function* () {
      throw new Error("LLM unavailable");
      // eslint-disable-next-line no-unreachable
      yield { type: "done" as const, result: makeAgentResult() };
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });
    const raw = await readStream(res.body!);
    const events = parseSSEEvents(raw);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(String(errorEvent!.error)).toContain("LLM unavailable");
  });

  it("s'arrête après l'événement 'done' même si le générateur continue", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, remainingCredits: 99 });
    vi.mocked(agentRegistry.seo.agent.stream).mockImplementation(async function* () {
      yield { type: "done" as const, result: makeAgentResult("fini") };
      yield { type: "token" as const, content: "ne doit pas apparaître" }; // jamais envoyé
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });
    const raw = await readStream(res.body!);
    const events = parseSSEEvents(raw);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  it("appelle useCredits avec l'opération correcte pour chaque agent", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, remainingCredits: 99 });
    vi.mocked(agentRegistry.seo.agent.stream).mockImplementation(async function* () {
      yield { type: "done" as const, result: makeAgentResult() };
    });

    await POST(makeRequest(), { params: Promise.resolve({ agentId: "seo" }) });

    expect(useCredits).toHaveBeenCalledWith("user-1", "agent_seo");
  });
});
