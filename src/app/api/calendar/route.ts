import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import {
  findGroupByCalendarToken,
  findGroupByLegacyCalendarToken,
  listEvents,
} from "@/db/repository";
import { buildGroupCalendar } from "@/lib/calendar";
import { demoItems } from "@/lib/demo-data";

function safeFilename(name: string) {
  const normalized = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${normalized || "group"}.ics`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const legacyToken = request.nextUrl.searchParams.get("workspace")?.trim() ?? "";
  if (!token && !legacyToken) {
    return new NextResponse(buildGroupCalendar(demoItems, "ИВТ-101 · демо"), {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": "inline; filename=demo-calendar.ics",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Календарь временно недоступен.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  try {
    const group = token
      ? await findGroupByCalendarToken(token)
      : await findGroupByLegacyCalendarToken(legacyToken);
    if (!group) {
      return NextResponse.json(
        { error: "Календарь не найден.", code: "CALENDAR_NOT_FOUND" },
        { status: 404 },
      );
    }
    const items = await listEvents(group.id);
    return new NextResponse(buildGroupCalendar(items, `${group.name} · Morrow`), {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="${safeFilename(group.name)}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Не удалось собрать календарь.", code: "CALENDAR_BUILD_FAILED" },
      { status: 500 },
    );
  }
}
