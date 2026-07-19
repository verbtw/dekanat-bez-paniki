import { describe, expect, it } from "vitest";
import { createWorkspaceSchema, invitationSchema } from "./validation";

describe("workspace API validation", () => {
  it("trims a valid workspace name", () => {
    expect(createWorkspaceSchema.parse({ name: "  ИВТ-101  " })).toEqual({
      name: "ИВТ-101",
    });
  });

  it("rejects workspace names outside the supported range", () => {
    expect(createWorkspaceSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });

  it("rejects owner as an invitation role", () => {
    expect(
      invitationSchema.safeParse({ groupId: "g1", role: "owner", expiresInHours: 24 })
        .success,
    ).toBe(false);
  });

  it("clamps invitation duration to one week", () => {
    expect(
      invitationSchema.safeParse({ groupId: "g1", role: "member", expiresInHours: 169 })
        .success,
    ).toBe(false);
  });
});
