import { describe, expect, it } from "vitest";
import { buildAgendaText, buildGroupBriefText, buildScheduledBriefText, getAgendaItems, getUpcomingItems } from "./briefing";
import { demoItems } from "./demo-data";

const now = new Date("2026-09-15T08:00:00.000Z");

describe("briefing", () => {
  it("selects today's events in Moscow", () => {
    expect(getAgendaItems(demoItems, "today", now).map((item) => item.id)).toEqual(["evt-1040"]);
  });

  it("sorts the seven-day agenda chronologically", () => {
    expect(getAgendaItems(demoItems, "week", now).map((item) => item.id))
      .toEqual(["evt-1040", "evt-1041", "evt-1042"]);
  });

  it("keeps only future events in the upcoming list", () => {
    expect(getUpcomingItems(demoItems, new Date("2026-09-18T10:00:00.000Z")).map((item) => item.id))
      .toEqual(["evt-1042"]);
  });

  it("builds readable agenda and digest text", () => {
    expect(buildAgendaText(demoItems, "today", now)).toContain("Лекция отменена");
    expect(buildGroupBriefText(demoItems, now)).toContain("Сначала решить:");
    expect(buildGroupBriefText(demoItems, now)).toContain("Конфликты: 1");
  });

  it("builds a scheduled brief only when it has useful information", () => {
    expect(buildScheduledBriefText(demoItems, now)).toContain("Утренняя сводка");
    expect(buildScheduledBriefText([], now)).toBeNull();
  });
});
