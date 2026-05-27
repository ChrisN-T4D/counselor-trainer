const PLACEHOLDER_AUTH_URL_PATTERNS = [
  "your-app.up.railway.app",
  "your-ollama-host.example.com",
  "example.com",
];

/** Auth.js uses AUTH_URL for internal session fetches — a placeholder value crashes every request. */
export function sanitizeAuthEnv() {
  const authUrl = process.env.AUTH_URL?.trim();
  if (!authUrl) {
    return;
  }

  const lower = authUrl.toLowerCase();
  const isPlaceholder = PLACEHOLDER_AUTH_URL_PATTERNS.some((pattern) =>
    lower.includes(pattern),
  );
  const isLocalhost =
    process.env.NODE_ENV === "production" &&
    (lower.includes("localhost") || lower.includes("127.0.0.1"));

  if (isPlaceholder || isLocalhost) {
    console.warn(
      `[auth] Ignoring invalid AUTH_URL (${authUrl}). Set AUTH_URL to your real Railway domain or remove it.`,
    );
    delete process.env.AUTH_URL;
  }
}
