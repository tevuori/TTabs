// MongoDB-backed sync session store with WebRTC signaling.
//
// A sync session is created by the server-side user (authenticated) when
// they open the /sync page. The session ID is embedded in the QR code.
//
// WebRTC signaling: the session stores the SDP offer and answer so the
// two devices can establish a direct peer-to-peer connection. The Vercel
// server only relays the signaling data — actual data flows directly
// between the laptop browser and the mobile app over the local network.
//
// Sessions auto-expire after 10 minutes via a TTL index.

import { getDb } from "../mongo";
import { randomBytes } from "crypto";

export type SyncSessionStatus = "waiting" | "connecting" | "syncing" | "completed";

export interface SyncSession {
  sessionId: string;
  userId: string;
  status: SyncSessionStatus;
  result: { added: number; updated: number; skipped: number } | null;
  offer: string | null;   // SDP offer (JSON string from RTCPeerConnection)
  answer: string | null;  // SDP answer (JSON string from RTCPeerConnection)
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL = 10 * 60 * 1000; // 10 minutes
const COLLECTION = "syncSessions";

async function ensureIndex() {
  const db = await getDb();
  await db.collection(COLLECTION).createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
  );
  await db.collection(COLLECTION).createIndex(
    { sessionId: 1 },
    { unique: true }
  );
}

let indexEnsured = false;

export async function createSession(userId: string): Promise<SyncSession> {
  if (!indexEnsured) {
    await ensureIndex();
    indexEnsured = true;
  }
  const db = await getDb();
  const now = Date.now();
  const session: SyncSession = {
    sessionId: generateSessionId(),
    userId,
    status: "waiting",
    result: null,
    offer: null,
    answer: null,
    createdAt: now,
    expiresAt: now + SESSION_TTL,
  };
  await db.collection(COLLECTION).insertOne(session);
  return session;
}

export async function getSession(sessionId: string): Promise<SyncSession | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ sessionId });
  if (!doc) return null;
  if (Date.now() > (doc.expiresAt as number)) {
    await db.collection(COLLECTION).deleteOne({ sessionId });
    return null;
  }
  return {
    sessionId: doc.sessionId as string,
    userId: doc.userId as string,
    status: doc.status as SyncSessionStatus,
    result: doc.result as SyncSession["result"],
    offer: doc.offer as string | null,
    answer: doc.answer as string | null,
    createdAt: doc.createdAt as number,
    expiresAt: doc.expiresAt as number,
  };
}

export async function setSessionOffer(sessionId: string, offer: string): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { sessionId },
    { $set: { offer, status: "connecting" } }
  );
}

export async function setSessionAnswer(sessionId: string, answer: string): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { sessionId },
    { $set: { answer } }
  );
}

export async function updateSessionStatus(
  sessionId: string,
  status: SyncSessionStatus,
  result?: { added: number; updated: number; skipped: number }
): Promise<void> {
  const db = await getDb();
  const update: Record<string, unknown> = { status };
  if (result !== undefined) {
    update.result = result;
  }
  await db.collection(COLLECTION).updateOne(
    { sessionId },
    { $set: update }
  );
}

function generateSessionId(): string {
  return randomBytes(4).toString("hex");
}
