import type { ReviewStatus } from "./types";

export type ReviewTransition =
  | { allowed: true }
  | { allowed: false; code: "CONFLICT_REQUIRES_RESOLUTION"; reason: string };

export function validateReviewTransition(
  from: ReviewStatus,
  to: ReviewStatus,
): ReviewTransition {
  if (from === "conflict" && to !== "conflict") {
    return {
      allowed: false,
      code: "CONFLICT_REQUIRES_RESOLUTION",
      reason: "Сначала исправьте расходящиеся поля. Редактирование переведёт событие на ручную проверку.",
    };
  }
  return { allowed: true };
}
