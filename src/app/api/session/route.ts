import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await auth.getSession();
  const user = data?.user;

  return NextResponse.json(
    {
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        : null,
    },
    {
      headers: {
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}
