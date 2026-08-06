// Client-side storage backed by MongoDB via API routes.
// All data is scoped per-user on the server side.

import { SongTab, SongState } from "./types";
import { getToken } from "./auth";

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// --- Songs ---

export async function saveSong(song: SongTab): Promise<void> {
  await fetch("/api/data/songs", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(song),
  });
}

export async function getSong(id: string): Promise<SongTab | undefined> {
  const resp = await fetch(`/api/data/songs/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (!resp.ok) return undefined;
  const data = await resp.json();
  return data.song as SongTab;
}

export async function getAllSongs(): Promise<SongTab[]> {
  const resp = await fetch("/api/data/songs", { headers: authHeaders() });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.songs as SongTab[];
}

export async function deleteSong(id: string): Promise<void> {
  await fetch(`/api/data/songs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function isSongSaved(id: string): Promise<boolean> {
  const resp = await fetch(`/api/data/songs/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return resp.ok;
}

// --- Song state ---

export async function saveSongState(songId: string, state: SongState): Promise<void> {
  await fetch(`/api/data/states/${encodeURIComponent(songId)}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

export async function getSongState(songId: string): Promise<SongState | undefined> {
  const resp = await fetch(`/api/data/states/${encodeURIComponent(songId)}`, {
    headers: authHeaders(),
  });
  if (!resp.ok) return undefined;
  const data = await resp.json();
  return data.state as SongState | undefined;
}

export async function deleteSongState(songId: string): Promise<void> {
  await fetch(`/api/data/states/${encodeURIComponent(songId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// --- Setlists ---

export async function createSetlist(name: string): Promise<Setlist> {
  const resp = await fetch("/api/data/setlists", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await resp.json();
  return data.setlist as Setlist;
}

export async function getAllSetlists(): Promise<Setlist[]> {
  const resp = await fetch("/api/data/setlists", { headers: authHeaders() });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.setlists as Setlist[];
}

export async function getSetlist(id: string): Promise<Setlist | undefined> {
  const resp = await fetch(`/api/data/setlists/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (!resp.ok) return undefined;
  const data = await resp.json();
  return data.setlist as Setlist;
}

export async function saveSetlist(setlist: Setlist): Promise<void> {
  await fetch(`/api/data/setlists/${encodeURIComponent(setlist.id)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: setlist.name, songIds: setlist.songIds }),
  });
}

export async function renameSetlist(id: string, name: string): Promise<void> {
  await fetch(`/api/data/setlists/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rename", name }),
  });
}

export async function deleteSetlist(id: string): Promise<void> {
  await fetch(`/api/data/setlists/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function addSongToSetlist(setlistId: string, songId: string): Promise<void> {
  await fetch(`/api/data/setlists/${encodeURIComponent(setlistId)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ action: "addSong", songId }),
  });
}

export async function removeSongFromSetlist(setlistId: string, songId: string): Promise<void> {
  await fetch(`/api/data/setlists/${encodeURIComponent(setlistId)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ action: "removeSong", songId }),
  });
}

export async function moveSongInSetlist(
  setlistId: string,
  fromIndex: number,
  toIndex: number
): Promise<void> {
  await fetch(`/api/data/setlists/${encodeURIComponent(setlistId)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reorder", fromIndex, toIndex }),
  });
}
