// GET /api/data/songs — get all songs for the current user
// POST /api/data/songs — save (upsert) a song for the current user
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { requireAuth } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const db = await getDb();
  const songs = await db.collection("songs").find({ userId }).toArray();
  // Strip MongoDB _id and internal fields, return as SongTab objects.
  const result = songs
    .map(({ _id, userId: _, ...song }) => song)
    .sort((a: { savedAt?: number }, b: { savedAt?: number }) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  return NextResponse.json({ songs: result });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const song = await request.json();
  if (!song?.id) {
    return NextResponse.json({ error: "Song ID is required" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("songs").updateOne(
    { userId, id: song.id },
    { $set: { ...song, userId } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
