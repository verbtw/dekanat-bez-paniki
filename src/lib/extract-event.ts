import type { ExtractedEvent } from "./types";

const monthMap: Record<string, string> = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

const weekdayMap: Record<string, number> = {
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среду: 3,
  четверг: 4,
  пятницу: 5,
  субботу: 6,
};

const halfHourMap: Record<string, number> = {
  первого: 12,
  второго: 13,
  третьего: 14,
  четвертого: 15,
  пятого: 16,
  шестого: 17,
  седьмого: 18,
  восьмого: 19,
  девятого: 20,
  десятого: 21,
  одиннадцатого: 22,
  двенадцатого: 23,
};

function pad(value: string) {
  return value.padStart(2, "0");
}

function moscowCalendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function validCalendarDate(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    ? candidate
    : null;
}

function futureCalendarDate(day: number, month: number, base: Date, explicitYear?: number) {
  const baseYear = base.getUTCFullYear();
  if (explicitYear) return validCalendarDate(explicitYear, month, day);
  const currentYear = validCalendarDate(baseYear, month, day);
  if (!currentYear) return null;
  return currentYear < base ? validCalendarDate(baseYear + 1, month, day) : currentYear;
}

function relativeWeekdayDate(normalized: string, base: Date) {
  const match = normalized.match(
    /(?:^|[\s,(])(?:в|во)\s+(?:следующ(?:ий|ую|ее)\s+)?(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?=$|[\s,.!?])/,
  );
  if (!match) return null;
  const target = weekdayMap[match[1]];
  let days = (target - base.getUTCDay() + 7) % 7;
  if (days === 0) days = 7;
  return addCalendarDays(base, days);
}

export function extractEvent(text: string, now = new Date()): ExtractedEvent {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  const baseDate = moscowCalendarDate(now);
  const numericDate = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  const wordDate = normalized.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?=$|[\s,.!?])/,
  );
  // Для времени принимаем двоеточие: точка чаще является частью даты 18.09.
  const exactTime = normalized.match(/\b(?:в\s*)?(\d{1,2}):([0-5]\d)\b/);
  const hourTime = normalized.match(/(?:^|\s)в\s+(\d{1,2})\s*(?:ч(?:ас(?:а|ов)?)?\.?)(?=$|[\s,.!?])/);
  const halfTime = normalized.match(
    /(?:^|\s)в\s+половину\s+(первого|второго|третьего|четвертого|пятого|шестого|седьмого|восьмого|девятого|десятого|одиннадцатого|двенадцатого)(?=$|[\s,.!?])/,
  );
  const room = normalized.match(
    /(?:ауд(?:итория)?\.?|каб(?:инет)?\.?)\s*[-№#]?\s*([а-яa-z]?(?:[-\s])?\d{2,4}[а-яa-z]?)/i,
  );

  let date = "Дата не найдена";
  if (numericDate) {
    const explicitYear = numericDate[3]
      ? numericDate[3].length === 2
        ? Number(`20${numericDate[3]}`)
        : Number(numericDate[3])
      : undefined;
    const candidate = futureCalendarDate(
      Number(numericDate[1]),
      Number(numericDate[2]),
      baseDate,
      explicitYear,
    );
    if (candidate) date = isoDate(candidate);
  } else if (wordDate) {
    const candidate = futureCalendarDate(
      Number(wordDate[1]),
      Number(monthMap[wordDate[2]]),
      baseDate,
    );
    if (candidate) date = isoDate(candidate);
  } else if (normalized.includes("послезавтра")) {
    date = isoDate(addCalendarDays(baseDate, 2));
  } else if (normalized.includes("завтра")) {
    date = isoDate(addCalendarDays(baseDate, 1));
  } else if (normalized.includes("сегодня")) {
    date = isoDate(baseDate);
  } else {
    const weekdayDate = relativeWeekdayDate(normalized, baseDate);
    if (weekdayDate) date = isoDate(weekdayDate);
  }

  let parsedTime = "Время не найдено";
  if (exactTime && Number(exactTime[1]) <= 23) {
    parsedTime = `${pad(exactTime[1])}:${exactTime[2]}`;
  } else if (hourTime && Number(hourTime[1]) <= 23) {
    parsedTime = `${pad(hourTime[1])}:00`;
  } else if (halfTime) {
    parsedTime = `${pad(String(halfHourMap[halfTime[1]]))}:30`;
  }

  const subjectMatch = text.match(
    /(математик\w*|алгоритм\w*|программирован\w*|физик\w*|истори\w*|английск\w*|баз\w* данных)/i,
  );
  const subject = normalized.includes("программирован")
    ? "Программирование"
    : normalized.includes("алгоритм")
      ? "Алгоритмы"
      : normalized.includes("математик")
        ? "Математика"
        : normalized.includes("физик")
          ? "Физика"
          : normalized.includes("истори")
            ? "История"
            : normalized.includes("английск")
              ? "Английский язык"
              : /баз\w* данных/.test(normalized)
                ? "Базы данных"
                : "Предмет не определён";
  const isMoved = /перенос|перенес|теперь|вместо/.test(normalized);
  const isCancelled = /отмен|не будет/.test(normalized);
  const title = isCancelled
    ? `Отмена: ${subject}`
    : isMoved
      ? `Перенос: ${subject}`
      : /лаб|лаборатор/.test(normalized)
        ? `Лабораторная: ${subject}`
        : `Событие: ${subject}`;

  const found = [date !== "Дата не найдена", parsedTime !== "Время не найдено", Boolean(room), Boolean(subjectMatch)];
  const confidence = Math.min(98, 48 + found.filter(Boolean).length * 12);

  return {
    title,
    subject,
    date,
    time: parsedTime,
    room: room?.[1]?.toUpperCase().replace(/\s/g, "-") ?? "Аудитория не найдена",
    confidence,
  };
}
