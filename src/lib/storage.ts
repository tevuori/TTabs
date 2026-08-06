// IndexedDB storage for saved songs, chord/transposition state, and setlists.
// All data is scoped per-user via a composite key (userId:songId).
// Works on Vercel (client-side) without any backend database setup.

import { SongTab, SongState } from "./types";
import { getDB, SONGS_STORE, STATE_STORE, SETLISTS_STORE } from "./db";

export interface Setlist {
  id: string; // unique ID (includes userId prefix)
  name: string;
  songIds: string[]; // ordered list of saved-song keys
  userId: string;
  createdAt: number;
  updatedAt: number;
}

// Get the current user's ID from the session.
function getCurrentUserId(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const raw = localStorage.getItem("ttabs_session");
    if (!raw) return "anon";
    const session = JSON.parse(raw);
    return session.userId || "anon";
  } catch {
    return "anon";
  }
}

// Build a composite key for per-user song storage.
function songKey(userId: string, songId: string): string {
  return `${userId}:${songId}`;
}

// --- Songs ---

// Save a song to the current user's library
export async function saveSong(song: SongTab): Promise<void> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const key = songKey(userId, song.id);
  await db.put(SONGS_STORE, { ...song, key, userId });
}

// Get a saved song by ID (for the current user)
export async function getSong(id: string): Promise<SongTab | undefined> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const result = await db.get(SONGS_STORE, songKey(userId, id));
  if (!result) return undefined;
  const { key: _, userId: __, ...song } = result;
  return song as SongTab;
}

// Get all saved songs for the current user, sorted by most recently saved
export async function getAllSongs(): Promise<SongTab[]> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const index = db.transaction(SONGS_STORE).store.index("userId");
  const all = await index.getAll(userId);
  return all
    .map(({ key: _, userId: __, ...song }) => song as SongTab)
    .sort((a, b) => b.savedAt - a.savedAt);
}

// Delete a saved song (for the current user)
export async function deleteSong(id: string): Promise<void> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const key = songKey(userId, id);
  await db.delete(SONGS_STORE, key);
  // Also delete associated state
  await db.delete(STATE_STORE, key);
}

// Check if a song is saved (for the current user)
export async function isSongSaved(id: string): Promise<boolean> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const song = await db.get(SONGS_STORE, songKey(userId, id));
  return !!song;
}

// --- Song state ---

// Save chord/transposition state for a song (for the current user)
export async function saveSongState(songId: string, state: SongState): Promise<void> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const key = songKey(userId, songId);
  await db.put(STATE_STORE, { ...state, songId, key, userId });
}

// Get saved state for a song (for the current user)
export async function getSongState(songId: string): Promise<SongState | undefined> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const result = await db.get(STATE_STORE, songKey(userId, songId));
  if (!result) return undefined;
  const { key: _, userId: __, songId: ___, ...state } = result;
  return state as SongState;
}

// Delete saved state for a song (for the current user)
export async function deleteSongState(songId: string): Promise<void> {
  const db = await getDB();
  const userId = getCurrentUserId();
  await db.delete(STATE_STORE, songKey(userId, songId));
}

// --- Setlists ---

// Create a new setlist for the current user.
export async function createSetlist(name: string): Promise<Setlist> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const now = Date.now();
  const setlist: Setlist = {
    id: `setlist-${userId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled setlist",
    songIds: [],
    userId,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(SETLISTS_STORE, setlist);
  return setlist;
}

// Get all setlists for the current user, most recently updated first.
export async function getAllSetlists(): Promise<Setlist[]> {
  const db = await getDB();
  const userId = getCurrentUserId();
  const index = db.transaction(SETLISTS_STORE).store.index("userId");
  const all = (await index.getAll(userId)) as Setlist[];
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
