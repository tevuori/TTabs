// MongoDB connection utility for TTabs.
// Uses a cached connection to avoid reconnecting on every API call in dev.

import { MongoClient, Db } from "mongodb";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://tevuori:GAy8DDmyyJkBr9ue@cluster0.cc3xmh4.mongodb.net/?retryWrites=true&w=majority";
const MONGODB_DB = process.env.MONGODB_DB || "ttabs";

// Cache the connection across hot reloads in dev.
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  cachedDb = client.db(MONGODB_DB);

  // Ensure indexes on first connect.
  await ensureIndexes(cachedDb);
  // Seed admin user if none exist.
  await seedAdmin(cachedDb);

  return cachedDb;
}

async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ token: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("songs").createIndex({ userId: 1, id: 1 }, { unique: true });
  await db.collection("songStates").createIndex({ userId: 1, songId: 1 }, { unique: true });
  await db.collection("setlists").createIndex({ userId: 1, id: 1 }, { unique: true });
}

// Admin credentials — seeded on first connect.
const ADMIN_USERNAME = "tevuori";
const ADMIN_PASSWORD = "agent00754";

async function seedAdmin(db: Db): Promise<void> {
  const count = await db.collection("users").countDocuments();
  if (count > 0) return;
  const { salt, hash } = hashPassword(ADMIN_PASSWORD);
  await db.collection("users").insertOne({
    id: "admin",
    username: ADMIN_USERNAME,
    passwordHash: hash,
    salt,
    isAdmin: true,
    createdAt: Date.now(),
  });
}

// SHA-256 password hashing (server-side, synchronous via Node crypto).
import { createHash, randomBytes } from "crypto";

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const hash = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return hash === expectedHash;
}

// Generate a random session token.
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
