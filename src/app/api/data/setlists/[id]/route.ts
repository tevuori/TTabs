// GET /api/data/setlists/[id] — get a setlist
// PATCH /api/data/setlists/[id] — update a setlist (rename, add/remove/reorder songs)
// DELETE /api/data/setlists/[id] — delete a setlist
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
  const setlist = await db.collection("setlists").findOne({ userId, id });
  if (!setlist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { _id, userId: _, ...data } = setlist;
  return NextResponse.json({ setlist: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const body = await request.json();
  const db = await getDb();

  const setlist = await db.collection("setlists").findOne({ userId, id });
  if (!setlist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updatedAt: Date.now() };

  if (body.action === "rename" && body.name) {
    update.name = body.name.trim();
  } else if (body.action === "addSong" && body.songId) {
    if (!(setlist.songIds as string[]).includes(body.songId)) {
      update.songIds = [...(setlist.songIds as string[]), body.songId];
    }
  } else if (body.action === "removeSong" && body.songId) {
    update.songIds = (setlist.songIds as string[]).filter((s: string) => s !== body.songId);
  } else if (body.action === "reorder" && typeof body.fromIndex === "number" && typeof body.toIndex === "number") {
    const ids = [...(setlist.songIds as string[])];
    const from = body.fromIndex as number;
    const to = body.toIndex as number;
    if (from >= 0 && from < ids.length && to >= 0 && to < ids.length) {
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      update.songIds = ids;
    }
  } else if (body.name) {
    // Direct name update (for saveSetlist)
    update.name = body.name.trim();
    if (body.songIds) update.songIds = body.songIds;
  }

  await db.collection("setlists").updateOne({ userId, id }, { $set: update });
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
  await db.collection("setlists").deleteOne({ userId, id });

  return NextResponse.json({ ok: true });
}
