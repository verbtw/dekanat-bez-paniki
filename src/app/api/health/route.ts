import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db/client";
import { isTelegramConfigured } from "@/lib/telegram";

export function GET() {
  return NextResponse.json({
    ok: true,
    storage: isDatabaseConfigured() ? "postgresql" : "local-browser",
    telegram: isTelegramConfigured() ? "configured" : "waiting-for-token",
    timestamp: new Date().toISOString(),
  });
}
