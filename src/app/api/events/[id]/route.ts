import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import {
  deleteEvent,
  findGroupByAccessToken,
  updateEventFields,
  updateEventStatus,
} from "@/db/repository";
import { editableEventSchema, reviewStatusSchema } from "@/lib/event-validation";

async function resolveGroupId(workspace: string) {
  const group = await findGroupByAccessToken(workspace);
  return { groupId: group?.id ?? "", found: Boolean(group) };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "PostgreSQL ещё не подключён.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const objectBody = typeof body === "object" && body !== null ? body : {};
  const parsedStatus = reviewStatusSchema.safeParse("status" in objectBody ? objectBody.status : null);
  const parsedEvent = editableEventSchema.safeParse("event" in objectBody ? objectBody.event : null);
  if (!parsedStatus.success && !parsedEvent.success) {
    return NextResponse.json(
      { error: "Некорректные данные события.", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }

  try {
    const workspace =
      typeof body === "object" && body !== null && "workspace" in body && typeof body.workspace === "string"
        ? body.workspace.trim()
        : "";
    if (!workspace) {
      return NextResponse.json(
        { error: "Публичное демо изменяется только локально.", code: "WORKSPACE_REQUIRED" },
        { status: 403 },
      );
    }
    const { groupId, found } = await resolveGroupId(workspace);
    if (!found) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const updated = parsedEvent.success
      ? await updateEventFields(id, parsedEvent.data, groupId)
      : await updateEventStatus(id, parsedStatus.data!, groupId);
    if (!updated) {
      return NextResponse.json({ error: "Событие не найдено." }, { status: 404 });
    }
    return NextResponse.json({ updated });
  } catch {
    return NextResponse.json(
      { error: "Не удалось обновить событие.", code: "DATABASE_WRITE_FAILED" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "PostgreSQL ещё не подключён.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const workspace = request.nextUrl.searchParams.get("workspace")?.trim() ?? "";
  if (!workspace) {
    return NextResponse.json(
      { error: "Публичное демо изменяется только локально.", code: "WORKSPACE_REQUIRED" },
      { status: 403 },
    );
  }
  try {
    const { groupId, found } = await resolveGroupId(workspace);
    if (!found) {
      return NextResponse.json(
        { error: "Рабочее пространство не найдено.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const deleted = await deleteEvent(id, groupId);
    if (!deleted) return NextResponse.json({ error: "Событие не найдено." }, { status: 404 });
    return NextResponse.json({ deleted: true, id });
  } catch {
    return NextResponse.json(
      { error: "Не удалось удалить событие.", code: "DATABASE_WRITE_FAILED" },
      { status: 500 },
    );
  }
}
