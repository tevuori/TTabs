// IndexedDB storage for saved songs and chord/transposition state
// Works on Vercel (client-side) without any backend database setup

import { openDB, IDBPDatabase } from "idb";
import { SongTab, SongState } from "./types";

const DB_NAME = "ttabs";
const DB_VERSION = 1;
const SONGS_STORE = "songs";
const STATE_STORE = "songStates";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SONGS_STORE)) {
          const store = db.createObjectStore(SONGS_STORE, { keyPath: "id" });
          store.createIndex("savedAt", "savedAt");
          store.createIndex("artistName", "artistName");
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: "songId" });
        }
      },
    });
  }
  return dbPromise;
}

// Save a song to the library
export async function saveSong(song: SongTab): Promise<void> {
  const db = await getDB();
  await db.put(SONGS_STORE, song);
}

// Get a saved song by ID
export async function getSong(id: string): Promise<SongTab | undefined> {
  const db = await getDB();
  return db.get(SONGS_STORE, id);
}

// Get all saved songs, sorted by most recently saved
export async function getAllSongs(): Promise<SongTab[]> {
  const db = await getDB();
  const all = await db.getAll(SONGS_STORE);
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

// Delete a saved song
export async function deleteSong(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(SONGS_STORE, id);
  // Also delete associated state
  await db.delete(STATE_STORE, id);
}

// Check if a song is saved
export async function isSongSaved(id: string): Promise<boolean> {
  const db = await getDB();
  const song = await db.get(SONGS_STORE, id);
  return !!song;
}

// Save chord/transposition state for a song
export async function saveSongState(songId: string, state: SongState): Promise<void> {
  const db = await getDB();
  await db.put(STATE_STORE, { ...state, songId });
}

// Get saved state for a song
export async function getSongState(songId: string): Promise<SongState | undefined> {
  const db = await getDB();
  const result = await db.get(STATE_STORE, songId);
  if (!result) return undefined;
  const { songId: _, ...state } = result;
  return state as SongState;
}

// Delete saved state for a song
export async function deleteSongState(songId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STATE_STORE, songId);
}
