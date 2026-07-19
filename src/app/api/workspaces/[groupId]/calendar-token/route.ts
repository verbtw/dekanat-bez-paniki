import { NextResponse } from "next/server";
import { rotateCalendarToken } from "@/db/workspace-repository";
import { requireWorkspaceAccess } from "@/lib/auth/workspace-guard";
import { toErrorResponse } from "@/lib/http-error";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  try {
    const { user } = await requireWorkspaceAccess(groupId, "admin");
    const calendar = await rotateCalendarToken({ groupId, actorUserId: user.id });
    return NextResponse.json({ calendar });
  } catch (error) {
    return toErrorResponse(error);
  }
}
