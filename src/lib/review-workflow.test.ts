import { describe, expect, it } from "vitest";
import { validateReviewTransition } from "./review-workflow";

describe("review workflow", () => {
  it("blocks direct confirmation of unresolved conflicts", () => {
    expect(validateReviewTransition("conflict", "confirmed")).toEqual({
      allowed: false,
      code: "CONFLICT_REQUIRES_RESOLUTION",
      reason: expect.stringContaining("исправьте"),
    });
  });

  it("requires a field edit before a conflict can leave its state", () => {
    expect(validateReviewTransition("review", "confirmed")).toEqual({ allowed: true });
    expect(validateReviewTransition("conflict", "review")).toEqual(expect.objectContaining({
      allowed: false,
      code: "CONFLICT_REQUIRES_RESOLUTION",
    }));
    expect(validateReviewTransition("confirmed", "review")).toEqual({ allowed: true });
  });
});
