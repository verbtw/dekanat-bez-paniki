import { NextRequest, NextResponse } from "next/server";
import { extractEvent } from "@/lib/extract-event";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const text =
    typeof body === "object" && body !== null && "text" in body && typeof body.text === "string"
      ? body.text.trim()
      : "";

  if (!text) {
    return NextResponse.json(
      { error: "Передайте непустое поле text." },
      { status: 400 },
    );
  }

  if (text.length > 4_000) {
    return NextResponse.json(
      { error: "Сообщение не должно быть длиннее 4000 символов." },
      { status: 413 },
    );
  }

  return NextResponse.json({ event: extractEvent(text) });
}
