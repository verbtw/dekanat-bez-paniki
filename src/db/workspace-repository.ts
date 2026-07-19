import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { WorkspaceRole } from "@/lib/auth/access-control";
import { hashCredential } from "@/lib/auth/invitations";
import { getDb } from "./client";
import {
  groupInvitations,
  groupMemberships,
  groups,
  userProfiles,
  workspaceActivities,
} from "./schema";

export type AuthenticatedProfile = {
  id: string;
  email: string;
  name: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
  calendarToken: string | null;
};

export class WorkspaceRepositoryError extends Error {
  constructor(
    public readonly code:
      | "WORKSPACE_CREATE_FAILED"
      | "CLAIM_UNAVAILABLE"
      | "INVITATION_CREATE_FAILED"
      | "INVALID_INVITATION"
      | "CALENDAR_ROTATION_FAILED",
  ) {
    super(code);
    this.name = "WorkspaceRepositoryError";
  }
}

function newCredential() {
  return randomBytes(32).toString("base64url");
}

export async function ensureUserProfile(user: AuthenticatedProfile, locale: "ru" | "en" = "ru") {
  const db = getDb();
  const [profile] = await db
    .insert(userProfiles)
    .values({ userId: user.id, displayName: user.name || null, locale })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { displayName: user.name || null, updatedAt: new Date() },
    })
    .returning();
  return profile;
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const db = getDb();
  return db
    .select({
      id: groups.id,
      name: groups.name,
      role: groupMemberships.role,
      calendarToken: groups.calendarSubscriptionToken,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(eq(groupMemberships.userId, userId))
    .orderBy(asc(groups.name));
}

export async function getMembership(userId: string, groupId: string) {
  const db = getDb();
  const [membership] = await db
    .select({
      id: groupMemberships.id,
      userId: groupMemberships.userId,
      groupId: groupMemberships.groupId,
      role: groupMemberships.role,
      group: {
        id: groups.id,
        name: groups.name,
        telegramChatId: groups.telegramChatId,
        calendarToken: groups.calendarSubscriptionToken,
      },
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, groupId)))
    .limit(1);
  return membership ?? null;
}

export async function createWorkspace(input: { userId: string; name: string }) {
  const db = getDb();
  const groupId = `web:${randomUUID()}`;
  const membershipId = randomUUID();
  const activityId = randomUUID();

  const [groupRows] = await db.batch([
    db.insert(groups).values({ id: groupId, name: input.name }).returning({
      id: groups.id,
      name: groups.name,
      calendarToken: groups.calendarSubscriptionToken,
    }),
    db.insert(groupMemberships).values({
      id: membershipId,
      groupId,
      userId: input.userId,
      role: "owner",
    }),
    db.insert(workspaceActivities).values({
      id: activityId,
      groupId,
      actorUserId: input.userId,
      action: "workspace_created",
      details: { name: input.name },
    }),
  ] as const);

  const group = groupRows[0];
  if (!group) throw new WorkspaceRepositoryError("WORKSPACE_CREATE_FAILED");
  return { ...group, role: "owner" as const };
}

export async function claimLegacyWorkspace(input: { userId: string; token: string }) {
  const db = getDb();
  const result = await db.execute<{ group_id: string; name: string }>(sql`
    WITH target AS (
      SELECT ${groups.id} AS group_id, ${groups.name} AS name
      FROM ${groups}
      WHERE ${groups.accessToken} = ${input.token}
    ), inserted AS (
      INSERT INTO ${groupMemberships} (id, group_id, user_id, role)
      SELECT ${randomUUID()}, target.group_id, ${input.userId}, 'owner'
      FROM target
      ON CONFLICT DO NOTHING
      RETURNING group_id
    ), entitlement AS (
      SELECT group_id FROM inserted
      UNION
      SELECT target.group_id
      FROM target
      JOIN ${groupMemberships} membership
        ON membership.group_id = target.group_id
       AND membership.user_id = ${input.userId}
       AND membership.role = 'owner'
    ), activity AS (
      INSERT INTO ${workspaceActivities} (id, group_id, actor_user_id, action, details)
      SELECT ${randomUUID()}, inserted.group_id, ${input.userId}, 'workspace_claimed', '{}'::jsonb
      FROM inserted
      RETURNING group_id
    )
    SELECT entitlement.group_id, target.name
    FROM entitlement
    JOIN target ON target.group_id = entitlement.group_id
  `);
  const claimed = result.rows[0];
  if (!claimed) throw new WorkspaceRepositoryError("CLAIM_UNAVAILABLE");
  return { id: claimed.group_id, name: claimed.name, role: "owner" as const };
}

