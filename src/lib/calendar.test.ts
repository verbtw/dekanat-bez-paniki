import { describe, expect, it } from "vitest";
import { demoItems } from "./demo-data";
import {
  buildCalendarEvent,
  buildCalendarFeedUrl,
  buildGroupCalendar,
  calendarFilename,
} from "./calendar";

describe("calendar export", () => {
  it("builds a portable one-hour ICS event", () => {
    const item = {
      ...demoItems[0],
      event: { ...demoItems[0].event, date: "2026-09-20", time: "10:10" },
    };
    const calendar = buildCalendarEvent(item, new Date("2026-07-16T10:00:00Z"));

    expect(calendar).toContain("DTSTART:20260920T101000");
    expect(calendar).toContain("DTEND:20260920T111000");
    expect(calendar).toContain("DTSTAMP:20260716T100000Z");
    expect(calendarFilename(item)).toMatch(/\.ics$/);
  });

  it("refuses to export incomplete dates", () => {
    const item = {
      ...demoItems[0],
      event: { ...demoItems[0].event, date: "Дата не найдена" },
    };
    expect(buildCalendarEvent(item)).toBeNull();
  });

  it("publishes only confirmed events in the group calendar", () => {
    const calendar = buildGroupCalendar(demoItems, "ИВТ-101", new Date("2026-07-16T10:00:00Z"));
    expect(calendar).toContain("X-WR-CALNAME:ИВТ-101");
    expect(calendar).toContain("Лекция отменена");
    expect(calendar).not.toContain("Лабораторная №2 перенесена");
    expect(calendar).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M");
  });

  it("uses the dedicated token parameter for subscription URLs", () => {
    const url = buildCalendarFeedUrl("https://morrow.example", "calendar-secret");
    expect(url).toBe("https://morrow.example/api/calendar?token=calendar-secret");
    expect(url).not.toContain("workspace=");
  });
});
