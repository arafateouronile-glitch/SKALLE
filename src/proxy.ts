import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkAuthRateLimit, checkApiRateLimit } from "@/lib/rate-limit";

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════════════════

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  return response;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 CORS
// ═══════════════════════════════════════════════════════════════════════════

const CORS_HEADERS_PUBLIC_API = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

// ═══════════════════════════════════════════════════════════════════════════
// 🚦 RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════


function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function rateLimitResponse(reset: number): NextResponse {
  const retryAfter = Math.ceil((reset - Date.now()) / 1000);
  return new NextResponse(
    JSON.stringify({ error: "Trop de tentatives. Réessayez dans quelques minutes." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Reset": String(reset),
      },
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 MIDDLEWARE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // ── CORS preflight pour l'API publique v1 ───────────────────────────────
  if (req.method === "OPTIONS" && pathname.startsWith("/api/v1/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS_PUBLIC_API });
  }

  // ── Rate limiting : routes d'auth (brute force protection) ─────────────
  if (
    pathname.startsWith("/api/auth/callback") ||
    pathname.startsWith("/api/auth/signin") ||
    pathname === "/api/register"
  ) {
    const result = await checkAuthRateLimit(ip);
    if (!result.success) return rateLimitResponse(result.reset);
  }

  // ── Rate limiting : API générale ────────────────────────────────────────
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const result = await checkApiRateLimit(ip);
    if (!result.success) return rateLimitResponse(result.reset);
  }

  // ── Auth guards ─────────────────────────────────────────────────────────
  const isLoggedIn = !!req.auth;

  const isProtectedAppRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/marketing-os") ||
    pathname.startsWith("/sales-os");

  if (isProtectedAppRoute && !isLoggedIn) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", req.url)));
  }

  if ((pathname === "/login" || pathname === "/register") && isLoggedIn) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/marketing-os", req.url)));
  }

  // ── Headers sur toutes les réponses ─────────────────────────────────────
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);

  // CORS pour l'API publique v1 (toutes les méthodes, pas seulement OPTIONS)
  if (pathname.startsWith("/api/v1/")) {
    Object.entries(CORS_HEADERS_PUBLIC_API).forEach(([k, v]) => res.headers.set(k, v));
  }

  return applySecurityHeaders(res);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
