// DELETE /api/auth/users/[id] — delete a user (admin only)
// PATCH /api/auth/users/[id] — change a user's password (admin only)
import { NextRequest, NextResponse } from "next/server";
import { getDb, hashPassword } from "@/lib/mongo";
import { requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  if (id === "admin") {
    return NextResponse.json({ error: "Cannot delete the admin user" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("users").deleteOne({ id });
  // Also clean up their data
  await db.collection("songs").deleteMany({ userId: id });
  await db.collection("songStates").deleteMany({ userId: id });
  await db.collection("setlists").deleteMany({ userId: id });
  await db.collection("sessions").deleteMany({ userId: id });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const body = await request.json();
  const newPassword = body?.password;
  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  }

  const db = await getDb();
  const { salt, hash } = hashPassword(newPassword);
  await db.collection("users").updateOne(
    { id },
    { $set: { passwordHash: hash, salt } }
  );

  return NextResponse.json({ ok: true });
}
