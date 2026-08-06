// In-memory sync session store.
//
// A sync session is created by the server-side user (authenticated) when
// they open the /sync page. The session ID is embedded in the QR code.
// The mobile app scans the QR, then uses the session ID to authenticate
// its HTTP requests to the sync data endpoints.
//
// Sessions expire after 10 minutes. Storage is in-memory, so sessions
// are lost on server restart — the user just refreshes the sync page.
// This is fine for local-network sync (the server runs as a long-lived
// process via `next dev` or `next start`).

export type SyncSessionStatus = "waiting" | "syncing" | "completed";

export interface SyncSession {
  sessionId: string;
  userId: string;
  status: SyncSessionStatus;
  result: { added: number; updated: number; skipped: number } | null;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

// Map<sessionId, SyncSession>
const sessions = new Map<string, SyncSession>();

// Clean up expired sessions periodically.
function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      sessions.delete(id);
    }
  }
}

export function createSession(userId: string): SyncSession {
  cleanup();
  const sessionId = generateSessionId();
  const now = Date.now();
  const session: SyncSession = {
    sessionId,
    userId,
    status: "waiting",
    result: null,
    createdAt: now,
    expiresAt: now + SESSION_TTL,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SyncSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function updateSessionStatus(
  sessionId: string,
  status: SyncSessionStatus,
  result?: { added: number; updated: number; skipped: number }
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.status = status;
  if (result !== undefined) {
    session.result = result;
  }
}

function generateSessionId(): string {
  // 8-char hex ID — short enough for QR, enough entropy for local network.
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
