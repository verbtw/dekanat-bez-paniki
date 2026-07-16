export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
};

type TelegramCallResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "telegram-error" | "network-error" };

export type TelegramMemberAccess = {
  verified: boolean;
  administrator: boolean;
  role: "group-lead" | "student";
};

async function callTelegram(method: string, body: Record<string, unknown>): Promise<TelegramCallResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { sent: false as const, reason: "not-configured" as const };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return { sent: false as const, reason: "telegram-error" as const };
    }

    return { sent: true as const };
  } catch {
    return { sent: false as const, reason: "network-error" as const };
  }
}

export async function getTelegramMemberAccess(
  chatId: string,
  userId: number,
): Promise<TelegramMemberAccess> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { verified: false, administrator: false, role: "student" };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { verified: false, administrator: false, role: "student" };
    const data = (await response.json()) as {
      ok?: boolean;
      result?: { status?: string };
    };
    if (!data.ok || !data.result?.status) {
      return { verified: false, administrator: false, role: "student" };
    }
    const administrator = data.result.status === "creator" || data.result.status === "administrator";
    return {
      verified: true,
      administrator,
      role: administrator ? "group-lead" : "student",
    };
  } catch {
    return { verified: false, administrator: false, role: "student" };
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: {
    replyMarkup?: TelegramInlineKeyboardMarkup;
    replyToMessageId?: number;
  },
) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    ...(options?.replyToMessageId ? { reply_parameters: { message_id: options.replyToMessageId } } : {}),
  });
}

export async function answerTelegramCallback(callbackQueryId: string, text: string) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function editTelegramMessageKeyboard(
  chatId: string,
  messageId: number,
  replyMarkup: TelegramInlineKeyboardMarkup,
) {
  return callTelegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}
