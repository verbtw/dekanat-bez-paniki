import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, isDatabaseConfigured } from "@/db/client";
import {
  appendSourceToEvent,
  findGroupByAccessToken,
  listEvents,
  saveEvent,
} from "@/db/repository";
import { applyConflictAssessment, assessEventConflict } from "@/lib/conflict-detector";
import { inboxItemSchema } from "@/lib/event-validation";
import { demoItems } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  const workspace = request.nextUrl.searchParams.get("workspace")?.trim() ?? "";
  if (!workspace) {
    return NextResponse.json({
      mode: "local",
      items: demoItems,
      workspace: { name: "ИВТ-101 · демо" },
    });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ mode: "local", items: [] });
  }

  try {
    const group = await findGroupByAccessToken(workspace);
    if (!group) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const items = await listEvents(group.id);
    return NextResponse.json({
      mode: "database",
      items,
      workspace: { name: group.name },
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
  const workspace =
    typeof body === "object" && body !== null && "workspace" in body && typeof body.workspace === "string"
      ? body.workspace.trim()
      : "";
  if (!workspace) {
    return NextResponse.json(
      { error: "Публичное демо сохраняется только на устройстве.", code: "WORKSPACE_REQUIRED" },
      { status: 403 },
    );
  }
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
    const group = await findGroupByAccessToken(workspace);
    if (!group) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const existing = await listEvents(group.id);
    const assessment = assessEventConflict(parsed.data, existing);
    if (assessment.kind === "duplicate") {
      await appendSourceToEvent(assessment.matchedId, parsed.data.sources[0], group.id);
      return NextResponse.json({
        saved: true,
        merged: true,
        itemId: assessment.matchedId,
        assessment,
      });
    }
    const item = applyConflictAssessment(parsed.data, assessment);
    await saveEvent(item, group.id);
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
