import { describe, expect, it } from "vitest";
import { hashCredential, invitationState } from "./invitations";

describe("workspace invitations", () => {
  it("hashes tokens deterministically without retaining plaintext", () => {
    expect(hashCredential("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCredential("secret-token")).not.toContain("secret-token");
    expect(hashCredential("secret-token")).toBe(hashCredential("secret-token"));
  });

  it("rejects expired invitations", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    expect(
      invitationState(
        {
          expiresAt: new Date("2026-07-19T11:00:00Z"),
          acceptedAt: null,
          revokedAt: null,
        },
        now,
      ),
    ).toBe("expired");
  });

  it("rejects accepted and revoked invitations", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    expect(
      invitationState(
        {
          expiresAt: new Date("2026-07-20T11:00:00Z"),
          acceptedAt: now,
          revokedAt: null,
        },
        now,
      ),
    ).toBe("accepted");
    expect(
      invitationState(
        {
          expiresAt: new Date("2026-07-20T11:00:00Z"),
          acceptedAt: null,
          revokedAt: now,
        },
        now,
      ),
    ).toBe("revoked");
  });
});
