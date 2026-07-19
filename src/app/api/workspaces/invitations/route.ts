import { NextRequest, NextResponse } from "next/server";
import { createInvitation } from "@/db/workspace-repository";
import { invitationSchema } from "@/lib/auth/validation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace-guard";
import { toErrorResponse } from "@/lib/http-error";

export async function POST(request: NextRequest) {
  const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректное приглашение.", code: "VALIDATION_FAILED" }, { status: 400 });
  }
  try {
    const { user } = await requireWorkspaceAccess(parsed.data.groupId, "admin");
    const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000);
    const invitation = await createInvitation({
      groupId: parsed.data.groupId,
      createdByUserId: user.id,
      role: parsed.data.role,
      expiresAt,
    });
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
