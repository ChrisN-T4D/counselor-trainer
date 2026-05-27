/** Use only same-app relative paths — ignore absolute callbackUrl values (e.g. localhost from misconfigured AUTH_URL). */
export function safeCallbackUrl(url: string | null, fallback = "/dashboard"): string {
  if (!url) {
    return fallback;
  }

  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash || fallback;
  } catch {
    return fallback;
  }
}
