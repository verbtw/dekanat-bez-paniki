import { describe, expect, it } from "vitest";
import { demoItems } from "./demo-data";
import { applyConflictAssessment, assessEventConflict } from "./conflict-detector";

const base = demoItems[0];

describe("conflict detector", () => {
  it("recognizes a duplicate and keeps one card", () => {
    const duplicate = {
      ...base,
      id: "duplicate",
      sources: [{ ...base.sources[0], id: "duplicate-source", text: "Напоминаю про ту же лабу" }],
    };
    expect(assessEventConflict(duplicate, [base])).toMatchObject({
      kind: "duplicate",
      matchedId: base.id,
    });
  });

  it("flags changed date and room for the same event", () => {
    const changed = {
      ...base,
      id: "changed",
      event: { ...base.event, date: "2026-09-22", room: "В-301" },
      sources: [{ ...base.sources[0], id: "changed-source", text: "Лабу по алгоритмам перенесли на 22 сентября в В-301" }],
    };
    const assessment = assessEventConflict(changed, [base]);
    expect(assessment).toMatchObject({ kind: "conflict", fields: ["date", "room"] });
    expect(applyConflictAssessment(changed, assessment).status).toBe("conflict");
  });

  it("does not connect unrelated subjects", () => {
    const unrelated = {
      ...base,
      id: "unrelated",
      event: { ...base.event, title: "Зачёт по истории", subject: "История" },
      sources: [{ ...base.sources[0], id: "unrelated-source", text: "Зачёт по истории" }],
    };
    expect(assessEventConflict(unrelated, [base])).toEqual({ kind: "none" });
  });
});
