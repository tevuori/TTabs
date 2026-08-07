"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SongTab, SongState } from "@/lib/types";
import { getSong, isSongSaved, saveSong, deleteSong } from "@/lib/storage";
import { addRecentSong } from "@/lib/recent";
import { decodeStateFromQuery } from "@/lib/share";
import { IS_MOBILE } from "@/lib/app-mode";
import SongViewer from "@/components/SongViewer";
import Header from "@/components/Header";
import { AuthGuard } from "@/components/AuthGuard";

// Extract the song ID from the URL path.
// In Capacitor's WebView, the `params` Promise from Next.js may not update
// correctly on client-side navigation for dynamic routes in a static export.
// Parsing the pathname directly is more reliable.
function getSongIdFromPath(pathname: string): string {
  // Path is like "/song/abc123" or "/song/abc123/" (with trailing slash)
  const match = pathname.match(/^\/song\/(.+?)\/?$/);
  if (match) return decodeURIComponent(match[1]);
  return "";
}

export default function SongPageClient({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  // Use the pathname to get the real ID — more reliable than `use(params)`
  // in Capacitor's WebView with static export.
  const id = getSongIdFromPath(pathname);
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
    if (!id) {
      setError("Invalid song ID");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSong() {
      console.log("[SongPage] Loading song, id:", id);

      // Add a timeout — if getSong hangs (e.g. IndexedDB issue),
      // show an error instead of spinning forever.
      const timeout = new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), 10000)
      );

      const savedSong = await Promise.race([
        getSong(id).catch((e) => {
          console.error("[SongPage] getSong error:", e);
          return undefined;
        }),
        timeout,
      ]);

      if (cancelled) return;

      if (savedSong) {
        console.log("[SongPage] Found saved song:", savedSong.songName);
        setSong(savedSong);
        setSaved(true);
        setLoading(false);
        addRecentSong(savedSong);
        return;
      }

      console.log("[SongPage] Song not found in storage, checking sessionStorage");

      // Otherwise check sessionStorage (from search flow)
      const tabJson = sessionStorage.getItem("currentTab");
      if (tabJson) {
        try {
          const tab = JSON.parse(tabJson) as SongTab;
          if (tab.id === id) {
            setSong(tab);
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

      console.error("[SongPage] Song not found, id:", id);
      setError("Song not found. Try searching for it again.");
      setLoading(false);
    }
    loadSong();

    return () => { cancelled = true; };
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
          onClick={() => router.push(IS_MOBILE ? "/library" : "/")}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
        >
          {IS_MOBILE ? "Back to Library" : "Back to Search"}
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
