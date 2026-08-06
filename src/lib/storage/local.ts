// Mobile-mode storage backend: local IndexedDB.
// Fully offline — no server, no DB, no auth. Single local user.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SongTab, SongState } from "../types";
import type {
  Setlist,
  StorageBackend,
  SyncPayload,
  ImportResult,
  ImportStrategy,
} from "./types";

interface TTabsDB extends DBSchema {
  songs: {
    key: string; // song.id
    value: SongTab;
  };
  songStates: {
    key: string; // songId
    value: { songId: string; state: SongState };
  };
  setlists: {
    key: string; // setlist.id
    value: Setlist;
  };
}

const DB_NAME = "ttabs-local";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TTabsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TTabsDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB<TTabsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("songs")) {
          db.createObjectStore("songs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("songStates")) {
          db.createObjectStore("songStates", { keyPath: "songId" });
        }
        if (!db.objectStoreNames.contains("setlists")) {
          db.createObjectStore("setlists", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const localBackend: StorageBackend = {
  // --- Songs ---

  async saveSong(song: SongTab): Promise<void> {
    const db = await getDb();
    await db.put("songs", song);
  },

  async getSong(id: string): Promise<SongTab | undefined> {
    const db = await getDb();
    return db.get("songs", id);
  },

  async getAllSongs(): Promise<SongTab[]> {
    const db = await getDb();
    const all = await db.getAll("songs");
    return all.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  },

  async deleteSong(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("songs", id);
    await db.delete("songStates", id);
  },

  async isSongSaved(id: string): Promise<boolean> {
    const db = await getDb();
    const song = await db.get("songs", id);
    return !!song;
  },

  // --- Song state ---

  async saveSongState(songId: string, state: SongState): Promise<void> {
    const db = await getDb();
    await db.put("songStates", { songId, state });
  },

  async getSongState(songId: string): Promise<SongState | undefined> {
    const db = await getDb();
    const row = await db.get("songStates", songId);
    return row?.state;
  },

  async deleteSongState(songId: string): Promise<void> {
    const db = await getDb();
    await db.delete("songStates", songId);
  },

  // --- Setlists ---

  async createSetlist(name: string): Promise<Setlist> {
    const now = Date.now();
    const setlist: Setlist = {
      id: genId("setlist"),
      name: name.trim() || "Untitled setlist",
      songIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const db = await getDb();
    await db.put("setlists", setlist);
    return setlist;
  },

  async getAllSetlists(): Promise<Setlist[]> {
    const db = await getDb();
    const all = await db.getAll("setlists");
    return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },

  async getSetlist(id: string): Promise<Setlist | undefined> {
    const db = await getDb();
    return db.get("setlists", id);
  },

  async saveSetlist(setlist: Setlist): Promise<void> {
    const db = await getDb();
    await db.put("setlists", { ...setlist, updatedAt: setlist.updatedAt ?? Date.now() });
  },

  async renameSetlist(id: string, name: string): Promise<void> {
    const db = await getDb();
    const sl = await db.get("setlists", id);
    if (!sl) return;
    await db.put("setlists", { ...sl, name: name.trim(), updatedAt: Date.now() });
  },

  async deleteSetlist(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("setlists", id);
  },

  async addSongToSetlist(setlistId: string, songId: string): Promise<void> {
    const db = await getDb();
    const sl = await db.get("setlists", setlistId);
    if (!sl) return;
    if (sl.songIds.includes(songId)) return;
    await db.put("setlists", {
      ...sl,
      songIds: [...sl.songIds, songId],
      updatedAt: Date.now(),
    });
  },

  async removeSongFromSetlist(setlistId: string, songId: string): Promise<void> {
    const db = await getDb();
    const sl = await db.get("setlists", setlistId);
    if (!sl) return;
    await db.put("setlists", {
      ...sl,
      songIds: sl.songIds.filter(s => s !== songId),
      updatedAt: Date.now(),
    });
  },

  async moveSongInSetlist(
    setlistId: string,
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    const db = await getDb();
    const sl = await db.get("setlists", setlistId);
    if (!sl) return;
    const ids = [...sl.songIds];
    if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) return;
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    await db.put("setlists", { ...sl, songIds: ids, updatedAt: Date.now() });
  },

  // --- Bulk sync ---

  async exportAll(): Promise<SyncPayload> {
    const db = await getDb();
    const [songs, stateRows, setlists] = await Promise.all([
      db.getAll("songs"),
      db.getAll("songStates"),
      db.getAll("setlists"),
    ]);
    return {
      version: 1,
      exportedAt: Date.now(),
      songs,
      states: stateRows.map(r => ({ songId: r.songId, state: r.state })),
      setlists,
    };
  },

  async importAll(
    payload: SyncPayload,
    strategy: ImportStrategy
  ): Promise<ImportResult> {
    const db = await getDb();

    if (strategy === "replace") {
      await db.clear("songs");
      await db.clear("songStates");
      await db.clear("setlists");
      for (const song of payload.songs) await db.put("songs", song);
      for (const { songId, state } of payload.states) await db.put("songStates", { songId, state });
      for (const sl of payload.setlists) await db.put("setlists", sl);
      return {
        added: payload.songs.length + payload.setlists.length,
        updated: 0,
        skipped: 0,
      };
    }

    // merge: newest wins
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const song of payload.songs) {
      const existing = await db.get("songs", song.id);
      if (!existing) {
        await db.put("songs", song);
        added++;
      } else if ((song.savedAt ?? 0) >= (existing.savedAt ?? 0)) {
        await db.put("songs", song);
        updated++;
      } else {
        skipped++;
      }
    }

    for (const { songId, state } of payload.states) {
      const existing = await db.get("songStates", songId);
      if (existing && (existing.state.updatedAt ?? 0) > (state.updatedAt ?? 0)) {
        continue;
      }
      await db.put("songStates", { songId, state });
    }

    for (const sl of payload.setlists) {
      const existing = await db.get("setlists", sl.id);
      if (!existing) {
        await db.put("setlists", sl);
        added++;
      } else if ((sl.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
        await db.put("setlists", sl);
        updated++;
      } else {
        skipped++;
      }
    }

    return { added, updated, skipped };
  },
};
