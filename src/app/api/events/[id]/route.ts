import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { demoGroupId, findGroupByAccessToken, updateEventStatus } from "@/db/repository";
import { reviewStatusSchema } from "@/lib/event-validation";

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
  const parsed = reviewStatusSchema.safeParse(
    typeof body === "object" && body !== null && "status" in body ? body.status : null,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректный статус.", code: "VALIDATION_FAILED" },
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
    const updated = await updateEventStatus(id, parsed.data, group?.id ?? demoGroupId);
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
