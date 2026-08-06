"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface YouTubeResult {
  id: string;
  title: string;
  author: string;
}

interface YouTubePlayerProps {
  // The search query (typically "Artist Name Song Name").
  query: string;
}

// Loads the YouTube IFrame API once.
let apiLoaded = false;
let apiLoading: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise<void>(resolve => {
    if (typeof window === "undefined") return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady =
      () => {
        apiLoaded = true;
        resolve();
      };
  });
  return apiLoading;
}

// A YouTube player with A/B section looping.
// Lets the user search for a video, play it, and set loop start/end points.
export default function YouTubePlayer({ query }: YouTubePlayerProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);

  const playerRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeTimerRef = useRef<number | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const resp = await fetch(`/api/youtube?q=${encodeURIComponent(query)}`);
      const data = await resp.json();
      if (!resp.ok) {
        setSearchError(data.error || "Search failed");
        setResults([]);
      } else {
        setResults(data.results || []);
        if ((data.results || []).length === 0 && data.error) {
          setSearchError(data.error);
        }
      }
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, [query]);

  // Create the player when a video is selected.
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;

    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as unknown as { YT?: { Player: new (...args: unknown[]) => unknown } }).YT;
      if (!YT) return;

      // Destroy any existing player.
      if (playerRef.current && typeof (playerRef.current as { destroy?: () => void }).destroy === "function") {
        (playerRef.current as { destroy: () => void }).destroy();
        playerRef.current = null;
      }

      playerRef.current = new YT.Player(containerRef.current, {
        videoId: selectedId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            setReady(true);
            const p = playerRef.current as { getDuration: () => number; getCurrentTime: () => number };
            setDuration(p.getDuration());
          },
          onStateChange: (e: { data: number }) => {
            // 1 = playing, 2 = paused, 0 = ended
            setPlaying(e.data === 1);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (timeTimerRef.current !== null) {
        clearInterval(timeTimerRef.current);
        timeTimerRef.current = null;
      }
      if (playerRef.current && typeof (playerRef.current as { destroy?: () => void }).destroy === "function") {
        (playerRef.current as { destroy: () => void }).destroy();
        playerRef.current = null;
      }
      setReady(false);
    };
  }, [selectedId]);

  // Poll current time and enforce the A/B loop.
  useEffect(() => {
    if (!ready || !playing) {
      if (timeTimerRef.current !== null) {
        clearInterval(timeTimerRef.current);
        timeTimerRef.current = null;
      }
      return;
    }
    timeTimerRef.current = window.setInterval(() => {
      const p = playerRef.current as {
        getCurrentTime: () => number;
        seekTo: (s: number, allow: boolean) => void;
      } | null;
      if (!p) return;
      const t = p.getCurrentTime();
      setCurrentTime(t);
      if (looping && loopA !== null && loopB !== null && t >= loopB) {
        p.seekTo(loopA, true);
      }
    }, 250);
    return () => {
      if (timeTimerRef.current !== null) {
        clearInterval(timeTimerRef.current);
        timeTimerRef.current = null;
      }
    };
  }, [ready, playing, looping, loopA, loopB]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current as { playVideo?: () => void; pauseVideo?: () => void } | null;
    if (!p) return;
    if (playing) p.pauseVideo?.();
    else p.playVideo?.();
  }, [playing]);

  const seekTo = useCallback((seconds: number) => {
    const p = playerRef.current as { seekTo?: (s: number, allow: boolean) => void } | null;
    p?.seekTo?.(seconds, true);
    setCurrentTime(seconds);
  }, []);

  const setMarkA = useCallback(() => {
    const p = playerRef.current as { getCurrentTime?: () => number } | null;
    const t = p?.getCurrentTime?.() ?? currentTime;
    setLoopA(t);
    if (loopB !== null && t >= loopB) setLoopB(null);
  }, [currentTime, loopB]);

  const setMarkB = useCallback(() => {
    const p = playerRef.current as { getCurrentTime?: () => number } | null;
    const t = p?.getCurrentTime?.() ?? currentTime;
    if (loopA !== null && t > loopA) {
      setLoopB(t);
      setLooping(true);
    }
  }, [currentTime, loopA]);

  const clearLoop = useCallback(() => {
    setLoopA(null);
    setLoopB(null);
    setLooping(false);
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          if (results.length === 0 && !searching) handleSearch();
        }}
        className="flex items-center gap-2 px-3 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
        title="Find a YouTube video and loop a section"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4L12 8L6 12V4Z" />
        </svg>
        YouTube
      </button>
    );
  }

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-3 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text font-semibold text-sm flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="#f97316">
            <path d="M6 4L12 7L6 10V4Z" />
          </svg>
          YouTube sync &amp; loop
        </span>
        <button
          onClick={() => setOpen(false)}
          className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text rounded transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!selectedId ? (
        <>
          {searching ? (
            <div className="flex items-center gap-2 py-4">
              <div className="w-5 h-5 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
              <span className="text-text-muted text-sm">Searching YouTube...</span>
            </div>
          ) : searchError && results.length === 0 ? (
            <p className="text-text-muted text-sm py-2">{searchError}</p>
          ) : results.length === 0 ? (
            <p className="text-text-muted text-sm py-2">No videos found.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="w-full flex items-center gap-3 px-2 py-2 bg-bg-hover hover:bg-bg-border rounded-lg text-left transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="#f97316" className="flex-shrink-0">
                    <path d="M8 5L15 10L8 15V5Z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-text text-sm truncate">{r.title}</p>
                    {r.author && <p className="text-text-muted text-xs truncate">{r.author}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handleSearch}
            disabled={searching}
            className="mt-2 text-text-dim hover:text-accent text-xs transition-colors"
          >
            ↻ Search again
          </button>
        </>
      ) : (
        <div>
          {/* Player */}
          <div className="relative w-full mb-3" style={{ aspectRatio: "16 / 9" }}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full rounded-lg overflow-hidden" />
          </div>

          {/* Transport */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={togglePlay}
              disabled={!ready}
              className="w-9 h-9 flex items-center justify-center bg-accent hover:bg-accent-hover disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="3" height="8" rx="1" />
                  <rect x="7" y="2" width="3" height="8" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 1L11 6L2 11V1Z" />
                </svg>
              )}
            </button>
            <span className="text-text-muted text-xs font-mono">
              {fmt(currentTime)} / {fmt(duration)}
            </span>
            <button
              onClick={() => setSelectedId(null)}
              className="ml-auto text-text-dim hover:text-accent text-xs transition-colors"
            >
              Change video
            </button>
          </div>

          {/* A/B loop controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={setMarkA}
              disabled={!ready}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                loopA !== null ? "bg-accent/15 text-accent border border-accent/40" : "bg-bg-hover text-text-muted hover:text-text"
              }`}
            >
              Set A {loopA !== null && `(${fmt(loopA)})`}
            </button>
            <button
              onClick={setMarkB}
              disabled={!ready || loopA === null}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                loopB !== null ? "bg-accent/15 text-accent border border-accent/40" : "bg-bg-hover text-text-muted hover:text-text disabled:opacity-40"
              }`}
            >
              Set B {loopB !== null && `(${fmt(loopB)})`}
            </button>
            <button
              onClick={() => setLooping(l => !l)}
              disabled={loopA === null || loopB === null}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                looping ? "bg-accent text-white" : "bg-bg-hover text-text-muted hover:text-text"
              }`}
            >
              {looping ? "Looping on" : "Loop off"}
            </button>
            {(loopA !== null || loopB !== null) && (
              <button
                onClick={clearLoop}
                className="px-2.5 py-1.5 text-text-dim hover:text-accent text-xs transition-colors"
              >
                Clear
              </button>
            )}
            {loopA !== null && (
              <button onClick={() => seekTo(loopA)} className="text-text-dim hover:text-accent text-xs transition-colors">
                ↺ Jump to A
              </button>
            )}
          </div>
          {loopA !== null && loopB !== null && (
            <p className="text-text-dim text-xs mt-2">
              Looping {fmt(loopA)} → {fmt(loopB)} ({fmt(loopB - loopA)} long)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
