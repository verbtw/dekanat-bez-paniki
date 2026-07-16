import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, isDatabaseConfigured } from "@/db/client";
import {
  appendSourceToEvent,
  demoGroupId,
  findGroupByAccessToken,
  listEvents,
  saveEvent,
} from "@/db/repository";
import { applyConflictAssessment, assessEventConflict } from "@/lib/conflict-detector";
import { inboxItemSchema } from "@/lib/event-validation";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ mode: "local", items: [] });
  }

  const workspace = request.nextUrl.searchParams.get("workspace")?.trim();
  try {
    const group = workspace ? await findGroupByAccessToken(workspace) : null;
    if (workspace && !group) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const groupId = group?.id ?? demoGroupId;
    const items = await listEvents(groupId);
    return NextResponse.json({
      mode: "database",
      items,
      workspace: group ? { name: group.name } : { name: "ИВТ-101 · демо" },
    });
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

  try {
    const workspace =
      typeof body === "object" && body !== null && "workspace" in body && typeof body.workspace === "string"
        ? body.workspace.trim()
        : "";
    const group = workspace ? await findGroupByAccessToken(workspace) : null;
    if (workspace && !group) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const groupId = group?.id ?? demoGroupId;
    const existing = await listEvents(groupId);
    const assessment = assessEventConflict(parsed.data, existing);
    if (assessment.kind === "duplicate") {
      await appendSourceToEvent(assessment.matchedId, parsed.data.sources[0], groupId);
      return NextResponse.json({
        saved: true,
        merged: true,
        itemId: assessment.matchedId,
        assessment,
      });
    }
    const item = applyConflictAssessment(parsed.data, assessment);
    await saveEvent(item, groupId);
    return NextResponse.json({ saved: true, item, assessment }, { status: 201 });
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
