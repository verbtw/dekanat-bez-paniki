import { describe, expect, it } from "vitest";
import { demoItems } from "./demo-data";
import { editableEventSchema, inboxItemSchema, reviewStatusSchema } from "./event-validation";

describe("event API validation", () => {
  it("accepts a complete inbox item", () => {
    expect(inboxItemSchema.safeParse(demoItems[0]).success).toBe(true);
  });

  it("rejects confidence outside the supported range", () => {
    const invalid = {
      ...demoItems[0],
      event: { ...demoItems[0].event, confidence: 140 },
    };
    expect(inboxItemSchema.safeParse(invalid).success).toBe(false);
  });

  it("allows only known review statuses", () => {
    expect(reviewStatusSchema.safeParse("confirmed").success).toBe(true);
    expect(reviewStatusSchema.safeParse("published").success).toBe(false);
  });

  it("validates manually edited calendar fields", () => {
    expect(editableEventSchema.safeParse({
      title: "Лабораторная работа",
      subject: "Базы данных",
      date: "2026-09-20",
      time: "10:10",
      room: "Б-402",
    }).success).toBe(true);
    expect(editableEventSchema.safeParse({
      title: "Лабораторная работа",
      subject: "Базы данных",
      date: "20 сентября",
      time: "после пар",
      room: "Б-402",
    }).success).toBe(false);
  });
});
