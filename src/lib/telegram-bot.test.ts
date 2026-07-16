import { describe, expect, it } from "vitest";
import { demoItems } from "./demo-data";
import {
  buildTelegramEventKeyboard,
  buildTelegramConflictsText,
  buildTelegramDuplicateText,
  buildTelegramEventsText,
  buildTelegramHelpText,
  parseConfirmCallback,
  parseTelegramCommand,
} from "./telegram-bot";

describe("Telegram bot commands", () => {
  it("parses supported commands including commands addressed to the bot", () => {
    expect(parseTelegramCommand("/start")).toBe("start");
    expect(parseTelegramCommand("/events@dekanat_panic_test_bot now")).toBe("events");
    expect(parseTelegramCommand("/conflicts")).toBe("conflicts");
    expect(parseTelegramCommand("/wat")).toBe("unknown");
    expect(parseTelegramCommand("Перенесли пару")).toBeNull();
  });

  it("formats the conflict queue and duplicate response", () => {
    expect(buildTelegramConflictsText(demoItems)).toContain("Противоречия");
    expect(buildTelegramConflictsText(demoItems.filter((item) => item.status !== "conflict"))).toContain("нет");
    expect(buildTelegramDuplicateText(demoItems[0])).toContain("Новую карточку не создавал");
  });

  it("builds useful help and an empty events state", () => {
    expect(buildTelegramHelpText("https://example.com")).toContain("/events");
    expect(buildTelegramEventsText([])).toContain("пока нет");
  });

  it("formats saved events and limits the list", () => {
    const events = buildTelegramEventsText([...demoItems, ...demoItems]);
    expect(events).toContain("20 сентября");
    expect(events).not.toContain("6. ");
  });

  it("builds a scoped confirmation callback", () => {
    const item = { ...demoItems[0], id: "tg:-100123:42" };
    const keyboard = buildTelegramEventKeyboard(item, true, "https://example.com");
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe("confirm:tg:-100123:42");
    expect(parseConfirmCallback("confirm:tg:-100123:42")).toBe("tg:-100123:42");
    expect(parseConfirmCallback("other:42")).toBeNull();
  });
});
