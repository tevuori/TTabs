// GET  /api/sync/data?session=XXX  — returns the server's SyncPayload
// POST /api/sync/data?session=XXX  — receives the mobile's SyncPayload,
//                                     merges it into MongoDB, returns result
//
// These endpoints authenticate via the sync session ID (not the normal
// auth token), so the mobile app — which has no login — can access them.
// CORS is permissive because the mobile app runs in a Capacitor WebView
// with a different origin (https://localhost).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getSession, updateSessionStatus } from "@/lib/sync/session";
import type { SyncPayload } from "@/lib/storage/types";
import type { SongState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Permissive CORS — the session ID provides the security.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function corsResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: CORS_HEADERS,
  });
}

async function requireSession(request: NextRequest): Promise<string | null> {
  const session = request.nextUrl.searchParams.get("session");
  if (!session) return null;
  const s = await getSession(session);
  if (!s) return null;
  return s.userId;
}

// GET — export all of the user's data as a SyncPayload
export async function GET(request: NextRequest) {
  const userId = await requireSession(request);
  if (!userId) {
    return corsResponse({ error: "Invalid or expired session" }, 401);
  }

  const db = await getDb();
  const [songs, setlists, stateDocs] = await Promise.all([
    db.collection("songs").find({ userId }).toArray(),
    db.collection("setlists").find({ userId }).toArray(),
    db.collection("songStates").find({ userId }).toArray(),
  ]);

  const payload: SyncPayload = {
    version: 1,
    exportedAt: Date.now(),
    songs: songs.map(({ _id, userId: _, ...song }) => song) as SyncPayload["songs"],
    states: stateDocs.map(({ _id, userId: _, songId, state }) => ({
      songId,
      state: state as SongState,
    })),
    setlists: setlists.map(({ _id, userId: _, ...sl }) => sl) as SyncPayload["setlists"],
  };

  return corsResponse(payload);
}

// POST — receive the mobile's SyncPayload and merge it into MongoDB
export async function POST(request: NextRequest) {
  const userId = await requireSession(request);
  if (!userId) {
    return corsResponse({ error: "Invalid or expired session" }, 401);
  }

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return corsResponse({ error: "Invalid JSON" }, 400);
  }

  await updateSessionStatus(request.nextUrl.searchParams.get("session")!, "syncing");

  const db = await getDb();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  // Songs — merge by newest savedAt
  for (const song of payload.songs) {
    const existing = await db.collection("songs").findOne({ userId, id: song.id });
    if (!existing) {
      await db.collection("songs").updateOne(
        { userId, id: song.id },
        { $set: { ...song, userId } },
        { upsert: true }
      );
      added++;
    } else if ((song.savedAt ?? 0) >= (existing.savedAt ?? 0)) {
      await db.collection("songs").updateOne(
        { userId, id: song.id },
        { $set: { ...song, userId } },
        { upsert: true }
      );
      updated++;
    } else {
      skipped++;
    }
  }

  // Song states — merge by newest updatedAt
  for (const { songId, state } of payload.states) {
    const existing = await db.collection("songStates").findOne({ userId, songId });
    if (existing && (existing.state?.updatedAt ?? 0) > (state.updatedAt ?? 0)) {
      continue;
    }
    await db.collection("songStates").updateOne(
      { userId, songId },
      { $set: { userId, songId, state } },
      { upsert: true }
    );
  }

  // Setlists — merge by newest updatedAt
  for (const sl of payload.setlists) {
    const existing = await db.collection("setlists").findOne({ userId, id: sl.id });
    if (!existing) {
      await db.collection("setlists").updateOne(
        { userId, id: sl.id },
        { $set: { ...sl, userId } },
        { upsert: true }
      );
      added++;
    } else if ((sl.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      await db.collection("setlists").updateOne(
        { userId, id: sl.id },
        { $set: { ...sl, userId } },
        { upsert: true }
      );
      updated++;
    } else {
      skipped++;
    }
  }

  const result = { added, updated, skipped };
  await updateSessionStatus(request.nextUrl.searchParams.get("session")!, "completed", result);

  return corsResponse(result);
}
