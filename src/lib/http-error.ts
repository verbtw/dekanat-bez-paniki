import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.publicMessage, code: error.code },
      { status: error.status },
    );
  }
  if (
    error instanceof Error &&
    (error.message === "CLAIM_UNAVAILABLE" || error.message === "INVALID_INVITATION")
  ) {
    return NextResponse.json(
      { error: "Ссылка недействительна или уже недоступна.", code: "INVALID_LINK" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Не удалось выполнить запрос.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
