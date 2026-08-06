// Storage facade: re-exports the active backend based on APP_MODE.
//
// Existing imports like `import { saveSong } from "@/lib/storage"` keep
// working because the thin function wrappers below delegate to the active
// backend.

import { IS_MOBILE } from "../app-mode";
import { serverBackend } from "./server";
import { localBackend } from "./local";
import type { StorageBackend } from "./types";

export type {
  Setlist,
  SyncPayload,
  ImportResult,
  ImportStrategy,
  StorageBackend,
} from "./types";

// The active backend for the current build mode.
export const backend: StorageBackend = IS_MOBILE ? localBackend : serverBackend;

// --- Thin wrappers (preserve the existing module surface) ---

import { SongTab, SongState } from "../types";
import type { Setlist, SyncPayload, ImportResult, ImportStrategy } from "./types";

export function saveSong(song: SongTab): Promise<void> {
  return backend.saveSong(song);
}
export function getSong(id: string): Promise<SongTab | undefined> {
  return backend.getSong(id);
}
export function getAllSongs(): Promise<SongTab[]> {
  return backend.getAllSongs();
}
export function deleteSong(id: string): Promise<void> {
  return backend.deleteSong(id);
}
export function isSongSaved(id: string): Promise<boolean> {
  return backend.isSongSaved(id);
}

export function saveSongState(songId: string, state: SongState): Promise<void> {
  return backend.saveSongState(songId, state);
}
export function getSongState(songId: string): Promise<SongState | undefined> {
  return backend.getSongState(songId);
}
export function deleteSongState(songId: string): Promise<void> {
  return backend.deleteSongState(songId);
}

export function createSetlist(name: string): Promise<Setlist> {
  return backend.createSetlist(name);
}
export function getAllSetlists(): Promise<Setlist[]> {
  return backend.getAllSetlists();
}
export function getSetlist(id: string): Promise<Setlist | undefined> {
  return backend.getSetlist(id);
}
export function saveSetlist(setlist: Setlist): Promise<void> {
  return backend.saveSetlist(setlist);
}
export function renameSetlist(id: string, name: string): Promise<void> {
  return backend.renameSetlist(id, name);
}
export function deleteSetlist(id: string): Promise<void> {
  return backend.deleteSetlist(id);
}
export function addSongToSetlist(setlistId: string, songId: string): Promise<void> {
  return backend.addSongToSetlist(setlistId, songId);
}
export function removeSongFromSetlist(setlistId: string, songId: string): Promise<void> {
  return backend.removeSongFromSetlist(setlistId, songId);
}
export function moveSongInSetlist(
  setlistId: string,
  fromIndex: number,
  toIndex: number
): Promise<void> {
  return backend.moveSongInSetlist(setlistId, fromIndex, toIndex);
}

export function exportAll(): Promise<SyncPayload> {
  return backend.exportAll();
}
export function importAll(
  payload: SyncPayload,
  strategy: ImportStrategy
): Promise<ImportResult> {
  return backend.importAll(payload, strategy);
}
