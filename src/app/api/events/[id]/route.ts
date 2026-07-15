import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { updateEventStatus } from "@/db/repository";
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
    const updated = await updateEventStatus(id, parsed.data);
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
