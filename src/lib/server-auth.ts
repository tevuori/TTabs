// Server-side auth helpers for API routes.
// Extracts and validates the session token from the Authorization header.

import { NextRequest, NextResponse } from "next/server";
import { getDb, generateToken, hashPassword, verifyPassword } from "./mongo";

export interface ApiSession {
  userId: string;
  username: string;
  isAdmin: boolean;
}

const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

// Extract the token from the Authorization header.
function getToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return auth;
}

// Validate the session token against MongoDB. Returns the session or null.
export async function validateSession(request: NextRequest): Promise<ApiSession | null> {
  const token = getToken(request);
  if (!token) return null;
  const db = await getDb();
  const session = await db.collection("sessions").findOne({ token });
  if (!session) return null;
  if (Date.now() > (session.expiresAt as number)) {
    await db.collection("sessions").deleteOne({ token });
    return null;
  }
  return {
    userId: session.userId as string,
    username: session.username as string,
    isAdmin: session.isAdmin as boolean,
  };
}

// Require authentication. Returns the session or a 401 response.
export async function requireAuth(request: NextRequest): Promise<ApiSession | NextResponse> {
  const session = await validateSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

// Require admin. Returns the session or a 401/403 response.
export async function requireAdmin(request: NextRequest): Promise<ApiSession | NextResponse> {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;
  if (!result.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

// Create a new session in MongoDB and return the token + session info.
export async function createSession(userId: string, username: string, isAdmin: boolean): Promise<{ token: string; expiresAt: number }> {
  const db = await getDb();
  const token = generateToken();
  const expiresAt = Date.now() + SESSION_MAX_AGE;
  await db.collection("sessions").insertOne({
    token,
    userId,
    username,
    isAdmin,
    createdAt: Date.now(),
    expiresAt,
  });
  return { token, expiresAt };
}

// Delete a session (logout).
export async function deleteSession(token: string): Promise<void> {
  const db = await getDb();
  await db.collection("sessions").deleteOne({ token });
}
