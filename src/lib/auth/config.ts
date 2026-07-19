export type AuthEnvironment = Record<string, string | undefined>;

export function getAuthConfig(env: AuthEnvironment) {
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim();
  const cookieSecret = env.NEON_AUTH_COOKIE_SECRET?.trim();

  if (!baseUrl) {
    throw new Error("NEON_AUTH_BASE_URL is required");
  }
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("NEON_AUTH_BASE_URL must be an absolute HTTP URL");
  }
  if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
    throw new Error("NEON_AUTH_BASE_URL must be an absolute HTTP URL");
  }
  if (!cookieSecret || cookieSecret.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters");
  }

  return { baseUrl, cookieSecret };
}
