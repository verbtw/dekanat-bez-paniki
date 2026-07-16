import { z } from "zod";
import { inboxItemSchema } from "./event-validation";
import type { InboxItem } from "./types";

const workspaceBackupSchema = z.object({
  format: z.literal("dekanat-bez-paniki"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  workspaceName: z.string().trim().min(1).max(240),
  items: z.array(inboxItemSchema).max(500),
});

export type WorkspaceBackup = z.infer<typeof workspaceBackupSchema>;

export function buildWorkspaceBackup(
  workspaceName: string,
  items: InboxItem[],
  now = new Date(),
): WorkspaceBackup {
  return {
    format: "dekanat-bez-paniki",
    version: 1,
    createdAt: now.toISOString(),
    workspaceName,
    items,
  };
}

export function parseWorkspaceBackup(input: unknown) {
  return workspaceBackupSchema.safeParse(input);
}

export function mergeBackupItems(current: InboxItem[], imported: InboxItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of imported) byId.set(item.id, item);
  return Array.from(byId.values());
}

export function workspaceBackupFilename(workspaceName: string, now = new Date()) {
  const safeName = workspaceName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${safeName || "workspace"}-${now.toISOString().slice(0, 10)}.json`;
}
