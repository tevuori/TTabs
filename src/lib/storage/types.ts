// Storage abstraction for TTabs.
//
// The same UI components work in both server mode (MongoDB via API routes)
// and mobile mode (local IndexedDB) by talking to a StorageBackend.

import { SongTab, SongState } from "../types";

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

// A complete snapshot of the user's data, used for QR sync export/import.
export interface SyncPayload {
  version: number;
  exportedAt: number;
  songs: SongTab[];
  states: { songId: string; state: SongState }[];
  setlists: Setlist[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export type ImportStrategy = "merge" | "replace";

export interface StorageBackend {
  // --- Songs ---
  saveSong(song: SongTab): Promise<void>;
  getSong(id: string): Promise<SongTab | undefined>;
  getAllSongs(): Promise<SongTab[]>;
  deleteSong(id: string): Promise<void>;
  isSongSaved(id: string): Promise<boolean>;

  // --- Song state ---
  saveSongState(songId: string, state: SongState): Promise<void>;
  getSongState(songId: string): Promise<SongState | undefined>;
  deleteSongState(songId: string): Promise<void>;

  // --- Setlists ---
  createSetlist(name: string): Promise<Setlist>;
  getAllSetlists(): Promise<Setlist[]>;
  getSetlist(id: string): Promise<Setlist | undefined>;
  saveSetlist(setlist: Setlist): Promise<void>;
  renameSetlist(id: string, name: string): Promise<void>;
  deleteSetlist(id: string): Promise<void>;
  addSongToSetlist(setlistId: string, songId: string): Promise<void>;
  removeSongFromSetlist(setlistId: string, songId: string): Promise<void>;
  moveSongInSetlist(setlistId: string, fromIndex: number, toIndex: number): Promise<void>;

  // --- Bulk sync ---
  exportAll(): Promise<SyncPayload>;
  importAll(payload: SyncPayload, strategy: ImportStrategy): Promise<ImportResult>;
}
