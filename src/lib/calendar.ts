import type { InboxItem } from "./types";

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function buildEventLines(item: InboxItem, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.event.date) || !/^\d{2}:\d{2}$/.test(item.event.time)) {
    return null;
  }
  const start = new Date(`${item.event.date}T${item.event.time}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1_000);
  const description = [
    item.reason,
    item.sources[0] ? `Источник: ${item.sources[0].author} — ${item.sources[0].text}` : "",
  ].filter(Boolean).join("\n\n");

  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcs(item.id)}@dekanat-bez-paniki`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatLocal(start)}`,
    `DTEND:${formatLocal(end)}`,
    `SUMMARY:${escapeIcs(item.event.title)}`,
    `LOCATION:${escapeIcs(item.event.room)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `STATUS:${item.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
    `SEQUENCE:${Math.max((item.activity?.length ?? 0) + item.sources.length - 1, 0)}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ];
}

export function buildCalendarEvent(item: InboxItem, now = new Date()) {
  const eventLines = buildEventLines(item, now);
  if (!eventLines) return null;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Morrow//RU",
    "CALSCALE:GREGORIAN",
    ...eventLines,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function buildGroupCalendar(items: InboxItem[], calendarName: string, now = new Date()) {
  const events = items
    .filter((item) => item.status === "confirmed")
    .map((item) => buildEventLines(item, now))
    .filter((lines): lines is string[] => Boolean(lines));

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Morrow//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    ...events.flat(),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function calendarFilename(item: InboxItem) {
  const safeTitle = item.event.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
  return `${safeTitle || "event"}.ics`;
}
