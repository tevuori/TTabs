// Recently-viewed songs, stored in localStorage (separate from the saved
// library). Keeps a short history of songs the user has opened so they can
// jump back in quickly. Scoped per-user.

import { SongTab } from "./types";

const KEY_PREFIX = "ttabs:recent:";
const MAX_ITEMS = 8;

// Get the current user's ID from the session for per-user scoping.
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

function storageKey(): string {
  return KEY_PREFIX + getCurrentUserId();
}

// Minimal record persisted for each recently-viewed song.
export interface RecentSong {
  id: string;
  songName: string;
  artistName: string;
  key: string | null;
  capo: number | null;
  type: string;
  url: string;
  visitedAt: number;
}

function read(): RecentSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: RecentSong[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // ignore quota / serialization errors
  }
}

// Record (or bump) a song as recently viewed.
export function addRecentSong(song: SongTab): void {
  if (typeof window === "undefined" || !song.id) return;
  const items = read().filter(s => s.id !== song.id);
  const record: RecentSong = {
    id: song.id,
    songName: song.songName,
    artistName: song.artistName,
    key: song.key,
    capo: song.capo,
    type: song.type,
    url: song.url,
    visitedAt: Date.now(),
  };
  write([record, ...items]);
}

// Get the recently-viewed list, newest first.
export function getRecentSongs(): RecentSong[] {
  return read().sort((a, b) => b.visitedAt - a.visitedAt);
}

// Remove a song from recent history.
export function removeRecentSong(id: string): void {
  write(read().filter(s => s.id !== id));
}

// Clear all recent history.
export function clearRecentSongs(): void {
  write([]);
}
