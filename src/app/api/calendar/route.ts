import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { demoGroupId, findGroupByAccessToken, listEvents } from "@/db/repository";
import { buildGroupCalendar } from "@/lib/calendar";

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
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Календарь временно недоступен.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const workspace = request.nextUrl.searchParams.get("workspace")?.trim() ?? "";
  try {
    const group = workspace ? await findGroupByAccessToken(workspace) : null;
    if (workspace && !group) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }

    const groupId = group?.id ?? demoGroupId;
    const groupName = group?.name ?? "ИВТ-101 · демо";
    const items = await listEvents(groupId);
    const calendar = buildGroupCalendar(items, `${groupName} · Деканат без паники`);

    return new NextResponse(calendar, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="${safeFilename(groupName)}"`,
        "cache-control": "private, max-age=60, stale-while-revalidate=300",
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
