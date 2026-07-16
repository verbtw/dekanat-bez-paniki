import { describe, expect, it } from "vitest";
import { buildSharedMessage } from "./share-target";

describe("share target", () => {
  it("combines shared title, text, and URL without duplicates", () => {
    expect(buildSharedMessage({
      title: "Перенос пары",
      text: "Завтра физика в 14:00",
      url: "https://t.me/example/42",
    })).toBe("Перенос пары\nЗавтра физика в 14:00\nhttps://t.me/example/42");
    expect(buildSharedMessage({ title: "одно", text: "одно" })).toBe("одно");
  });

  it("limits untrusted shared text to the application input limit", () => {
    expect(buildSharedMessage({ text: "а".repeat(5_000) })).toHaveLength(4_000);
  });
});
