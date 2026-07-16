import { afterEach, describe, expect, it, vi } from "vitest";
import { answerTelegramCallback, getTelegramMemberAccess, sendTelegramMessage } from "./telegram";

const originalToken = process.env.TELEGRAM_BOT_TOKEN;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalToken;
});

describe("sendTelegramMessage", () => {
  it("does not call Telegram without a token", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTelegramMessage("1", "test")).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a network failure into a stable result", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(sendTelegramMessage("1", "test")).resolves.toEqual({
      sent: false,
      reason: "network-error",
    });
  });

  it("sends inline actions and callback answers through the expected methods", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramMessage("10", "event", {
      replyMarkup: { inline_keyboard: [[{ text: "Confirm", callback_data: "confirm:1" }]] },
      replyToMessageId: 5,
    });
    await answerTelegramCallback("callback-1", "done");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: "10",
          text: "event",
          reply_markup: {
            inline_keyboard: [[{ text: "Confirm", callback_data: "confirm:1" }]],
          },
          reply_parameters: { message_id: 5 },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/bottest-token/answerCallbackQuery",
      expect.any(Object),
    );
  });

  it("recognizes Telegram administrators as group leads", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { status: "administrator" } }),
    }));

    await expect(getTelegramMemberAccess("-100", 42)).resolves.toEqual({
      verified: true,
      administrator: true,
      role: "group-lead",
    });
  });

  it("fails closed when member permissions cannot be verified", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getTelegramMemberAccess("-100", 42)).resolves.toEqual({
      verified: false,
      administrator: false,
      role: "student",
    });
  });
});
