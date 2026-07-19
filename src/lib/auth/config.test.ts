import { describe, expect, it } from "vitest";
import { getAuthConfig } from "./config";

describe("getAuthConfig", () => {
  it("requires a branch auth URL", () => {
    expect(() =>
      getAuthConfig({ NEON_AUTH_COOKIE_SECRET: "x".repeat(32) }),
    ).toThrow("NEON_AUTH_BASE_URL");
  });

  it("rejects short cookie secrets", () => {
    expect(() =>
      getAuthConfig({
        NEON_AUTH_BASE_URL: "https://auth.example.test",
        NEON_AUTH_COOKIE_SECRET: "short",
      }),
    ).toThrow("32 characters");
  });

  it("returns valid explicit configuration", () => {
    expect(
      getAuthConfig({
        NEON_AUTH_BASE_URL: "https://auth.example.test",
        NEON_AUTH_COOKIE_SECRET: "x".repeat(32),
      }),
    ).toEqual({
      baseUrl: "https://auth.example.test",
      cookieSecret: "x".repeat(32),
    });
  });
});
