// GET /api/data/songs/[id] — get a saved song by ID
// DELETE /api/data/songs/[id] — delete a saved song + its state
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { requireAuth } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const db = await getDb();
  const song = await db.collection("songs").findOne({ userId, id });
  if (!song) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { _id, userId: _, ...songData } = song;
  return NextResponse.json({ song: songData });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const db = await getDb();
  await db.collection("songs").deleteOne({ userId, id });
  await db.collection("songStates").deleteOne({ userId, songId: id });

  return NextResponse.json({ ok: true });
}
