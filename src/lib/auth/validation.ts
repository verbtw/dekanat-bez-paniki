import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const invitationSchema = z.object({
  groupId: z.string().trim().min(1).max(160),
  role: z.enum(["admin", "member"]),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export const credentialSchema = z.object({
  token: z.string().trim().min(20).max(512),
});

export const calendarTokenSchema = z.object({
  groupId: z.string().trim().min(1).max(160),
});
