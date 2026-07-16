import type { InboxItem } from "./types";
import type { TelegramInlineKeyboardMarkup } from "./telegram";
import { buildAgendaText, type BriefingPeriod } from "./briefing";

export type TelegramBotCommand = "start" | "help" | "status" | "events" | "conflicts" | "today" | "week" | "digest" | "trust" | "untrust" | "trusted" | "unknown" | null;
const supportedCommands = ["start", "help", "status", "events", "conflicts", "today", "week", "digest", "trust", "untrust", "trusted"] as const;

export function parseTelegramCommand(text: string): TelegramBotCommand {
  const token = text.trim().split(/\s+/, 1)[0];
  if (!token.startsWith("/")) return null;

  const command = token.slice(1).split("@", 1)[0].toLowerCase();
  if ((supportedCommands as readonly string[]).includes(command)) {
    return command as (typeof supportedCommands)[number];
  }
  return "unknown";
}

export function buildTelegramHelpText(appUrl: string) {
  return [
    "👋 Я превращаю сообщения из чата в проверяемые события.",
    "",
    "Просто пришли сообщение вроде:",
    "Лабу перенесли на 18.09 в 16:20, ауд. Б-304",
    "",
    "Команды:",
    "/events — последние события этого чата",
    "/today — что запланировано сегодня",
    "/week — план на ближайшие 7 дней",
    "/digest — короткая сводка группы",
    "/conflicts — события, где источники не сходятся",
    "/trusted — доверенные преподаватели",
    "/trust @username — назначить преподавателя (только админ)",
    "/untrust @username — снять роль (только админ)",
    "/status — состояние бота и базы",
    "/help — эта подсказка",
    "",
    `Веб-приложение: ${appUrl}`,
  ].join("\n");
}

export function parseTrustedUsername(text: string) {
  const target = text.trim().split(/\s+/)[1]?.replace(/^@/, "").toLowerCase() ?? "";
  return /^[a-z0-9_]{5,32}$/.test(target) ? target : null;
}

export function buildTelegramTrustedText(usernames: string[]) {
  if (usernames.length === 0) {
    return "👤 Доверенных преподавателей пока нет. Администратор чата может добавить: /trust @username";
  }
  return [
    `🎓 Доверенные преподаватели (${usernames.length}):`,
    "",
    ...usernames.map((username) => `• @${username}`),
    "",
    "Их сообщения получают максимальный вес в радаре источников.",
  ].join("\n");
}

export function buildTelegramBriefingText(
  items: InboxItem[],
  period: BriefingPeriod,
  now = new Date(),
) {
  return buildAgendaText(items, period, now);
}

export function buildTelegramStatusText(databaseConfigured: boolean) {
  return [
    "🟢 Бот работает",
    databaseConfigured ? "🟢 PostgreSQL подключён" : "🟡 PostgreSQL не подключён",
    "🟢 Защищённый webhook активен",
  ].join("\n");
}

function formatEventDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function buildTelegramEventsText(items: InboxItem[]) {
  if (items.length === 0) {
    return "📭 В этом чате пока нет сохранённых событий. Пришли сообщение о переносе или отмене пары.";
  }

  const lines = items.slice(0, 5).flatMap((item, index) => [
    `${index + 1}. ${item.status === "confirmed" ? "✅" : item.status === "conflict" ? "⚠️" : "🟡"} ${item.event.title}`,
    `   ${formatEventDate(item.event.date)} · ${item.event.time} · ${item.event.room}`,
  ]);
  return ["📅 События этого чата:", "", ...lines].join("\n");
}

export function buildTelegramConflictsText(items: InboxItem[]) {
  const conflicts = items.filter((item) => item.status === "conflict");
  if (conflicts.length === 0) {
    return "✅ Активных противоречий нет. Все события либо подтверждены, либо ждут обычной проверки.";
  }
  return [
    `⚠️ Противоречия (${conflicts.length}):`,
    "",
    ...conflicts.slice(0, 5).flatMap((item, index) => [
      `${index + 1}. ${item.event.title}`,
      `   ${item.reason}`,
    ]),
    "",
    "Открой приложение, чтобы сравнить источники и исправить поля.",
  ].join("\n");
}

export function buildTelegramEventText(item: InboxItem, stored: boolean) {
  return [
    `${item.status === "conflict" ? "⚠️" : item.event.confidence >= 84 ? "🧩" : "🔎"} Нашёл событие: ${item.event.title}`,
    `📅 Дата: ${formatEventDate(item.event.date)}`,
    `🕐 Время: ${item.event.time}`,
    `🚪 Аудитория: ${item.event.room}`,
    `🎯 Уверенность: ${item.event.confidence}%`,
    ...(item.status === "conflict" ? ["", `Конфликт: ${item.reason}`] : []),
    "",
    stored
      ? "Сохранил вместе с исходным сообщением. Подтверди событие или открой подробности."
      : "База пока недоступна — открой веб-приложение для локальной проверки.",
  ].join("\n");
}

export function buildTelegramDuplicateText(item: InboxItem) {
  return [
    `♻️ Это уже есть: ${item.event.title}`,
    `📅 ${formatEventDate(item.event.date)} · ${item.event.time} · ${item.event.room}`,
    "",
    "Новую карточку не создавал — добавил сообщение как ещё один источник к существующей.",
  ].join("\n");
}

export function buildTelegramEventKeyboard(
  item: InboxItem,
  stored: boolean,
  appUrl: string,
): TelegramInlineKeyboardMarkup {
  const rows: TelegramInlineKeyboardMarkup["inline_keyboard"] = [];
  if (stored) {
    rows.push([{ text: "✅ Подтвердить", callback_data: `confirm:${item.id}` }]);
  }
  rows.push([{ text: "🌐 Открыть приложение", url: appUrl }]);
  return { inline_keyboard: rows };
}

export function parseConfirmCallback(data: string | undefined) {
  if (!data?.startsWith("confirm:")) return null;
  const eventId = data.slice("confirm:".length);
  return eventId.length > 0 && eventId.length <= 54 ? eventId : null;
}
