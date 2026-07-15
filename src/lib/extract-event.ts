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

function pad(value: string) {
  return value.padStart(2, "0");
}

export function extractEvent(text: string, now = new Date("2026-09-14T12:00:00")): ExtractedEvent {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  const numericDate = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  const wordDate = normalized.match(
    /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/,
  );
  // Для времени принимаем двоеточие: точка чаще является частью даты 18.09.
  const time = normalized.match(/\b(?:в\s*)?(\d{1,2}):(\d{2})\b/);
  const room = normalized.match(
    /(?:ауд(?:итория)?\.?|каб(?:инет)?\.?)\s*[-№#]?\s*([а-яa-z]?(?:[-\s])?\d{2,4}[а-яa-z]?)/i,
  );

  let date = "Дата не найдена";
  if (numericDate) {
    const year = numericDate[3]
      ? numericDate[3].length === 2
        ? `20${numericDate[3]}`
        : numericDate[3]
      : String(now.getFullYear());
    date = `${year}-${pad(numericDate[2])}-${pad(numericDate[1])}`;
  } else if (wordDate) {
    date = `${now.getFullYear()}-${monthMap[wordDate[2]]}-${pad(wordDate[1])}`;
  } else if (normalized.includes("завтра")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    date = tomorrow.toISOString().slice(0, 10);
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

  const found = [date !== "Дата не найдена", Boolean(time), Boolean(room), Boolean(subjectMatch)];
  const confidence = Math.min(98, 48 + found.filter(Boolean).length * 12);

  return {
    title,
    subject,
    date,
    time: time ? `${pad(time[1])}:${time[2]}` : "Время не найдено",
    room: room?.[1]?.toUpperCase().replace(/\s/g, "-") ?? "Аудитория не найдена",
    confidence,
  };
}
