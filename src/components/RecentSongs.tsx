"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRecentSongs, removeRecentSong, clearRecentSongs, RecentSong } from "@/lib/recent";

// "Continue playing" row shown on the home page — lists recently opened songs.
export default function RecentSongs() {
  const router = useRouter();
  const [songs, setSongs] = useState<RecentSong[]>([]);

  useEffect(() => {
    setSongs(getRecentSongs());
  }, []);

  // Re-read when the home page regains focus (e.g. returning from a song).
  useEffect(() => {
    const onFocus = () => setSongs(getRecentSongs());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (songs.length === 0) return null;

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    removeRecentSong(id);
    setSongs(getRecentSongs());
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider">
          Continue playing
        </h2>
        <button
          onClick={() => {
            clearRecentSongs();
            setSongs([]);
          }}
          className="text-text-dim hover:text-accent text-xs transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {songs.map(song => (
          <button
            key={song.id}
            onClick={() => router.push(`/song/${encodeURIComponent(song.id)}`)}
            className="group relative flex-shrink-0 w-56 text-left bg-bg-card hover:bg-bg-hover border border-bg-border hover:border-accent/40 rounded-xl p-3 transition-all"
          >
            <h3 className="text-text font-semibold text-sm truncate group-hover:text-accent transition-colors">
              {song.songName}
            </h3>
            <p className="text-text-muted text-xs truncate">{song.artistName}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {song.key && (
                <span className="text-[10px] text-text-dim font-mono">
                  Key: <span className="text-text-muted">{song.key}</span>
                </span>
              )}
              {song.capo !== null && song.capo > 0 && (
                <span className="text-[10px] text-text-dim font-mono">
                  Capo: <span className="text-text-muted">{song.capo}</span>
                </span>
              )}
              <span className="text-[10px] text-text-dim capitalize">{song.type}</span>
            </div>
            <span
              onClick={e => handleRemove(e, song.id)}
              className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Remove from recent"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
