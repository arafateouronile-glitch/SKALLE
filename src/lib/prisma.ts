import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Limiter le pool et timeout pour réduire les "Error in PostgreSQL connection: Error { kind: Closed }"
// (connexions idle fermées par le serveur en dev / HMR)
function getDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const base = url.includes("?") ? url.split("?")[0] : url;
  const query = url.includes("?") ? url.split("?")[1] : "";
  const params = new URLSearchParams(query);
  if (!params.has("connection_limit")) params.set("connection_limit", "5");
  if (!params.has("connect_timeout")) params.set("connect_timeout", "10");
  return base + "?" + params.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
    ...(getDatasourceUrl() && { datasources: { db: { url: getDatasourceUrl()! } } }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
