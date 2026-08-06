"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { SongTab } from "@/lib/types";
import {
  getAllSongs,
  getAllSetlists,
  createSetlist,
  deleteSetlist,
  renameSetlist,
  getSetlist,
  addSongToSetlist,
  removeSongFromSetlist,
  moveSongInSetlist,
  Setlist,
} from "@/lib/storage";
import { AuthGuard } from "@/components/AuthGuard";
import Header from "@/components/Header";

export default function SetlistsPage() {
  const router = useRouter();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [songs, setSongs] = useState<SongTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showAddSongs, setShowAddSongs] = useState(false);

  const refresh = useCallback(async () => {
    const [lists, allSongs] = await Promise.all([
      getAllSetlists().catch(() => [] as Setlist[]),
      getAllSongs().catch(() => [] as SongTab[]),
    ]);
    setSetlists(lists);
    setSongs(allSongs);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeSetlist = useMemo(
    () => setlists.find(s => s.id === activeId) || null,
    [setlists, activeId]
  );

  // Songs in the active setlist, resolved to full SongTab objects in order.
  const setlistSongs = useMemo(() => {
    if (!activeSetlist) return [];
    const byId = new Map(songs.map(s => [s.id, s]));
    return activeSetlist.songIds
      .map(id => byId.get(id))
      .filter((s): s is SongTab => !!s);
  }, [activeSetlist, songs]);

  // Songs in the library that aren't yet in the active setlist.
  const availableSongs = useMemo(() => {
    if (!activeSetlist) return [];
    const inList = new Set(activeSetlist.songIds);
    return songs.filter(s => !inList.has(s.id));
  }, [activeSetlist, songs]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const created = await createSetlist(newName);
    setNewName("");
    await refresh();
    setActiveId(created.id);
  }, [newName, refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSetlist(id);
      if (activeId === id) setActiveId(null);
      await refresh();
    },
    [activeId, refresh]
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!renameValue.trim()) {
        setRenamingId(null);
        return;
      }
      await renameSetlist(id, renameValue);
      setRenamingId(null);
      setRenameValue("");
      await refresh();
    },
    [renameValue, refresh]
  );

  const handleAddSong = useCallback(
    async (songId: string) => {
      if (!activeSetlist) return;
      await addSongToSetlist(activeSetlist.id, songId);
      await refresh();
    },
    [activeSetlist, refresh]
  );

  const handleRemoveSong = useCallback(
    async (songId: string) => {
      if (!activeSetlist) return;
      await removeSongFromSetlist(activeSetlist.id, songId);
      await refresh();
    },
    [activeSetlist, refresh]
  );

  const handleMove = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!activeSetlist) return;
      await moveSongInSetlist(activeSetlist.id, fromIndex, toIndex);
      await refresh();
    },
    [activeSetlist, refresh]
  );

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-2">Setlists</h1>
        <p className="text-text-muted text-sm mb-6">
          Group saved songs into ordered setlists for gigs or practice.
        </p>

        {/* Create new setlist */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="New setlist name..."
            className="flex-1 px-4 py-2.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl text-sm transition-colors"
          >
            Create
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : setlists.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-sm mb-1">No setlists yet.</p>
            <p className="text-text-dim text-xs">Create one above to start grouping your songs.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* Setlist list */}
            <div className="space-y-2">
              {setlists.map(sl => (
                <div
                  key={sl.id}
                  className={`group rounded-xl border p-3 transition-all cursor-pointer ${
                    activeId === sl.id
                      ? "bg-bg-card border-accent/40"
                      : "bg-bg-card border-bg-border hover:border-accent/40"
                  }`}
                  onClick={() => setActiveId(sl.id)}
                >
                  {renamingId === sl.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRename(sl.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => handleRename(sl.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-full px-2 py-1 bg-bg-hover border border-accent rounded text-text text-sm focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-text font-semibold text-sm truncate">{sl.name}</h3>
                        <p className="text-text-dim text-xs">{sl.songIds.length} song{sl.songIds.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setRenamingId(sl.id);
                            setRenameValue(sl.name);
                          }}
                          className="p-1.5 text-text-dim hover:text-accent transition-colors"
                          title="Rename"
                        >
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 11L2 9L9 2L11 4L4 11H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDelete(sl.id);
                          }}
                          className="p-1.5 text-text-dim hover:text-red-400 transition-colors"
                          title="Delete setlist"
                        >
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M3 4H10M5 4V3C5 2.5 5.5 2 6 2H7C7.5 2 8 2.5 8 3V4M4 4V11C4 11.5 4.5 12 5 12H8C8.5 12 9 11.5 9 11V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Active setlist detail */}
            <div>
              {!activeSetlist ? (
                <div className="text-center py-16 text-text-muted text-sm">
                  Select a setlist to view its songs.
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h2 className="text-text font-bold text-lg">{activeSetlist.name}</h2>
                    <button
                      onClick={() => setShowAddSongs(s => !s)}
                      className="px-3 py-1.5 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-lg text-text-muted text-sm transition-colors flex items-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Add songs
                    </button>
                  </div>

                  {/* Add-songs panel */}
                  {showAddSongs && (
                    <div className="mb-4 bg-bg-card border border-bg-border rounded-xl p-3 max-h-64 overflow-y-auto">
                      {availableSongs.length === 0 ? (
                        <p className="text-text-muted text-sm text-center py-4">
                          No more saved songs to add. Save songs to your library first.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {availableSongs.map(song => (
                            <button
                              key={song.id}
                              onClick={() => handleAddSong(song.id)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-bg-hover hover:bg-bg-border rounded-lg text-left transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-text text-sm font-medium truncate">{song.songName}</p>
                                <p className="text-text-muted text-xs truncate">{song.artistName}</p>
                              </div>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent flex-shrink-0">
                                <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Setlist songs (ordered) */}
                  {setlistSongs.length === 0 ? (
                    <div className="text-center py-12 text-text-muted text-sm">
                      This setlist is empty. Click &quot;Add songs&quot; to populate it.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {setlistSongs.map((song, idx) => (
                        <div
                          key={song.id}
                          className="group flex items-center gap-2 sm:gap-3 bg-bg-card border border-bg-border rounded-xl p-3"
                        >
                          {/* Reorder controls */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => handleMove(idx, idx - 1)}
                              disabled={idx === 0}
                              className="w-6 h-5 flex items-center justify-center text-text-dim hover:text-accent disabled:opacity-30 disabled:hover:text-text-dim transition-colors"
                              title="Move up"
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 6L5 3L8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleMove(idx, idx + 1)}
                              disabled={idx === setlistSongs.length - 1}
                              className="w-6 h-5 flex items-center justify-center text-text-dim hover:text-accent disabled:opacity-30 disabled:hover:text-text-dim transition-colors"
                              title="Move down"
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>

                          <span className="text-text-dim text-xs font-mono w-6 text-center">{idx + 1}</span>

                          <button
                            onClick={() => router.push(`/song/${encodeURIComponent(song.id)}`)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="text-text font-semibold text-sm truncate group-hover:text-accent transition-colors">{song.songName}</p>
                            <p className="text-text-muted text-xs truncate">{song.artistName}</p>
                          </button>

                          <button
                            onClick={() => handleRemoveSong(song.id)}
                            className="p-2 text-text-dim hover:text-red-400 transition-colors"
                            title="Remove from setlist"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Export to text */}
                  {setlistSongs.length > 0 && (
                    <button
                      onClick={() => {
                        const text = `${activeSetlist.name}\n\n${setlistSongs
                          .map((s, i) => `${i + 1}. ${s.songName} — ${s.artistName}`)
                          .join("\n")}`;
                        navigator.clipboard.writeText(text).catch(() => {
                          window.prompt("Copy setlist:", text);
                        });
                      }}
                      className="mt-4 text-text-muted hover:text-accent text-xs transition-colors"
                    >
                      Copy setlist as text
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </main>
      </div>
    </AuthGuard>
  );
}
