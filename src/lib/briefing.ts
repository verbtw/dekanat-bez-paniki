import type { InboxItem } from "./types";

export type BriefingPeriod = "today" | "week" | "digest";

function isoDateInMoscow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDate(value: string) {
  if (!isValidDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function byDateAndTime(left: InboxItem, right: InboxItem) {
  return `${left.event.date}T${left.event.time}`.localeCompare(
    `${right.event.date}T${right.event.time}`,
  );
}

export function getAgendaItems(
  items: InboxItem[],
  period: Exclude<BriefingPeriod, "digest">,
  now = new Date(),
) {
  const today = isoDateInMoscow(now);
  const lastDate = period === "today" ? today : addDays(today, 6);
  return items
    .filter((item) => isValidDate(item.event.date))
    .filter((item) => item.event.date >= today && item.event.date <= lastDate)
    .sort(byDateAndTime);
}

export function getUpcomingItems(items: InboxItem[], now = new Date(), limit = 6) {
  const today = isoDateInMoscow(now);
  return items
    .filter((item) => isValidDate(item.event.date) && item.event.date >= today)
    .sort(byDateAndTime)
    .slice(0, limit);
}

function eventLine(item: InboxItem) {
  const marker = item.status === "confirmed" ? "✅" : item.status === "conflict" ? "⚠️" : "🟡";
  return `${marker} ${formatDate(item.event.date)} · ${item.event.time} — ${item.event.title} (${item.event.room})`;
}

export function buildAgendaText(
  items: InboxItem[],
  period: BriefingPeriod,
  now = new Date(),
) {
  if (period === "digest") return buildGroupBriefText(items, now);

  const agenda = getAgendaItems(items, period, now);
  const heading = period === "today" ? "Сегодня" : "Ближайшие 7 дней";
  if (agenda.length === 0) {
    return `📭 ${heading.toLowerCase()}: сохранённых событий нет.`;
  }

  const conflicts = agenda.filter((item) => item.status === "conflict").length;
  return [
    `📅 ${heading} · ${agenda.length}`,
    ...(conflicts ? [`⚠️ Требуют решения: ${conflicts}`] : []),
    "",
    ...agenda.map(eventLine),
  ].join("\n");
}

export function buildGroupBriefText(items: InboxItem[], now = new Date()) {
  const upcoming = getUpcomingItems(items, now, 5);
  const conflicts = items.filter((item) => item.status === "conflict");
  const review = items.filter((item) => item.status === "review").length;
  const lines = [
    "☀️ Сводка группы",
    `Подтверждено: ${items.filter((item) => item.status === "confirmed").length} · На проверке: ${review} · Конфликты: ${conflicts.length}`,
    "",
  ];

  if (conflicts.length) {
    lines.push("Сначала решить:", ...conflicts.slice(0, 3).map((item) => `⚠️ ${item.event.title} — ${item.reason}`), "");
  }

  if (upcoming.length) {
    lines.push("Ближайшие события:", ...upcoming.map(eventLine));
  } else {
    lines.push("Ближайших событий пока нет.");
  }
  return lines.join("\n");
}

export function buildScheduledBriefText(items: InboxItem[], now = new Date()) {
  const today = getAgendaItems(items, "today", now);
  const conflicts = items.filter((item) => item.status === "conflict");
  if (today.length === 0 && conflicts.length === 0) return null;

  const lines = ["☀️ Утренняя сводка группы", ""];
  if (today.length) {
    lines.push(
      `Сегодня (${today.length}):`,
      ...today.map(eventLine),
      "",
    );
  } else {
    lines.push("Сегодня сохранённых событий нет.", "");
  }
  if (conflicts.length) {
    lines.push(
      `Требуют решения (${conflicts.length}):`,
      ...conflicts.slice(0, 3).map((item) => `⚠️ ${item.event.title} — ${item.reason}`),
      "",
    );
  }
  lines.push("/digest — полная сводка · /brief_off — отключить");
  return lines.join("\n");
}
