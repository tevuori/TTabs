// IndexedDB storage for saved songs, chord/transposition state, and setlists.
// Works on Vercel (client-side) without any backend database setup.

import { openDB, IDBPDatabase } from "idb";
import { SongTab, SongState } from "./types";

const DB_NAME = "ttabs";
const DB_VERSION = 2;
const SONGS_STORE = "songs";
const STATE_STORE = "songStates";
const SETLISTS_STORE = "setlists";

export interface Setlist {
  id: string; // unique ID
  name: string;
  songIds: string[]; // ordered list of saved-song IDs
  createdAt: number;
  updatedAt: number;
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
          if (!db.objectStoreNames.contains(SONGS_STORE)) {
            const store = db.createObjectStore(SONGS_STORE, { keyPath: "id" });
            store.createIndex("savedAt", "savedAt");
            store.createIndex("artistName", "artistName");
          }
          if (!db.objectStoreNames.contains(STATE_STORE)) {
            db.createObjectStore(STATE_STORE, { keyPath: "songId" });
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(SETLISTS_STORE)) {
            db.createObjectStore(SETLISTS_STORE, { keyPath: "id" });
          }
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

// --- Setlists ---

// Create a new setlist.
export async function createSetlist(name: string): Promise<Setlist> {
  const db = await getDB();
  const now = Date.now();
  const setlist: Setlist = {
    id: `setlist-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled setlist",
    songIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.put(SETLISTS_STORE, setlist);
  return setlist;
}

// Get all setlists, most recently updated first.
export async function getAllSetlists(): Promise<Setlist[]> {
  const db = await getDB();
  const all = (await db.getAll(SETLISTS_STORE)) as Setlist[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Get a single setlist by ID.
export async function getSetlist(id: string): Promise<Setlist | undefined> {
  const db = await getDB();
  return (await db.get(SETLISTS_STORE, id)) as Setlist | undefined;
}

// Save (update) a setlist.
export async function saveSetlist(setlist: Setlist): Promise<void> {
  const db = await getDB();
  await db.put(SETLISTS_STORE, { ...setlist, updatedAt: Date.now() });
}

// Rename a setlist.
export async function renameSetlist(id: string, name: string): Promise<void> {
  const db = await getDB();
  const setlist = (await db.get(SETLISTS_STORE, id)) as Setlist | undefined;
  if (setlist) {
    setlist.name = name.trim() || setlist.name;
    setlist.updatedAt = Date.now();
    await db.put(SETLISTS_STORE, setlist);
  }
}

// Delete a setlist.
export async function deleteSetlist(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(SETLISTS_STORE, id);
}

// Add a song to the end of a setlist (no-op if already present).
export async function addSongToSetlist(setlistId: string, songId: string): Promise<void> {
  const db = await getDB();
  const setlist = (await db.get(SETLISTS_STORE, setlistId)) as Setlist | undefined;
  if (!setlist) return;
  if (!setlist.songIds.includes(songId)) {
    setlist.songIds.push(songId);
    setlist.updatedAt = Date.now();
    await db.put(SETLISTS_STORE, setlist);
  }
}

// Remove a song from a setlist.
export async function removeSongFromSetlist(setlistId: string, songId: string): Promise<void> {
  const db = await getDB();
  const setlist = (await db.get(SETLISTS_STORE, setlistId)) as Setlist | undefined;
  if (!setlist) return;
  setlist.songIds = setlist.songIds.filter((id: string) => id !== songId);
  setlist.updatedAt = Date.now();
  await db.put(SETLISTS_STORE, setlist);
}

// Reorder a song within a setlist (move from one index to another).
export async function moveSongInSetlist(
  setlistId: string,
  fromIndex: number,
  toIndex: number
): Promise<void> {
  const db = await getDB();
  const setlist = (await db.get(SETLISTS_STORE, setlistId)) as Setlist | undefined;
  if (!setlist) return;
  const ids = setlist.songIds;
  if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) return;
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);
  setlist.updatedAt = Date.now();
  await db.put(SETLISTS_STORE, setlist);
}
