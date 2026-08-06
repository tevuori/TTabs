// POST /api/auth/logout — delete the current session.
import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    await deleteSession(token);
  }
  return NextResponse.json({ ok: true });
}
