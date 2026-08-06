// Client-side authentication for TTabs.
// Users are stored in IndexedDB with SHA-256 hashed passwords.
// Sessions persist in localStorage so users don't log in every visit.
//
// NOTE: This is a client-side-only app with no backend. The security is
// inherently limited — anyone with devtools access can read IndexedDB.
// This is a gatekeeper for normal usage, not a hardened auth system.

import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "ttabs";
const DB_VERSION = 3; // bumped from 2 (setlists) to add users store
const USERS_STORE = "users";

const SESSION_KEY = "ttabs_session";
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

// Admin credentials — seeded on first run.
const ADMIN_USERNAME = "tevuori";
const ADMIN_PASSWORD = "agent00754";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface Session {
  userId: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
  expiresAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("songs")) {
            const store = db.createObjectStore("songs", { keyPath: "id" });
            store.createIndex("savedAt", "savedAt");
            store.createIndex("artistName", "artistName");
          }
          if (!db.objectStoreNames.contains("songStates")) {
            db.createObjectStore("songStates", { keyPath: "songId" });
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("setlists")) {
            db.createObjectStore("setlists", { keyPath: "id" });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(USERS_STORE)) {
            const store = db.createObjectStore(USERS_STORE, { keyPath: "id" });
            store.createIndex("username", "username", { unique: true });
          }
        }
      },
    });
  }
  return dbPromise;
}

// Hash a password with a salt using SHA-256 via Web Crypto.
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Seed the admin user on first run (if no users exist).
let seeded = false;
export async function ensureAdminSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  const db = await getDB();
  const all = await db.getAll(USERS_STORE);
  if (all.length > 0) return;
  const salt = generateSalt();
  const passwordHash = await hashPassword(ADMIN_PASSWORD, salt);
  const admin: User = {
    id: "admin",
    username: ADMIN_USERNAME,
    passwordHash,
    salt,
    isAdmin: true,
    createdAt: Date.now(),
  };
  await db.put(USERS_STORE, admin);
}

// Authenticate a user by username + password. Returns a session on success.
export async function login(
  username: string,
  password: string
): Promise<Session | null> {
  await ensureAdminSeeded();
  const db = await getDB();
  const index = db.transaction(USERS_STORE).store.index("username");
  const user = (await index.get(username)) as User | undefined;
  if (!user) return null;
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return null;
  const now = Date.now();
  const session: Session = {
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// Log out the current user.
export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

// Get the current session from localStorage, or null if not logged in / expired.
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

// Get all users (admin only — caller should check session.isAdmin).
export async function getAllUsers(): Promise<User[]> {
  const db = await getDB();
  const all = (await db.getAll(USERS_STORE)) as User[];
  return all.sort((a, b) => a.username.localeCompare(b.username));
}

// Add a new user. Returns the created user, or throws on conflict.
export async function addUser(
  username: string,
  password: string,
  isAdmin: boolean = false
): Promise<User> {
  await ensureAdminSeeded();
  const db = await getDB();
  // Check for existing username.
  const index = db.transaction(USERS_STORE).store.index("username");
  const existing = await index.get(username);
  if (existing) throw new Error(`Username "${username}" already exists`);
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const user: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    passwordHash,
    salt,
    isAdmin,
    createdAt: Date.now(),
  };
  await db.put(USERS_STORE, user);
  return user;
}

// Delete a user by ID. Cannot delete the seeded admin.
export async function deleteUser(id: string): Promise<void> {
  const db = await getDB();
  if (id === "admin") throw new Error("Cannot delete the admin user");
  await db.delete(USERS_STORE, id);
}

// Change a user's password.
export async function changePassword(
  id: string,
  newPassword: string
): Promise<void> {
  const db = await getDB();
  const user = (await db.get(USERS_STORE, id)) as User | undefined;
  if (!user) throw new Error("User not found");
  const salt = generateSalt();
  user.salt = salt;
  user.passwordHash = await hashPassword(newPassword, salt);
  await db.put(USERS_STORE, user);
}
