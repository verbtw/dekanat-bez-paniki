import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspace,
  ensureUserProfile,
  listUserWorkspaces,
} from "@/db/workspace-repository";
import { createWorkspaceSchema } from "@/lib/auth/validation";
import { requireUser } from "@/lib/auth/workspace-guard";
import { toErrorResponse } from "@/lib/http-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    await ensureUserProfile(user);
    const workspaces = await listUserWorkspaces(user.id);
    return NextResponse.json({ workspaces }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Название должно содержать от 2 до 80 символов.", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }
  try {
    const user = await requireUser();
    await ensureUserProfile(user);
    const workspace = await createWorkspace({ userId: user.id, name: parsed.data.name });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
