import { describe, expect, it, vi } from "vitest";
import { createWorkspaceGuard } from "./workspace-guard";

const user = { id: "u1", email: "u@example.test", name: "U" };

describe("workspace guard", () => {
  it("returns 401 without a session", async () => {
    const guard = createWorkspaceGuard({
      getUser: vi.fn().mockResolvedValue(null),
      getMembership: vi.fn(),
    });
    await expect(guard("group:1")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("returns 403 without membership", async () => {
    const guard = createWorkspaceGuard({
      getUser: vi.fn().mockResolvedValue(user),
      getMembership: vi.fn().mockResolvedValue(null),
    });
    await expect(guard("group:1")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("returns 403 when the role is below the required role", async () => {
    const guard = createWorkspaceGuard({
      getUser: vi.fn().mockResolvedValue(user),
      getMembership: vi.fn().mockResolvedValue({
        id: "m1",
        userId: "u1",
        groupId: "group:1",
        role: "member",
        group: { id: "group:1", name: "Group" },
      }),
    });
    await expect(guard("group:1", "admin")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("returns the authorized user and membership", async () => {
    const membership = {
      id: "m1",
      userId: "u1",
      groupId: "group:1",
      role: "admin" as const,
      group: { id: "group:1", name: "Group" },
    };
    const guard = createWorkspaceGuard({
      getUser: vi.fn().mockResolvedValue(user),
      getMembership: vi.fn().mockResolvedValue(membership),
    });
    await expect(guard("group:1", "admin")).resolves.toEqual({ user, membership });
  });
});
