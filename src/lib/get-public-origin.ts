import type { NextRequest } from "next/server";

function usableAuthUrl(): string | undefined {
  const authUrl = process.env.AUTH_URL?.trim();
  if (!authUrl) {
    return undefined;
  }

  const lower = authUrl.toLowerCase();
  if (
    lower.includes("your-app.up.railway.app") ||
    lower.includes("example.com") ||
    (process.env.NODE_ENV === "production" &&
      (lower.includes("localhost") || lower.includes("127.0.0.1")))
  ) {
    return undefined;
  }

  return authUrl.replace(/\/$/, "");
}

/** Resolve the browser-facing origin behind Railway/other proxies. */
export function getPublicOrigin(request: NextRequest): string {
  const authUrl = usableAuthUrl();
  if (authUrl) {
    return authUrl;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost.split(",")[0]?.trim()}`;
  }

  return request.nextUrl.origin;
}
