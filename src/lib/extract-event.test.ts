import { describe, expect, it } from "vitest";
import { extractEvent } from "./extract-event";

describe("extractEvent", () => {
  it("extracts a moved lab with date, time and room", () => {
    const event = extractEvent(
      "Лабу по программированию перенесли на 18.09 в 16:20, ауд. Б-304",
    );

    expect(event.title).toContain("Перенос");
    expect(event.subject.toLowerCase()).toContain("программирован");
    expect(event.date).toBe("2026-09-18");
    expect(event.time).toBe("16:20");
    expect(event.room).toBe("Б-304");
    expect(event.confidence).toBeGreaterThanOrEqual(90);
  });

  it("understands tomorrow relative to a supplied date", () => {
    const event = extractEvent(
      "Завтра математики не будет",
      new Date("2026-09-14T12:00:00"),
    );

    expect(event.title).toContain("Отмена");
    expect(event.date).toBe("2026-09-15");
  });

  it("uses the Moscow calendar day across UTC midnight", () => {
    const now = new Date("2026-12-31T22:30:00Z");
    expect(extractEvent("Сегодня физика в 9 часов", now).date).toBe("2027-01-01");
    expect(extractEvent("Послезавтра физика в 9 часов", now).date).toBe("2027-01-03");
  });

  it("finds the next named weekday", () => {
    const event = extractEvent(
      "В следующий понедельник лабораторная по физике в 09:30, ауд. А-101",
      new Date("2026-07-15T12:00:00Z"),
    );
    expect(event.date).toBe("2026-07-20");
    expect(event.time).toBe("09:30");
  });

  it("rolls dates without a year forward and rejects impossible dates", () => {
    const now = new Date("2026-12-30T12:00:00Z");
    expect(extractEvent("Физика 5 января в 10 часов", now).date).toBe("2027-01-05");
    expect(extractEvent("Физика 31.02 в 10 часов", now).date).toBe("Дата не найдена");
  });

  it("understands conversational hour expressions", () => {
    const event = extractEvent(
      "Завтра математика в половину шестого, ауд. Б-204",
      new Date("2026-07-16T08:00:00Z"),
    );
    expect(event.time).toBe("17:30");
    expect(extractEvent("Сегодня физика в 14 часов, ауд. А-101").time).toBe("14:00");
  });

  it("does not invent missing fields", () => {
    const event = extractEvent("Кажется, будет какая-то консультация");

    expect(event.date).toBe("Дата не найдена");
    expect(event.time).toBe("Время не найдено");
    expect(event.room).toBe("Аудитория не найдена");
    expect(event.confidence).toBeLessThan(60);
  });
});
