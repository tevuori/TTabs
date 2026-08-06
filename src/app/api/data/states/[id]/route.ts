// GET /api/data/states/[id] — get saved state for a song
// PUT /api/data/states/[id] — save state for a song
// DELETE /api/data/states/[id] — delete state for a song
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
  const state = await db.collection("songStates").findOne({ userId, songId: id });
  if (!state) {
    return NextResponse.json({ state: null });
  }
  const { _id, userId: _, songId: __, ...stateData } = state;
  return NextResponse.json({ state: stateData });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const state = await request.json();
  const db = await getDb();
  await db.collection("songStates").updateOne(
    { userId, songId: id },
    { $set: { ...state, userId, songId: id } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
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
  await db.collection("songStates").deleteOne({ userId, songId: id });

  return NextResponse.json({ ok: true });
}
