import type { WorkspaceRole } from "./access-control";
import { assertRole } from "./access-control";
import { getMembership as getStoredMembership } from "../../db/workspace-repository";
import { HttpError } from "../http-error";
import type { AuthenticatedUser } from "./session";

export type GuardMembership = NonNullable<Awaited<ReturnType<typeof getStoredMembership>>>;

type GuardDependencies = {
  getUser: () => Promise<AuthenticatedUser | null>;
  getMembership: (userId: string, groupId: string) => Promise<GuardMembership | null>;
};

export function createWorkspaceGuard(dependencies: GuardDependencies) {
  return async function guard(groupId: string, minimumRole: WorkspaceRole = "member") {
    const user = await dependencies.getUser();
    if (!user) {
      throw new HttpError(401, "UNAUTHORIZED", "Сначала войдите в аккаунт.");
    }

    const membership = await dependencies.getMembership(user.id, groupId);
    if (!membership) {
      throw new HttpError(403, "FORBIDDEN", "Нет доступа к рабочему пространству.");
    }

    try {
      assertRole(membership.role, minimumRole);
    } catch {
      throw new HttpError(403, "FORBIDDEN", "Недостаточно прав для этого действия.");
    }

    return { user, membership };
  };
}

export async function requireUser() {
  const { getCurrentUser } = await import("./session");
  const user = await getCurrentUser();
  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "Сначала войдите в аккаунт.");
  }
  return user;
}

export async function requireWorkspaceAccess(
  groupId: string,
  minimumRole: WorkspaceRole = "member",
) {
  const { getCurrentUser } = await import("./session");
  return createWorkspaceGuard({
    getUser: getCurrentUser,
    getMembership: getStoredMembership,
  })(groupId, minimumRole);
}
