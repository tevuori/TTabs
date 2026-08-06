"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SongTab } from "@/lib/types";
import { getSong, isSongSaved, saveSong, deleteSong } from "@/lib/storage";
import SongViewer from "@/components/SongViewer";

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [song, setSong] = useState<SongTab | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSong() {
      // First check if it's a saved song
      const savedSong = await getSong(id).catch(() => undefined);
      if (savedSong) {
        setSong(savedSong);
        setSaved(true);
        setLoading(false);
        return;
      }

      // Otherwise check sessionStorage (from search flow)
      const tabJson = sessionStorage.getItem("currentTab");
      if (tabJson) {
        try {
          const tab = JSON.parse(tabJson) as SongTab;
          if (tab.id === id) {
            setSong(tab);
            // Check if already saved
            const isSaved = await isSongSaved(id).catch(() => false);
            setSaved(isSaved);
            setLoading(false);
            return;
          }
        } catch {
          // fall through
        }
      }

      setError("Song not found. Try searching for it again.");
      setLoading(false);
    }
    loadSong();
  }, [id]);

  const handleSaveToggle = useCallback(async () => {
    if (!song) return;
    if (saved) {
      await deleteSong(song.id);
      setSaved(false);
    } else {
      await saveSong(song);
      setSaved(true);
    }
  }, [song, saved]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-text-muted">{error || "Song not found"}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
        >
          Back to Search
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-bg-border sticky top-0 bg-bg/90 backdrop-blur-sm z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Search
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/library")}
              className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors"
            >
              Library
            </button>
          </div>
        </div>
      </header>

      <SongViewer song={song} isSaved={saved} onSaveToggle={() => setSaved(true)} />
    </div>
  );
}
