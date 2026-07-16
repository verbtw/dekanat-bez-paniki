import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { listDailyBriefGroups, listEvents } from "@/db/repository";
import { buildScheduledBriefText } from "@/lib/briefing";
import { sendTelegramMessage } from "@/lib/telegram";

export const maxDuration = 60;

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET?.trim()
    || process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expectedSecret || request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const groups = await listDailyBriefGroups();
    const results = await Promise.all(groups.map(async (group) => {
      if (!group.telegramChatId) return "skipped" as const;
      const items = await listEvents(group.id);
      const text = buildScheduledBriefText(items);
      if (!text) return "empty" as const;
      const result = await sendTelegramMessage(group.telegramChatId, text);
      return result.sent ? "sent" as const : "failed" as const;
    }));

    return NextResponse.json({
      ok: true,
      groups: groups.length,
      sent: results.filter((result) => result === "sent").length,
      empty: results.filter((result) => result === "empty").length,
      failed: results.filter((result) => result === "failed").length,
    });
  } catch {
    return NextResponse.json({ ok: false, code: "DAILY_BRIEF_FAILED" }, { status: 500 });
  }
}
