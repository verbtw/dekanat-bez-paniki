import { createHash } from "node:crypto";

export type InvitationStateInput = {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

export function hashCredential(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function invitationState(input: InvitationStateInput, now = new Date()) {
  if (input.revokedAt) return "revoked" as const;
  if (input.acceptedAt) return "accepted" as const;
  if (input.expiresAt <= now) return "expired" as const;
  return "active" as const;
}
