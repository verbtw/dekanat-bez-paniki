import { describe, expect, it } from "vitest";
import { assertRole, can } from "./access-control";

describe("workspace access control", () => {
  it("allows all members to edit events", () => {
    expect(can("member", "edit_events")).toBe(true);
  });

  it("limits invitations to admins and owners", () => {
    expect(can("member", "invite_members")).toBe(false);
    expect(can("admin", "invite_members")).toBe(true);
    expect(can("owner", "invite_members")).toBe(true);
  });

  it("limits role changes to owners", () => {
    expect(() => assertRole("admin", "owner")).toThrow("FORBIDDEN");
    expect(() => assertRole("owner", "owner")).not.toThrow();
  });
});
