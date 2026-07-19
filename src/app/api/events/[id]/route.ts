import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { deleteEvent, updateEventFields, updateEventStatus } from "@/db/repository";
import { requireWorkspaceAccess } from "@/lib/auth/workspace-guard";
import { editableEventSchema, reviewStatusSchema } from "@/lib/event-validation";
import { HttpError, toErrorResponse } from "@/lib/http-error";

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
  const groupId = "groupId" in objectBody && typeof objectBody.groupId === "string" ? objectBody.groupId.trim() : "";
  const parsedStatus = reviewStatusSchema.safeParse("status" in objectBody ? objectBody.status : null);
  const parsedEvent = editableEventSchema.safeParse("event" in objectBody ? objectBody.event : null);
  if (!groupId || (!parsedStatus.success && !parsedEvent.success)) {
    return NextResponse.json(
      { error: "Некорректные данные события.", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }
  try {
    await requireWorkspaceAccess(groupId);
    const updated = parsedEvent.success
      ? await updateEventFields(id, parsedEvent.data, groupId)
      : await updateEventStatus(id, parsedStatus.data!, groupId);
    if (!updated) return NextResponse.json({ error: "Событие не найдено.", code: "NOT_FOUND" }, { status: 404 });
    if ("blocked" in updated) {
      return NextResponse.json(
        { error: "Конфликт нельзя закрыть до исправления полей.", code: updated.blocked },
        { status: 409 },
      );
    }
    return NextResponse.json({ updated });
  } catch (error) {
    if (error instanceof HttpError) return toErrorResponse(error);
    return NextResponse.json({ error: "Не удалось обновить событие.", code: "DATABASE_WRITE_FAILED" }, { status: 500 });
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
  const groupId = request.nextUrl.searchParams.get("groupId")?.trim() ?? "";
  if (!groupId) {
    return NextResponse.json({ error: "Рабочее пространство не указано.", code: "WORKSPACE_REQUIRED" }, { status: 400 });
  }
  try {
    await requireWorkspaceAccess(groupId);
    const deleted = await deleteEvent(id, groupId);
    if (!deleted) return NextResponse.json({ error: "Событие не найдено.", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    if (error instanceof HttpError) return toErrorResponse(error);
    return NextResponse.json({ error: "Не удалось удалить событие.", code: "DATABASE_WRITE_FAILED" }, { status: 500 });
  }
}
