// Server-mode storage backend: MongoDB via API routes.
// All data is scoped per-user on the server side.

import { SongTab, SongState } from "../types";
import { getToken } from "../auth";
import type {
  Setlist,
  StorageBackend,
  SyncPayload,
  ImportResult,
  ImportStrategy,
} from "./types";

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export const serverBackend: StorageBackend = {
  // --- Songs ---

  async saveSong(song: SongTab): Promise<void> {
    await fetch("/api/data/songs", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(song),
    });
  },

  async getSong(id: string): Promise<SongTab | undefined> {
    const resp = await fetch(`/api/data/songs/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    if (!resp.ok) return undefined;
    const data = await resp.json();
    return data.song as SongTab;
  },

  async getAllSongs(): Promise<SongTab[]> {
    const resp = await fetch("/api/data/songs", { headers: authHeaders() });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.songs as SongTab[];
  },

  async deleteSong(id: string): Promise<void> {
    await fetch(`/api/data/songs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },

  async isSongSaved(id: string): Promise<boolean> {
    const resp = await fetch(`/api/data/songs/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    return resp.ok;
  },

  // --- Song state ---

  async saveSongState(songId: string, state: SongState): Promise<void> {
    await fetch(`/api/data/states/${encodeURIComponent(songId)}`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  },

  async getSongState(songId: string): Promise<SongState | undefined> {
    const resp = await fetch(`/api/data/states/${encodeURIComponent(songId)}`, {
      headers: authHeaders(),
    });
    if (!resp.ok) return undefined;
    const data = await resp.json();
    return data.state as SongState | undefined;
  },

  async deleteSongState(songId: string): Promise<void> {
    await fetch(`/api/data/states/${encodeURIComponent(songId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },

  // --- Setlists ---

  async createSetlist(name: string): Promise<Setlist> {
    const resp = await fetch("/api/data/setlists", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await resp.json();
    return data.setlist as Setlist;
  },

  async getAllSetlists(): Promise<Setlist[]> {
    const resp = await fetch("/api/data/setlists", { headers: authHeaders() });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.setlists as Setlist[];
  },

  async getSetlist(id: string): Promise<Setlist | undefined> {
    const resp = await fetch(`/api/data/setlists/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    if (!resp.ok) return undefined;
    const data = await resp.json();
    return data.setlist as Setlist;
  },

  async saveSetlist(setlist: Setlist): Promise<void> {
    await fetch(`/api/data/setlists/${encodeURIComponent(setlist.id)}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: setlist.name, songIds: setlist.songIds }),
    });
  },

  async renameSetlist(id: string, name: string): Promise<void> {
    await fetch(`/api/data/setlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", name }),
    });
  },

  async deleteSetlist(id: string): Promise<void> {
    await fetch(`/api/data/setlists/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },

  async addSongToSetlist(setlistId: string, songId: string): Promise<void> {
    await fetch(`/api/data/setlists/${encodeURIComponent(setlistId)}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addSong", songId }),
    });
  },

  async removeSongFromSetlist(setlistId: string, songId: string): Promise<void> {
    await fetch(`/api/data/setlists/${encodeURIComponent(setlistId)}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeSong", songId }),
    });
  },

  async moveSongInSetlist(
    setlistId: string,
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    await fetch(`/api/data/setlists/${encodeURIComponent(setlistId)}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", fromIndex, toIndex }),
    });
  },

  // --- Bulk sync ---
  // The server backend assembles a SyncPayload from the existing per-item
  // API routes. There is no dedicated bulk endpoint, so we fetch everything
  // and resolve song states per song.

  async exportAll(): Promise<SyncPayload> {
    const [songs, setlists] = await Promise.all([
      this.getAllSongs(),
      this.getAllSetlists(),
    ]);
    const states: { songId: string; state: SongState }[] = [];
    for (const song of songs) {
      const state = await this.getSongState(song.id);
      if (state) states.push({ songId: song.id, state });
    }
    return {
      version: 1,
      exportedAt: Date.now(),
      songs,
      states,
      setlists,
    };
  },

  async importAll(
    payload: SyncPayload,
    strategy: ImportStrategy
  ): Promise<ImportResult> {
    if (strategy === "replace") {
      // Clear existing data first.
      const existingSongs = await this.getAllSongs();
      const existingSetlists = await this.getAllSetlists();
      await Promise.all([
        ...existingSongs.map(s => this.deleteSong(s.id)),
        ...existingSetlists.map(sl => this.deleteSetlist(sl.id)),
      ]);
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

    // Songs — merge by newest savedAt (or replace).
    if (strategy === "replace") {
      for (const song of payload.songs) {
        await this.saveSong(song);
        added++;
      }
    } else {
      for (const song of payload.songs) {
        const existing = await this.getSong(song.id);
        if (!existing) {
          await this.saveSong(song);
          added++;
        } else if ((song.savedAt ?? 0) >= (existing.savedAt ?? 0)) {
          await this.saveSong(song);
          updated++;
        } else {
          skipped++;
        }
      }
    }

    // Song states — merge by newest updatedAt.
    for (const { songId, state } of payload.states) {
      if (strategy === "merge") {
        const existing = await this.getSongState(songId);
        if (existing && (existing.updatedAt ?? 0) > (state.updatedAt ?? 0)) {
          continue;
        }
      }
      await this.saveSongState(songId, state);
    }

    // Setlists — merge by newest updatedAt (or replace).
    if (strategy === "replace") {
      for (const sl of payload.setlists) {
        await this.saveSetlist(sl);
      }
    } else {
      for (const sl of payload.setlists) {
        const existing = await this.getSetlist(sl.id);
        if (!existing) {
          // The server's createSetlist generates a new id; create then update
          // its name + songIds via saveSetlist. The setlist id will differ
          // from the source, but songIds inside still resolve correctly.
          const created = await this.createSetlist(sl.name);
          await this.saveSetlist({
            ...sl,
            id: created.id,
          });
          added++;
        } else if ((sl.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
          await this.saveSetlist(sl);
          updated++;
        } else {
          skipped++;
        }
      }
    }

    return { added, updated, skipped };
  },
};
