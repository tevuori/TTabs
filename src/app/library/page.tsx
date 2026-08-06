"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { SongTab } from "@/lib/types";
import { getAllSongs, deleteSong } from "@/lib/storage";
import { BEGINNER_CHORDS, songUsesOnlyKnownChords } from "@/lib/chords";

export default function LibraryPage() {
  const router = useRouter();
  const [songs, setSongs] = useState<SongTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [beginnerMode, setBeginnerMode] = useState(false);
  const [knownChords, setKnownChords] = useState("");

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllSongs();
      setSongs(all);
    } catch (e) {
      console.error("Failed to load songs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSong(id);
      setSongs(prev => prev.filter(s => s.id !== id));
    },
    []
  );

  // Parse the user's "chords I know" input into a list.
  const knownChordList = useMemo(() => {
    const trimmed = knownChords.trim();
    if (!trimmed) return [] as string[];
    return trimmed
      .split(/[,\s]+/)
      .map(c => c.trim())
      .filter(Boolean);
  }, [knownChords]);

  const filtered = useMemo(() => {
    return songs.filter(s => {
      // Text filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !s.songName.toLowerCase().includes(q) &&
          !s.artistName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      // Beginner mode: only songs using the beginner chord vocabulary.
      if (beginnerMode) {
        if (!songUsesOnlyKnownChords(s.chords || [], BEGINNER_CHORDS)) return false;
      }
      // "Chords I know" filter: only songs whose chords are all known.
      if (knownChordList.length > 0) {
        if (!songUsesOnlyKnownChords(s.chords || [], knownChordList)) return false;
      }
      return true;
    });
  }, [songs, searchQuery, beginnerMode, knownChordList]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-bg-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 3V15M9 3V15M13 3V15M3 6H15M3 10H15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-xl font-bold text-text">TTabs</span>
          </div>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors"
            >
              Search
            </button>
            <button
              onClick={() => router.push("/library")}
              className="px-3 py-1.5 text-sm font-medium text-text hover:text-accent transition-colors"
            >
              Library
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">My Library</h1>
          <span className="text-text-muted text-sm">{songs.length} saved</span>
        </div>

        {/* Search filter */}
        {songs.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
                <path d="M11 11L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter library..."
                className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm"
              />
            </div>

            {/* Chord filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Beginner mode toggle */}
              <button
                onClick={() => setBeginnerMode(b => !b)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  beginnerMode
                    ? "bg-accent/15 border-accent text-accent"
                    : "bg-bg-card border-bg-border text-text-muted hover:text-text"
                }`}
                title="Only show songs using common beginner open chords"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M5 3V15M9 3V15M13 3V15M3 6H15M3 10H15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Beginner mode
              </button>

              {/* "Chords I know" input */}
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M5 3V15M9 3V15M13 3V15M3 6H15M3 10H15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="text"
                  value={knownChords}
                  onChange={e => setKnownChords(e.target.value)}
                  placeholder="Songs I can play with: G, C, D, Em..."
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm"
                />
              </div>
            </div>

            {(beginnerMode || knownChordList.length > 0) && (
              <p className="text-text-dim text-xs">
                Showing {filtered.length} of {songs.length} songs matching your chord filters.
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            {songs.length === 0 ? (
              <>
                <div className="w-16 h-16 bg-bg-card border border-bg-border rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-text-dim">
                    <path d="M6 4V24M10 4V24M14 4V24M4 8H16M4 14H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-text font-semibold text-lg mb-2">No saved songs yet</h2>
                <p className="text-text-muted text-sm mb-4">
                  Search for songs and save them to your library
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
                >
                  Search Songs
                </button>
              </>
            ) : (
              <p className="text-text-muted">No songs match your filter</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(song => (
              <div
                key={song.id}
                className="group bg-bg-card hover:bg-bg-hover border border-bg-border hover:border-accent/40 rounded-xl p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => router.push(`/song/${encodeURIComponent(song.id)}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <h3 className="text-text font-semibold truncate group-hover:text-accent transition-colors">
                      {song.songName}
                    </h3>
                    <p className="text-text-muted text-sm truncate">{song.artistName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {song.key && (
                        <span className="text-xs text-text-dim font-mono">
                          Key: <span className="text-text-muted">{song.key}</span>
                        </span>
                      )}
                      {song.capo !== null && (
                        <span className="text-xs text-text-dim font-mono">
                          Capo: <span className="text-text-muted">{song.capo}</span>
                        </span>
                      )}
                      {song.transposition && song.transposition !== 0 && (
                        <span className="text-xs text-accent font-mono">
                          Transpose: {song.transposition > 0 ? "+" : ""}{song.transposition}
                        </span>
                      )}
                      <span className="text-xs text-text-dim capitalize">
                        {song.type}
                      </span>
                    </div>
                    {song.chords && song.chords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {song.chords.slice(0, 12).map(c => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 bg-bg-hover rounded text-[10px] font-mono text-text-muted"
                          >
                            {c}
                          </span>
                        ))}
                        {song.chords.length > 12 && (
                          <span className="text-[10px] text-text-dim py-0.5">
                            +{song.chords.length - 12}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/song/${encodeURIComponent(song.id)}`)}
                      className="p-2 text-text-muted hover:text-accent transition-colors"
                      title="Open"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(song.id)}
                      className="p-2 text-text-muted hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4H13M6 4V3C6 2.5 6.5 2 7 2H9C9.5 2 10 2.5 10 3V4M5 4V13C5 13.5 5.5 14 6 14H10C10.5 14 11 13.5 11 13V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
