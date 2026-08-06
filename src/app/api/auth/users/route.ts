// GET /api/auth/users — list all users (admin only)
// POST /api/auth/users — add a new user (admin only)
import { NextRequest, NextResponse } from "next/server";
import { getDb, hashPassword } from "@/lib/mongo";
import { requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  const db = await getDb();
  const users = await db.collection("users").find({}).toArray();
  return NextResponse.json({
    users: users.map(u => ({
      id: u.id,
      username: u.username,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const username = body?.username?.trim();
  const password = body?.password;
  const isAdmin = !!body?.isAdmin;
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.collection("users").findOne({ username });
  if (existing) {
    return NextResponse.json({ error: `Username "${username}" already exists` }, { status: 409 });
  }

  const { salt, hash } = hashPassword(password);
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.collection("users").insertOne({
    id,
    username,
    passwordHash: hash,
    salt,
    isAdmin,
    createdAt: Date.now(),
  });

  return NextResponse.json({ id, username, isAdmin, createdAt: Date.now() });
}
