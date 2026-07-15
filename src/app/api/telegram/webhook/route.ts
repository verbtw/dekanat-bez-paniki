import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { findGroupById, listEvents, saveEvent, updateEventStatus } from "@/db/repository";
import { extractEvent } from "@/lib/extract-event";
import {
  buildTelegramEventKeyboard,
  buildTelegramEventText,
  buildTelegramEventsText,
  buildTelegramHelpText,
  buildTelegramStatusText,
  parseConfirmCallback,
  parseTelegramCommand,
} from "@/lib/telegram-bot";
import {
  answerTelegramCallback,
  editTelegramMessageKeyboard,
  sendTelegramMessage,
} from "@/lib/telegram";
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
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      message_id?: number;
      chat?: { id?: number; title?: string; type?: string };
    };
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
  if (!update) {
    return NextResponse.json({ ok: true, skipped: "invalid-update" });
  }

  const callback = update.callback_query;
  if (callback) {
    const callbackId = callback.id;
    const chatId = callback.message?.chat?.id;
    const botMessageId = callback.message?.message_id;
    const eventId = parseConfirmCallback(callback.data);
    if (!callbackId || chatId === undefined || botMessageId === undefined || !eventId) {
      if (callbackId) await answerTelegramCallback(callbackId, "Не удалось распознать действие.");
      return NextResponse.json({ ok: true, skipped: "invalid-callback" });
    }

    if (!eventId.startsWith(`tg:${chatId}:`)) {
      await answerTelegramCallback(callbackId, "Это событие относится к другому чату.");
      return NextResponse.json({ ok: true, skipped: "callback-chat-mismatch" });
    }

    const groupId = `telegram:${chatId}`;
    const updated = isDatabaseConfigured()
      ? await updateEventStatus(eventId, "confirmed", groupId).catch(() => null)
      : null;
    if (!updated) {
      await answerTelegramCallback(callbackId, "Событие не найдено или база недоступна.");
      return NextResponse.json({ ok: true, callback: "not-found" });
    }

    const appUrl = process.env.APP_URL?.trim() || "https://dekanat-bez-paniki.vercel.app";
    const group = await findGroupById(groupId).catch(() => null);
    const workspaceUrl = group
      ? `${appUrl}?workspace=${encodeURIComponent(group.accessToken)}`
      : appUrl;
    await Promise.all([
      answerTelegramCallback(callbackId, "Событие подтверждено ✅"),
      editTelegramMessageKeyboard(String(chatId), botMessageId, {
        inline_keyboard: [[{ text: "🌐 Открыть приложение", url: workspaceUrl }]],
      }),
    ]);
    return NextResponse.json({ ok: true, callback: "confirmed", eventId });
  }

  const text = update?.message?.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: true, skipped: "unsupported-message" });
  }

  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;
  if (chatId === undefined) {
    return NextResponse.json({ ok: true, skipped: "missing-identifiers" });
  }

  const appUrl = process.env.APP_URL?.trim() || "https://dekanat-bez-paniki.vercel.app";
  const command = parseTelegramCommand(text);
  if (command) {
    let replyText: string;
    if (command === "start" || command === "help" || command === "unknown") {
      replyText = buildTelegramHelpText(appUrl);
    } else if (command === "status") {
      replyText = buildTelegramStatusText(isDatabaseConfigured());
    } else if (!isDatabaseConfigured()) {
      replyText = "🟡 База пока не подключена, список событий недоступен.";
    } else {
      try {
        replyText = buildTelegramEventsText(await listEvents(`telegram:${chatId}`));
      } catch {
        replyText = "Не удалось загрузить события. Попробуй ещё раз чуть позже.";
      }
    }

    const reply = await sendTelegramMessage(String(chatId), replyText, {
      replyToMessageId: messageId,
    });
    return NextResponse.json({ ok: true, command, replySent: reply.sent });
  }

  const item = buildInboxItem(update, text);
  if (!item) {
    return NextResponse.json({ ok: true, skipped: "missing-identifiers" });
  }

  let stored = false;
  let workspaceToken: string | null = null;
  if (isDatabaseConfigured()) {
    const groupId = `telegram:${chatId}`;
    try {
      const group = await saveEvent(item, groupId, {
        name: update.message?.chat?.title || "Telegram",
        telegramChatId: String(chatId),
      });
      stored = true;
      workspaceToken = group.accessToken;
    } catch {
      return NextResponse.json({ ok: false, code: "DATABASE_WRITE_FAILED" }, { status: 500 });
    }
  }

  const reply = await sendTelegramMessage(
    String(chatId),
    buildTelegramEventText(item, stored),
    {
      replyToMessageId: messageId,
      replyMarkup: buildTelegramEventKeyboard(
        item,
        stored,
        workspaceToken ? `${appUrl}?workspace=${encodeURIComponent(workspaceToken)}` : appUrl,
      ),
    },
  );

  return NextResponse.json({
    ok: true,
    accepted: { id: item.id, stored, confidence: item.event.confidence },
    replySent: reply.sent,
  });
}
