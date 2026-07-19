import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, isDatabaseConfigured } from "@/db/client";
import {
  appendSourceToEvent,
  listEvents,
  RepositoryOwnershipError,
  saveEvent,
} from "@/db/repository";
import { requireWorkspaceAccess } from "@/lib/auth/workspace-guard";
import { applyConflictAssessment, assessEventConflict } from "@/lib/conflict-detector";
import { demoItems } from "@/lib/demo-data";
import { inboxItemSchema } from "@/lib/event-validation";
import { HttpError, toErrorResponse } from "@/lib/http-error";

export async function GET(request: NextRequest) {
  const groupId = request.nextUrl.searchParams.get("groupId")?.trim() ?? "";
  if (!groupId) {
    return NextResponse.json(
      { mode: "local", items: demoItems, workspace: { name: "ИВТ-101 · демо" } },
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "PostgreSQL ещё не подключён.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  try {
    const { membership } = await requireWorkspaceAccess(groupId);
    const items = await listEvents(groupId);
    return NextResponse.json(
      { mode: "database", items, workspace: { id: groupId, name: membership.group.name } },
      { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } },
    );
  } catch (error) {
    return toErrorResponse(error);
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
  const groupId =
    typeof body === "object" && body !== null && "groupId" in body && typeof body.groupId === "string"
      ? body.groupId.trim()
      : "";
  if (!groupId) {
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
    await requireWorkspaceAccess(groupId);
    const existing = await listEvents(groupId);
    const assessment = assessEventConflict(parsed.data, existing);
    if (assessment.kind === "duplicate") {
      await appendSourceToEvent(assessment.matchedId, parsed.data.sources[0], groupId);
      return NextResponse.json({ saved: true, merged: true, itemId: assessment.matchedId, assessment });
    }
    const item = applyConflictAssessment(parsed.data, assessment);
    await saveEvent(item, groupId);
    return NextResponse.json({ saved: true, item, assessment }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) return toErrorResponse(error);
    const notConfigured = error instanceof DatabaseNotConfiguredError;
    const ownershipConflict = error instanceof RepositoryOwnershipError;
    return NextResponse.json(
      {
        error: notConfigured
          ? "PostgreSQL ещё не подключён."
          : ownershipConflict
            ? "Идентификатор уже принадлежит другому рабочему пространству."
            : "Не удалось сохранить событие.",
        code: notConfigured
          ? "DATABASE_NOT_CONFIGURED"
          : ownershipConflict
            ? "RESOURCE_OWNERSHIP_CONFLICT"
            : "DATABASE_WRITE_FAILED",
      },
      { status: notConfigured ? 503 : ownershipConflict ? 409 : 500 },
    );
  }
}
