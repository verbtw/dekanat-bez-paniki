import { describe, expect, it } from "vitest";
import { demoItems } from "./demo-data";
import {
  buildTelegramEventKeyboard,
  buildTelegramBriefingText,
  buildTelegramConflictsText,
  buildTelegramDuplicateText,
  buildTelegramEventsText,
  buildTelegramHelpText,
  buildTelegramListKeyboard,
  buildTelegramTrustedText,
  buildWorkspaceEventUrl,
  getTelegramMessagePayload,
  parseConfirmCallback,
  parseTelegramCommand,
  parseTrustedUsername,
} from "./telegram-bot";

describe("Telegram bot commands", () => {
  it("parses supported commands including commands addressed to the bot", () => {
    expect(parseTelegramCommand("/start")).toBe("start");
    expect(parseTelegramCommand("/events@dekanat_panic_test_bot now")).toBe("events");
    expect(parseTelegramCommand("/conflicts")).toBe("conflicts");
    expect(parseTelegramCommand("/today")).toBe("today");
    expect(parseTelegramCommand("/week")).toBe("week");
    expect(parseTelegramCommand("/digest")).toBe("digest");
    expect(parseTelegramCommand("/trust @teacher")).toBe("trust");
    expect(parseTelegramCommand("/trusted")).toBe("trusted");
    expect(parseTelegramCommand("/brief_on")).toBe("brief_on");
    expect(parseTelegramCommand("/wat")).toBe("unknown");
    expect(parseTelegramCommand("Перенесли пару")).toBeNull();
  });

  it("validates trusted Telegram usernames", () => {
    expect(parseTrustedUsername("/trust @Maria_Teacher")).toBe("maria_teacher");
    expect(parseTrustedUsername("/trust no")).toBeNull();
    expect(buildTelegramTrustedText(["maria_teacher"])).toContain("@maria_teacher");
    expect(buildTelegramTrustedText([])).toContain("пока нет");
  });

  it("keeps attachment captions and source kinds", () => {
    expect(getTelegramMessagePayload({ photo: [{}], caption: "  Перенос на 18.09  " }))
      .toEqual({ text: "Перенос на 18.09", kind: "image", attachmentLabel: "фотографии" });
    expect(getTelegramMessagePayload({ document: {}, caption: "Расписание" }).kind).toBe("document");
    expect(getTelegramMessagePayload({ voice: {} }).attachmentLabel).toBe("голосовому сообщению");
  });

  it("formats the conflict queue and duplicate response", () => {
    expect(buildTelegramConflictsText(demoItems)).toContain("Противоречия");
    expect(buildTelegramConflictsText(demoItems.filter((item) => item.status !== "conflict"))).toContain("нет");
    expect(buildTelegramDuplicateText(demoItems[0])).toContain("Новую карточку не создавал");
  });

  it("builds useful help and an empty events state", () => {
    expect(buildTelegramHelpText("https://example.com")).toContain("/events");
    expect(buildTelegramHelpText("https://example.com")).toContain("/digest");
    expect(buildTelegramEventsText([])).toContain("пока нет");
  });

  it("builds daily, weekly, and group briefings", () => {
    const now = new Date("2026-09-15T08:00:00.000Z");
    expect(buildTelegramBriefingText(demoItems, "today", now)).toContain("Лекция отменена");
    expect(buildTelegramBriefingText(demoItems, "week", now)).toContain("Ближайшие 7 дней");
    expect(buildTelegramBriefingText(demoItems, "digest", now)).toContain("Сводка группы");
  });

  it("formats saved events and limits the list", () => {
    const events = buildTelegramEventsText([...demoItems, ...demoItems]);
    expect(events).toContain("20 сентября");
    expect(events).not.toContain("6. ");
  });

  it("builds a scoped confirmation callback", () => {
    const item = { ...demoItems[1], id: "tg:-100123:42" };
    const keyboard = buildTelegramEventKeyboard(item, true, "https://example.com");
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe("confirm:tg:-100123:42");
    expect(parseConfirmCallback("confirm:tg:-100123:42")).toBe("tg:-100123:42");
    expect(parseConfirmCallback("other:42")).toBeNull();
  });

  it("does not offer one-click confirmation for a conflict", () => {
    const keyboard = buildTelegramEventKeyboard(demoItems[0], true, "https://example.com");
    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "🌐 Открыть приложение", url: "https://example.com" }],
    ]);
  });

  it("builds deep-link rows for event lists", () => {
    const keyboard = buildTelegramListKeyboard(demoItems, "https://example.com", "workspace-token");
    expect(keyboard.inline_keyboard).toHaveLength(4);
    expect(keyboard.inline_keyboard[0][0].url).toContain("event=evt-1042");
    expect(keyboard.inline_keyboard[0][0].url).toContain("workspace=workspace-token");
    expect(keyboard.inline_keyboard[3][0].text).toBe("🌐 Открыть всё");
  });

  it("builds an exact workspace deep link without losing existing parameters", () => {
    const url = new URL(buildWorkspaceEventUrl(
      "https://example.com/app?from=telegram",
      "secret workspace",
      "tg:-100123:42",
    ));
    expect(url.searchParams.get("from")).toBe("telegram");
    expect(url.searchParams.get("workspace")).toBe("secret workspace");
    expect(url.searchParams.get("event")).toBe("tg:-100123:42");
  });
});
