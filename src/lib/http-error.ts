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
  return NextResponse.json(
    { error: "Не удалось выполнить запрос.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
