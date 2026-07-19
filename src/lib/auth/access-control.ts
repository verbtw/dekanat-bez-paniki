export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceCapability =
  | "edit_events"
  | "manage_settings"
  | "invite_members"
  | "change_roles"
  | "delete_workspace";

const roleRank: Record<WorkspaceRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const minimumRole: Record<WorkspaceCapability, WorkspaceRole> = {
  edit_events: "member",
  manage_settings: "admin",
  invite_members: "admin",
  change_roles: "owner",
  delete_workspace: "owner",
};

export function can(role: WorkspaceRole, capability: WorkspaceCapability) {
  return roleRank[role] >= roleRank[minimumRole[capability]];
}

export function assertRole(actual: WorkspaceRole, required: WorkspaceRole) {
  if (roleRank[actual] < roleRank[required]) {
    throw new Error("FORBIDDEN");
  }
}
