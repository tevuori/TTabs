"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SongTab, SongState } from "@/lib/types";
import { getSong, isSongSaved, saveSong, deleteSong } from "@/lib/storage";
import { addRecentSong } from "@/lib/recent";
import { decodeStateFromQuery } from "@/lib/share";
import SongViewer from "@/components/SongViewer";
import Header from "@/components/Header";
import { AuthGuard } from "@/components/AuthGuard";

export default function SongPageClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [song, setSong] = useState<SongTab | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<Partial<SongState> | null>(null);

  // Parse any shared state from the URL once on mount.
  useEffect(() => {
    const fromUrl = decodeStateFromQuery(window.location.search);
    if (fromUrl) setInitialState(fromUrl);
  }, []);

  useEffect(() => {
    async function loadSong() {
      // First check if it's a saved song
      const savedSong = await getSong(id).catch(() => undefined);
      if (savedSong) {
        setSong(savedSong);
        setSaved(true);
        setLoading(false);
        addRecentSong(savedSong);
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
            addRecentSong(tab);
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
    <AuthGuard>
      <div className="min-h-screen">
        <Header />

        <SongViewer
          song={song}
          isSaved={saved}
          onSaveToggle={() => setSaved(true)}
          initialState={initialState}
        />
      </div>
    </AuthGuard>
  );
}
