// POST /api/auth/login — authenticate and create a session.
import { NextRequest, NextResponse } from "next/server";
import { getDb, verifyPassword } from "@/lib/mongo";
import { createSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = body?.username?.trim();
  const password = body?.password;
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ username });
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }
  if (!verifyPassword(password, user.salt as string, user.passwordHash as string)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(
    user.id as string,
    user.username as string,
    user.isAdmin as boolean
  );

  return NextResponse.json({
    token,
    session: {
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      expiresAt,
    },
  });
}
