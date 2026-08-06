// WebRTC signaling endpoint.
//
// GET  /api/sync/signal?session=XXX — returns { offer, answer } from the session
// POST /api/sync/signal?session=XXX — stores the SDP offer or answer
//   body: { type: "offer" | "answer", value: string }
//
// Auth is via the session ID only (the session was created by an authenticated
// user). CORS is permissive for the Capacitor WebView origin.

import { NextRequest, NextResponse } from "next/server";
import { getSession, setSessionOffer, setSessionAnswer } from "@/lib/sync/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET — fetch the current offer and answer from the session
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session" }, { status: 400, headers: CORS_HEADERS });
  }
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404, headers: CORS_HEADERS });
  }
  return NextResponse.json({
    offer: session.offer,
    answer: session.answer,
    status: session.status,
  }, { headers: CORS_HEADERS });
}

// POST — store the SDP offer or answer
export async function POST(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session" }, { status: 400, headers: CORS_HEADERS });
  }
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404, headers: CORS_HEADERS });
  }

  let body: { type: string; value: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (body.type === "offer") {
    await setSessionOffer(sessionId, body.value);
  } else if (body.type === "answer") {
    await setSessionAnswer(sessionId, body.value);
  } else {
    return NextResponse.json({ error: "Invalid type, expected 'offer' or 'answer'" }, { status: 400, headers: CORS_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
