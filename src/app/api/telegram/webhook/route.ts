import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { saveEvent } from "@/db/repository";
import { extractEvent } from "@/lib/extract-event";
import { sendTelegramMessage } from "@/lib/telegram";
import type { InboxItem } from "@/lib/types";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id?: number; title?: string; type?: string };
    from?: { first_name?: string; last_name?: string; username?: string };
  };
};

function buildInboxItem(update: TelegramUpdate, text: string): InboxItem | null {
  const message = update.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!message || chatId === undefined || messageId === undefined) return null;

  const extracted = extractEvent(text, new Date());
  const confidence = extracted.confidence;
  const author =
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
    message.from?.username ||
    "Участник чата";
  const received = message.date ? new Date(message.date * 1_000) : new Date();

  return {
    id: `tg:${chatId}:${messageId}`,
    status: confidence >= 84 ? "review" : "conflict",
    receivedAt: new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }).format(received),
    event: extracted,
    reason:
      confidence >= 84
        ? "Сообщение Telegram распознано. Нужна проверка перед публикацией."
        : "Не все поля найдены в сообщении Telegram. Нужна ручная проверка.",
    sources: [
      {
        id: `tg-source:${chatId}:${messageId}`,
        author,
        role: "student",
        kind: "message",
        text,
        time: new Intl.DateTimeFormat("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Moscow",
        }).format(received),
        chat: message.chat?.title || "Личный чат с ботом",
      },
    ],
  };
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const text = update?.message?.text?.trim();
  if (!update || !text) {
    return NextResponse.json({ ok: true, skipped: "unsupported-message" });
  }

  const item = buildInboxItem(update, text);
  const chatId = update.message?.chat?.id;
  if (!item || chatId === undefined) {
    return NextResponse.json({ ok: true, skipped: "missing-identifiers" });
  }

  let stored = false;
  if (isDatabaseConfigured()) {
    const groupId = `telegram:${chatId}`;
    try {
      await saveEvent(item, groupId, {
        name: update.message?.chat?.title || "Telegram",
        telegramChatId: String(chatId),
      });
      stored = true;
    } catch {
      return NextResponse.json({ ok: false, code: "DATABASE_WRITE_FAILED" }, { status: 500 });
    }
  }

  const reply = await sendTelegramMessage(
    String(chatId),
    [
      `Нашёл событие: ${item.event.title}`,
      `Дата: ${item.event.date}`,
      `Время: ${item.event.time}`,
      `Аудитория: ${item.event.room}`,
      stored ? "Сохранил для проверки." : "База пока не подключена — открой веб-приложение для локальной проверки.",
    ].join("\n"),
  );

  return NextResponse.json({
    ok: true,
    accepted: { id: item.id, stored, confidence: item.event.confidence },
    replySent: reply.sent,
  });
}
