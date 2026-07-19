import { NextRequest, NextResponse } from "next/server";
import { acceptInvitation } from "@/db/workspace-repository";
import { credentialSchema } from "@/lib/auth/validation";
import { requireUser } from "@/lib/auth/workspace-guard";
import { toErrorResponse } from "@/lib/http-error";

export async function POST(request: NextRequest) {
  const parsed = credentialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ссылка недействительна.", code: "INVALID_LINK" }, { status: 400 });
  }
  try {
    const user = await requireUser();
    const workspace = await acceptInvitation({ userId: user.id, token: parsed.data.token });
    return NextResponse.json({ workspace });
  } catch (error) {
    return toErrorResponse(error);
  }
}
