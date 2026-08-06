// POST /api/sync/session
// Creates a sync session. Requires authentication (the server user must be
// logged in). Returns the session ID and the server's local IP so the
// sync page can build a QR code for the mobile app to scan.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { createSession } from "@/lib/sync/session";
import { getLocalIp } from "@/lib/sync/local-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const session = createSession(userId);
  const localIp = getLocalIp();

  // The URL the mobile should connect to. If we can detect a local IP,
  // use it with the current request's port. Otherwise fall back to the
  // request's origin (works for Vercel or direct access).
  const port = request.nextUrl.port || (request.nextUrl.protocol === "https:" ? "443" : "80");
  const serverUrl = localIp
    ? `http://${localIp}:${port}`
    : request.nextUrl.origin;

  return NextResponse.json({
    sessionId: session.sessionId,
    serverUrl,
    localIp,
  });
}
