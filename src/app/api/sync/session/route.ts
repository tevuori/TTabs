// POST /api/sync/session
// Creates a sync session. Requires authentication (the server user must be
// logged in). Returns the session ID and the server URL for the QR code.
//
// The server URL is the request origin (e.g. "https://tabs.tevuori.eu").
// This is used only for signaling — the actual data transfer happens over
// a WebRTC peer-to-peer connection between the laptop browser and mobile app.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { createSession } from "@/lib/sync/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const session = await createSession(userId);

  return NextResponse.json({
    sessionId: session.sessionId,
    serverUrl: request.nextUrl.origin,
  });
}
