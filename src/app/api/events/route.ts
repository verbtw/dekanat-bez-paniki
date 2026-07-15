import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, isDatabaseConfigured } from "@/db/client";
import { demoGroupId, listEvents, saveEvent } from "@/db/repository";
import { inboxItemSchema } from "@/lib/event-validation";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ mode: "local", items: [] });
  }

  const groupId = request.nextUrl.searchParams.get("groupId")?.trim() || demoGroupId;
  try {
    const items = await listEvents(groupId);
    return NextResponse.json({ mode: "database", items });
  } catch {
    return NextResponse.json(
      { error: "Не удалось прочитать события из базы.", code: "DATABASE_READ_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "PostgreSQL ещё не подключён.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = inboxItemSchema.safeParse(
    typeof body === "object" && body !== null && "item" in body ? body.item : body,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректное событие.", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }

  const groupId =
    typeof body === "object" && body !== null && "groupId" in body && typeof body.groupId === "string"
      ? body.groupId.trim() || demoGroupId
      : demoGroupId;

  try {
    await saveEvent(parsed.data, groupId);
    return NextResponse.json({ saved: true, item: parsed.data }, { status: 201 });
  } catch (error) {
    const notConfigured = error instanceof DatabaseNotConfiguredError;
    return NextResponse.json(
      {
        error: notConfigured ? "PostgreSQL ещё не подключён." : "Не удалось сохранить событие.",
        code: notConfigured ? "DATABASE_NOT_CONFIGURED" : "DATABASE_WRITE_FAILED",
      },
      { status: notConfigured ? 503 : 500 },
    );
  }
}
