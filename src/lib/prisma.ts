import { PrismaClient } from "@prisma/client";

// Bump this key whenever new Prisma models are added.
// NOTE: after `prisma db push`, a dev-server restart is still required to flush
// Node.js's require() cache for @prisma/client.
const PRISMA_SINGLETON_KEY = "__prisma_v2" as const;

const globalForPrisma = globalThis as unknown as {
  [PRISMA_SINGLETON_KEY]: PrismaClient | undefined;
};

function getDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const base = url.includes("?") ? url.split("?")[0] : url;
  const query = url.includes("?") ? url.split("?")[1] : "";
  const params = new URLSearchParams(query);
  if (!params.has("connection_limit")) params.set("connection_limit", "10");
  if (!params.has("connect_timeout")) params.set("connect_timeout", "15");
  if (!params.has("pool_timeout")) params.set("pool_timeout", "30");
  return base + "?" + params.toString();
}

export const prisma =
  globalForPrisma[PRISMA_SINGLETON_KEY] ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
    ...(getDatasourceUrl() && { datasources: { db: { url: getDatasourceUrl()! } } }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma[PRISMA_SINGLETON_KEY] = prisma;

export default prisma;