export async function createInvitation(input: {
  groupId: string;
  createdByUserId: string;
  role: "admin" | "member";
  expiresAt: Date;
}) {
  const db = getDb();
  const token = newCredential();
  const invitationId = randomUUID();

  const [createdRows] = await db.batch([
    db
      .insert(groupInvitations)
      .values({
        id: invitationId,
        groupId: input.groupId,
        createdByUserId: input.createdByUserId,
        tokenHash: hashCredential(token),
        role: input.role,
        expiresAt: input.expiresAt,
      })
      .returning({ id: groupInvitations.id, expiresAt: groupInvitations.expiresAt }),
    db.insert(workspaceActivities).values({
      groupId: input.groupId,
      actorUserId: input.createdByUserId,
      action: "invitation_created",
      details: { invitationId, role: input.role },
    }),
  ] as const);

  const invitation = createdRows[0];
  if (!invitation) throw new WorkspaceRepositoryError("INVITATION_CREATE_FAILED");
  return { ...invitation, token };
}

export async function acceptInvitation(input: { userId: string; token: string }) {
  const db = getDb();
  const tokenHash = hashCredential(input.token);
  const result = await db.execute<{ group_id: string; name: string; role: "admin" | "member" }>(sql`
    WITH candidate AS (
      SELECT invitation.id, invitation.group_id, invitation.role, invitation.accepted_at,
             invitation.accepted_by_user_id, workspace.name
      FROM ${groupInvitations} invitation
      JOIN ${groups} workspace ON workspace.id = invitation.group_id
      WHERE invitation.token_hash = ${tokenHash}
        AND invitation.revoked_at IS NULL
        AND (
          (invitation.accepted_at IS NULL AND invitation.expires_at > now())
          OR invitation.accepted_by_user_id = ${input.userId}
        )
    ), membership AS (
      INSERT INTO ${groupMemberships} (id, group_id, user_id, role)
      SELECT ${randomUUID()}, candidate.group_id, ${input.userId}, candidate.role::text::workspace_role
      FROM candidate
      WHERE candidate.accepted_at IS NULL
      ON CONFLICT DO NOTHING
      RETURNING group_id
    ), accepted AS (
      UPDATE ${groupInvitations} invitation
      SET accepted_at = COALESCE(invitation.accepted_at, now()),
          accepted_by_user_id = COALESCE(invitation.accepted_by_user_id, ${input.userId})
      FROM candidate
      WHERE invitation.id = candidate.id
        AND (invitation.accepted_by_user_id IS NULL OR invitation.accepted_by_user_id = ${input.userId})
      RETURNING invitation.group_id
    ), activity AS (
      INSERT INTO ${workspaceActivities} (id, group_id, actor_user_id, action, details)
      SELECT ${randomUUID()}, candidate.group_id, ${input.userId}, 'invitation_accepted',
             jsonb_build_object('invitationId', candidate.id)
      FROM candidate
      JOIN accepted ON accepted.group_id = candidate.group_id
      WHERE candidate.accepted_at IS NULL
      RETURNING group_id
    )
    SELECT candidate.group_id, candidate.name, candidate.role::text AS role
    FROM candidate
    JOIN accepted ON accepted.group_id = candidate.group_id
  `);
  const accepted = result.rows[0];
  if (!accepted) throw new WorkspaceRepositoryError("INVALID_INVITATION");
  return { id: accepted.group_id, name: accepted.name, role: accepted.role };
}

export async function rotateCalendarToken(input: { groupId: string; actorUserId: string }) {
  const db = getDb();
  const calendarToken = newCredential();
  const [updatedRows] = await db.batch([
    db
      .update(groups)
      .set({ calendarSubscriptionToken: calendarToken, updatedAt: new Date() })
      .where(eq(groups.id, input.groupId))
      .returning({ id: groups.id, calendarToken: groups.calendarSubscriptionToken }),
    db.insert(workspaceActivities).values({
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      action: "calendar_token_rotated",
      details: {},
    }),
  ] as const);
  const updated = updatedRows[0];
  if (!updated) throw new WorkspaceRepositoryError("CALENDAR_ROTATION_FAILED");
  return updated;
}
