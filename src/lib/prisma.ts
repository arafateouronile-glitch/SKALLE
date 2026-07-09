import { PrismaClient } from "@prisma/client";

// Bump this key whenever new Prisma models are added.
// NOTE: after `prisma db push`, a dev-server restart is still required to flush
// Node.js's require() cache for @prisma/client.
const PRISMA_SINGLETON_KEY = "__prisma_v5" as const;

const globalForPrisma = globalThis as unknown as {
  [PRISMA_SINGLETON_KEY]: PrismaClient | undefined;
};

function getDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const base = url.includes("?") ? url.split("?")[0] : url;
  const query = url.includes("?") ? url.split("?")[1] : "";
  const params = new URLSearchParams(query);
  // PgBouncer transaction mode (Supabase port 6543) — avoids holding
  // persistent Postgres connections across serverless invocations.
  if (!params.has("pgbouncer")) params.set("pgbouncer", "true");
  // connection_limit=1 is correct for PgBouncer: Prisma manages its own
  // internal pool on top; multiple PrismaClient instances each claim 1 slot.
  if (!params.has("connection_limit")) params.set("connection_limit", "1");
  if (!params.has("connect_timeout")) params.set("connect_timeout", "15");
  if (!params.has("pool_timeout")) params.set("pool_timeout", "30");
  return base + "?" + params.toString();
}

function createPrismaClient(): PrismaClient {
  const datasourceUrl = getDatasourceUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl && { datasources: { db: { url: datasourceUrl } } }),
  });
}

// Always save to globalForPrisma — not just in development.
// Inngest replays the full function body for each step, re-evaluating this
// module each time. Without the global guard every step would open a new
// PrismaClient (and a new connection), exhausting the pool on long pipelines.
export const prisma =
  globalForPrisma[PRISMA_SINGLETON_KEY] ??
  (globalForPrisma[PRISMA_SINGLETON_KEY] = createPrismaClient());

export default prisma;
