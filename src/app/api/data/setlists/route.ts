// GET /api/data/setlists — get all setlists for the current user
// POST /api/data/setlists — create a new setlist
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
  const setlists = await db.collection("setlists").find({ userId }).toArray();
  const result = setlists
    .map(({ _id, userId: _, ...sl }) => sl)
    .sort((a: { updatedAt?: number }, b: { updatedAt?: number }) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return NextResponse.json({ setlists: result });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const body = await request.json();
  const name = body?.name?.trim() || "Untitled setlist";
  const now = Date.now();
  const id = `setlist-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const setlist = {
    id,
    name,
    songIds: [] as string[],
    userId,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  await db.collection("setlists").insertOne(setlist);

  return NextResponse.json({
    setlist: {
      id: setlist.id,
      name: setlist.name,
      songIds: setlist.songIds,
      userId: setlist.userId,
      createdAt: setlist.createdAt,
      updatedAt: setlist.updatedAt,
    },
  });
}
