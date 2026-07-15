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

  it("does not invent missing fields", () => {
    const event = extractEvent("Кажется, будет какая-то консультация");

    expect(event.date).toBe("Дата не найдена");
    expect(event.time).toBe("Время не найдено");
    expect(event.room).toBe("Аудитория не найдена");
    expect(event.confidence).toBeLessThan(60);
  });
});
