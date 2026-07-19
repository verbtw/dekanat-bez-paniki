import { describe, expect, it } from "vitest";
import { translateUiText } from "./ui-i18n";

describe("UI localization", () => {
  it("uses correct English singular and plural forms", () => {
    expect(translateUiText("1 сообщение", "en")).toBe("1 message");
    expect(translateUiText("2 сообщения", "en")).toBe("2 messages");
    expect(translateUiText("1 источник", "en")).toBe("1 source");
    expect(translateUiText("3 источника", "en")).toBe("3 sources");
  });

  it("translates isolated counters rendered by React", () => {
    expect(translateUiText("источник", "en")).toBe("source");
    expect(translateUiText("источника", "en")).toBe("sources");
  });

  it("round-trips dates and interface labels", () => {
    expect(translateUiText("20 сентября", "en")).toBe("20 September");
    expect(translateUiText("20 September", "ru")).toBe("20 сентября");
    expect(translateUiText("Установить приложение", "en")).toBe("Install app");
  });

  it("translates account and onboarding copy", () => {
    expect(translateUiText("Создать аккаунт", "en")).toBe("Create account");
    expect(translateUiText("Войти", "en")).toBe("Sign in");
    expect(translateUiText("Создать пространство", "en")).toBe("Create workspace");
    expect(translateUiText("Подключить Telegram-группу", "en")).toBe("Connect Telegram group");
    expect(translateUiText("Create account", "ru")).toBe("Создать аккаунт");
  });

  it("translates safe invitation states", () => {
    expect(translateUiText("Приглашение принято", "en")).toBe("Invitation accepted");
    expect(translateUiText("Ссылка недействительна", "en")).toBe("This link is invalid");
    expect(translateUiText("Обновить ссылку календаря", "en")).toBe("Rotate calendar link");
  });
});
