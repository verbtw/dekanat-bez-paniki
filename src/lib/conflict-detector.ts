import type { InboxItem } from "./types";

export type ConflictField = "date" | "time" | "room";

export type ConflictAssessment =
  | { kind: "none" }
  | { kind: "duplicate"; matchedId: string; reason: string }
  | { kind: "conflict"; matchedId: string; fields: ConflictField[]; reason: string };

const unknownValues = new Set([
  "предмет не определён",
  "дата не найдена",
  "время не найдено",
  "аудитория не найдена",
]);

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isKnown(value: string) {
  const normalized = normalize(value);
  return Boolean(normalized) && !unknownValues.has(normalized);
}

function titleTokens(item: InboxItem) {
  const noise = new Set(["событие", "перенесена", "перенесли", "изменена", "изменили", "отменена"]);
  return new Set(
    normalize(`${item.event.title} ${item.sources[0]?.text ?? ""}`)
      .split(" ")
      .filter((token) => token.length > 3 && !noise.has(token)),
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.min(left.size, right.size);
}

function daysApart(left: string, right: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(left) || !/^\d{4}-\d{2}-\d{2}$/.test(right)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(new Date(`${left}T12:00:00`).getTime() - new Date(`${right}T12:00:00`).getTime()) / 86_400_000;
}

function sameField(left: string, right: string) {
  return isKnown(left) && isKnown(right) && normalize(left) === normalize(right);
}

export function assessEventConflict(item: InboxItem, existingItems: InboxItem[]): ConflictAssessment {
  const candidates = existingItems
    .filter((existing) => existing.id !== item.id)
    .map((existing) => {
      const sameSubject = sameField(item.event.subject, existing.event.subject);
      const overlap = tokenOverlap(titleTokens(item), titleTokens(existing));
      const score =
        (sameSubject ? 3 : 0) +
        (overlap >= 0.45 ? 2 : 0) +
        (sameField(item.event.time, existing.event.time) ? 1 : 0) +
        (sameField(item.event.room, existing.event.room) ? 1 : 0) +
        (daysApart(item.event.date, existing.event.date) <= 14 ? 1 : 0);
      return { existing, score, overlap };
    })
    .filter(({ score, overlap }) => score >= 5 || (score >= 4 && overlap >= 0.45))
    .sort((left, right) => right.score - left.score);

  const match = candidates[0]?.existing;
  if (!match) return { kind: "none" };

  const fields = (["date", "time", "room"] as const).filter((field) =>
    isKnown(item.event[field]) &&
    isKnown(match.event[field]) &&
    !sameField(item.event[field], match.event[field]),
  );
  if (fields.length === 0) {
    return {
      kind: "duplicate",
      matchedId: match.id,
      reason: `Похоже на уже сохранённое событие «${match.event.title}». Источник добавлен к существующей карточке.`,
    };
  }

  const labels: Record<ConflictField, string> = {
    date: "дата",
    time: "время",
    room: "аудитория",
  };
  return {
    kind: "conflict",
    matchedId: match.id,
    fields,
    reason: `Найдено противоречие с «${match.event.title}»: ${fields.map((field) => labels[field]).join(", ")}. Проверь оба источника.`,
  };
}

export function applyConflictAssessment(item: InboxItem, assessment: ConflictAssessment): InboxItem {
  if (assessment.kind !== "conflict") return item;
  return { ...item, status: "conflict", reason: assessment.reason };
}
