import { describe, expect, it } from "vitest";
import { demoItems } from "./demo-data";
import {
  buildWorkspaceBackup,
  mergeBackupItems,
  parseWorkspaceBackup,
  workspaceBackupFilename,
} from "./workspace-backup";

describe("workspace backup", () => {
  it("builds and validates a portable versioned backup", () => {
    const backup = buildWorkspaceBackup("ИВТ-101", demoItems, new Date("2026-07-16T10:00:00Z"));
    expect(parseWorkspaceBackup(JSON.parse(JSON.stringify(backup))).success).toBe(true);
    expect(workspaceBackupFilename("ИВТ-101", new Date("2026-07-16T10:00:00Z")))
      .toBe("ивт-101-2026-07-16.json");
  });

  it("rejects unknown formats and malformed event payloads", () => {
    expect(parseWorkspaceBackup({ format: "other", version: 1, items: [] }).success).toBe(false);
    const backup = buildWorkspaceBackup("ИВТ-101", demoItems);
    expect(parseWorkspaceBackup({ ...backup, items: [{ id: "broken" }] }).success).toBe(false);
  });

  it("keeps accepting legacy backups after the Morrow rename", () => {
    const backup = buildWorkspaceBackup("ИВТ-101", demoItems);
    expect(parseWorkspaceBackup({ ...backup, format: "dekanat-bez-paniki" }).success).toBe(true);
  });

  it("merges by stable id and lets the imported copy win", () => {
    const changed = { ...demoItems[0], reason: "Восстановленная версия" };
    const merged = mergeBackupItems(demoItems, [changed]);
    expect(merged).toHaveLength(demoItems.length);
    expect(merged.find((item) => item.id === changed.id)?.reason).toBe("Восстановленная версия");
  });
});
