import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import {
  appendSourceToEvent,
  ensureGroup,
  findGroupById,
  listEvents,
  saveEvent,
  setGroupDailyBrief,
  setGroupTrustedUsername,
  updateEventStatus,
} from "@/db/repository";
import { applyConflictAssessment, assessEventConflict } from "@/lib/conflict-detector";
import { extractEvent } from "@/lib/extract-event";
import {
  buildTelegramEventKeyboard,
  buildTelegramEventText,
  buildTelegramBriefingText,
  buildTelegramConflictsText,
  buildTelegramDuplicateText,
  buildTelegramEventsText,
  buildTelegramHelpText,
  buildTelegramStatusText,
  buildTelegramTrustedText,
  buildWorkspaceEventUrl,
  getTelegramMessagePayload,
  parseConfirmCallback,
  parseTelegramCommand,
  parseTrustedUsername,
} from "@/lib/telegram-bot";
import {
  answerTelegramCallback,
  editTelegramMessageKeyboard,
  getTelegramMemberAccess,
  sendTelegramMessage,
} from "@/lib/telegram";
import type { InboxItem, SourceRole } from "@/lib/types";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id?: string }>;
    voice?: { file_id?: string; duration?: number };
    document?: { file_id?: string; file_name?: string };
    chat?: { id?: number; title?: string; type?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
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

function buildInboxItem(
  update: TelegramUpdate,
  text: string,
  role: SourceRole,
  kind: InboxItem["sources"][number]["kind"],
): InboxItem | null {
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
        role,
        kind,
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
    const workspaceUrl = buildWorkspaceEventUrl(appUrl, group?.accessToken, eventId);
    await Promise.all([
      answerTelegramCallback(callbackId, "Событие подтверждено ✅"),
      editTelegramMessageKeyboard(String(chatId), botMessageId, {
        inline_keyboard: [[{ text: "🌐 Открыть приложение", url: workspaceUrl }]],
      }),
    ]);
    return NextResponse.json({ ok: true, callback: "confirmed", eventId });
  }

  const payload = getTelegramMessagePayload(update.message ?? {});
  const text = payload.text;
  if (!text) {
    const attachment = payload.attachmentLabel;
    if (attachment && update.message?.chat?.id !== undefined) {
      const reply = await sendTelegramMessage(
        String(update.message.chat.id),
        `📝 Добавь подпись к ${attachment}: что произошло, дата, время и аудитория. Тогда я сохраню файл как источник события.`,
        { replyToMessageId: update.message.message_id },
      );
      return NextResponse.json({ ok: true, skipped: "attachment-without-caption", replySent: reply.sent });
    }
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
    } else if (command === "brief_on" || command === "brief_off") {
      const groupId = `telegram:${chatId}`;
      const senderId = update.message?.from?.id;
      try {
        if (senderId === undefined) {
          replyText = "Не удалось проверить права отправителя.";
        } else {
          const privateChat = update.message?.chat?.type === "private";
          const access = privateChat
            ? { verified: true, administrator: true }
            : await getTelegramMemberAccess(String(chatId), senderId);
          if (!access.verified || !access.administrator) {
            replyText = "⛔ В группе управлять сводкой может только администратор Telegram-чата.";
          } else {
            await ensureGroup({
              id: groupId,
              name: update.message?.chat?.title || "Личный Telegram",
              telegramChatId: String(chatId),
            });
            const enabled = command === "brief_on";
            const updated = await setGroupDailyBrief(groupId, enabled);
            replyText = updated
              ? enabled
                ? "☀️ Утренняя сводка включена. Буду писать в 08:00 по Москве, только если есть события или конфликты."
                : "Утренняя сводка отключена. Команды /today и /digest продолжат работать."
              : "Не удалось изменить настройку сводки.";
          }
        }
      } catch {
        replyText = "Не удалось изменить настройку сводки. Попробуй ещё раз позже.";
      }
    } else if (command === "trust" || command === "untrust" || command === "trusted") {
      const groupId = `telegram:${chatId}`;
      try {
        const group = await findGroupById(groupId);
        if (command === "trusted") {
          replyText = buildTelegramTrustedText(group?.trustedUsernames ?? []);
        } else {
          const target = parseTrustedUsername(text);
          const senderId = update.message?.from?.id;
          if (!target) {
            replyText = `Укажи username: /${command} @username`;
          } else if (senderId === undefined) {
            replyText = "Не удалось проверить права отправителя.";
          } else {
            const access = await getTelegramMemberAccess(String(chatId), senderId);
            if (!access.verified || !access.administrator) {
              replyText = "⛔ Эту команду может выполнить только администратор Telegram-чата.";
            } else {
              if (!group) {
                await ensureGroup({
                  id: groupId,
                  name: update.message?.chat?.title || "Telegram",
                  telegramChatId: String(chatId),
                });
              }
              const updated = await setGroupTrustedUsername(groupId, target, command === "trust");
              replyText = command === "trust"
                ? `🎓 @${target} теперь доверенный преподаватель. Новые сообщения получат высокий приоритет.`
                : `Роль преподавателя для @${target} снята.`;
              if (!updated) replyText = "Не удалось обновить список доверия.";
            }
          }
        }
      } catch {
        replyText = "Не удалось обновить роли. Попробуй ещё раз чуть позже.";
      }
    } else {
      try {
        const items = await listEvents(`telegram:${chatId}`);
        if (command === "conflicts") replyText = buildTelegramConflictsText(items);
        else if (command === "today" || command === "week" || command === "digest") {
          replyText = buildTelegramBriefingText(items, command);
        } else replyText = buildTelegramEventsText(items);
      } catch {
        replyText = "Не удалось загрузить события. Попробуй ещё раз чуть позже.";
      }
    }

    const reply = await sendTelegramMessage(String(chatId), replyText, {
      replyToMessageId: messageId,
    });
    return NextResponse.json({ ok: true, command, replySent: reply.sent });
  }

  let sourceRole: SourceRole = "student";
  if (isDatabaseConfigured() && update.message?.from?.id !== undefined) {
    const groupId = `telegram:${chatId}`;
    const [group, access] = await Promise.all([
      findGroupById(groupId).catch(() => null),
      getTelegramMemberAccess(String(chatId), update.message.from.id),
    ]);
    const username = update.message.from.username?.toLowerCase();
    sourceRole = username && group?.trustedUsernames.includes(username)
      ? "teacher"
      : access.role;
  }

  const item = buildInboxItem(update, text, sourceRole, payload.kind);
  if (!item) {
    return NextResponse.json({ ok: true, skipped: "missing-identifiers" });
  }

  let stored = false;
  let merged = false;
  let storedItem = item;
  let workspaceToken: string | null = null;
  if (isDatabaseConfigured()) {
    const groupId = `telegram:${chatId}`;
    try {
      const existing = await listEvents(groupId);
      const assessment = assessEventConflict(item, existing);
      let group;
      if (assessment.kind === "duplicate") {
        const matched = existing.find((candidate) => candidate.id === assessment.matchedId);
        if (!matched) throw new Error("MATCHED_EVENT_NOT_FOUND");
        await appendSourceToEvent(matched.id, item.sources[0], groupId);
        storedItem = { ...matched, sources: [...matched.sources, item.sources[0]] };
        merged = true;
        group = await findGroupById(groupId);
      } else {
        storedItem = applyConflictAssessment(item, assessment);
        group = await saveEvent(storedItem, groupId, {
          name: update.message?.chat?.title || "Telegram",
          telegramChatId: String(chatId),
        });
      }
      stored = true;
      workspaceToken = group?.accessToken ?? null;
    } catch {
      return NextResponse.json({ ok: false, code: "DATABASE_WRITE_FAILED" }, { status: 500 });
    }
  }

  const reply = await sendTelegramMessage(
    String(chatId),
    merged ? buildTelegramDuplicateText(storedItem) : buildTelegramEventText(storedItem, stored),
    {
      replyToMessageId: messageId,
      replyMarkup: buildTelegramEventKeyboard(
        storedItem,
        stored,
        buildWorkspaceEventUrl(appUrl, workspaceToken, storedItem.id),
      ),
    },
  );

  return NextResponse.json({
    ok: true,
    accepted: {
      id: storedItem.id,
      stored,
      merged,
      status: storedItem.status,
      confidence: storedItem.event.confidence,
    },
    replySent: reply.sent,
  });
}
