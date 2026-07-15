import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "./telegram";

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
});
