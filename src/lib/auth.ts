// Client-side authentication for TTabs.
// Sessions are stored in localStorage (token + user info) and validated
// server-side against MongoDB on every API call.

export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface Session {
  token: string;
  userId: string;
  username: string;
  isAdmin: boolean;
  expiresAt: number;
}

const SESSION_KEY = "ttabs_session";

// Get the stored session from localStorage (no server validation).
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

// Get the auth token for API calls.
export function getToken(): string | null {
  return getSession()?.token ?? null;
}

// Login via the API. Returns the session on success, null on bad credentials.
export async function login(username: string, password: string): Promise<Session | null> {
  const resp = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const session: Session = {
    token: data.token,
    userId: data.session.userId,
    username: data.session.username,
    isAdmin: data.session.isAdmin,
    expiresAt: data.session.expiresAt,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// Logout via the API (invalidates the server-side session) + clear localStorage.
export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  localStorage.removeItem(SESSION_KEY);
}

// Validate the current session against the server.
// Returns true if the session is still valid.
export async function validateSession(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const resp = await fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// --- User management (admin only) ---

export async function getAllUsers(): Promise<User[]> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch("/api/auth/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to fetch users");
  const data = await resp.json();
  return data.users as User[];
}

export async function addUser(username: string, password: string, isAdmin: boolean = false): Promise<User> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch("/api/auth/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, isAdmin }),
  });
  if (!resp.ok) {
    const data = await resp.json();
    throw new Error(data.error || "Failed to add user");
  }
  const data = await resp.json();
  return data as User;
}

export async function deleteUser(id: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(`/api/auth/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const data = await resp.json();
    throw new Error(data.error || "Failed to delete user");
  }
}

export async function changePassword(id: string, newPassword: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(`/api/auth/users/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!resp.ok) {
    const data = await resp.json();
    throw new Error(data.error || "Failed to change password");
  }
}

// No-op — admin is seeded server-side on first MongoDB connect.
export async function ensureAdminSeeded(): Promise<void> {}
