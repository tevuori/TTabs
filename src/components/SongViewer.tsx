"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SongTab, ChordFingering, ParsedLine, SongState, ViewMode } from "@/lib/types";
import { parseTabContent } from "@/lib/content-parser";
import { transposeChord, shouldUseFlats } from "@/lib/chords";
import { getChordFingerings, getChordShapes } from "@/lib/chord-shapes";
import { playChord, unlockAudio } from "@/lib/audio";
import { SongPlayer, extractPlaybackChords } from "@/lib/playback";
import { parseLrc, alignLyrics, lineAtTime, type LyricAlignment } from "@/lib/lyrics";
import { saveSong, saveSongState, getSongState, deleteSongState } from "@/lib/storage";
import { buildShareableUrl } from "@/lib/share";
import ChordToken from "./ChordToken";
import ChordDiagram from "./ChordDiagram";
import TransposeControls from "./TransposeControls";
import YouTubePlayer from "./YouTubePlayer";

interface SongViewerProps {
  song: SongTab;
  isSaved: boolean;
  onSaveToggle: () => void;
  initialState?: Partial<SongState> | null;
}

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 22;

export default function SongViewer({ song, isSaved, onSaveToggle, initialState }: SongViewerProps) {
  const [transposition, setTransposition] = useState(0);
  const [chordOverrides, setChordOverrides] = useState<Record<string, number>>({});
  const [capoOverride, setCapoOverride] = useState<number | null>(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [showAllChords, setShowAllChords] = useState(true);

  // New Tier 1 UI state
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [autoscroll, setAutoscroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3); // 1 (slow) .. 10 (fast)

  // Tier 3: song playback
  const [playbackBpm, setPlaybackBpm] = useState(80);
  const [beatsPerChord, setBeatsPerChord] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [activePlaybackLine, setActivePlaybackLine] = useState<number | null>(null);
  const playerRef = useRef<import("@/lib/playback").SongPlayer | null>(null);

  // Synced-lyrics scroll
  const [lyricsStatus, setLyricsStatus] = useState<"idle" | "fetching" | "found" | "none" | "error">("idle");
  const [lyricsAlignments, setLyricsAlignments] = useState<LyricAlignment[]>([]);
  const [syncScroll, setSyncScroll] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0); // seconds, user-adjustable
  const [activeSyncLine, setActiveSyncLine] = useState<number | null>(null);
  const [ytClockActive, setYtClockActive] = useState(false);
  const [syncPaused, setSyncPaused] = useState(false);
  const syncScrollRef = useRef(false);
  const syncOffsetRef = useRef(0);
  const syncAlignmentsRef = useRef<LyricAlignment[]>([]);
  const syncRafRef = useRef<number | null>(null);
  const syncStartRef = useRef(0); // performance.now() reference for internal clock
  const syncPausedRef = useRef(false);
  const syncPauseTimeRef = useRef(0); // accumulated paused duration in ms
  const syncPauseStartRef = useRef(0); // when the current pause started
  const ytTimeRef = useRef<number | null>(null); // YouTube player time (master clock when available)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Load saved state on mount. URL-provided initialState (from a shared link)
  // takes priority over the locally saved state.
  useEffect(() => {
    if (song.id) {
      getSongState(song.id).then(state => {
        if (state) {
          setTransposition(state.transposition || 0);
          setChordOverrides(state.chordOverrides || {});
          setCapoOverride(state.capoOverride ?? null);
          if (typeof state.fontSize === "number") setFontSize(state.fontSize);
          if (state.viewMode) setViewMode(state.viewMode);
        }
        // Apply URL state last so it wins.
        if (initialState) {
          if (typeof initialState.transposition === "number") setTransposition(initialState.transposition);
          if (initialState.chordOverrides) setChordOverrides(initialState.chordOverrides);
          if (initialState.capoOverride !== undefined) setCapoOverride(initialState.capoOverride);
          if (typeof initialState.fontSize === "number") setFontSize(initialState.fontSize);
          if (initialState.viewMode) setViewMode(initialState.viewMode);
        }
        setStateLoaded(true);
      });
    } else {
      setStateLoaded(true);
    }
  }, [song.id, initialState]);

  // Auto-save state when it changes (after initial load)
  useEffect(() => {
    if (!stateLoaded || !song.id) return;
    const state: SongState = {
      transposition,
      chordOverrides,
      capoOverride,
      fontSize,
      viewMode,
      updatedAt: Date.now(),
    };
    saveSongState(song.id, state);
  }, [transposition, chordOverrides, capoOverride, fontSize, viewMode, stateLoaded, song.id]);

  // Parse the tab content
  const parsedLines = useMemo(() => parseTabContent(song.content), [song.content]);

  // Fetch synced lyrics from LRCLib when the song loads.
  useEffect(() => {
    setLyricsStatus("fetching");
    setLyricsAlignments([]);
    setSyncScroll(false);
    let cancelled = false;
    fetch(`/api/lyrics?track_name=${encodeURIComponent(song.songName)}&artist_name=${encodeURIComponent(song.artistName)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.error) {
          setLyricsStatus("error");
          return;
        }
        if (data.instrumental) {
          setLyricsStatus("none");
          return;
        }
        if (!data.syncedLyrics) {
          setLyricsStatus("none");
          return;
        }
        const lrcLines = parseLrc(data.syncedLyrics);
        if (lrcLines.length === 0) {
          setLyricsStatus("none");
          return;
        }
        const alignments = alignLyrics(lrcLines, parsedLines);
        if (alignments.length < 3) {
          // Too few matches to be useful — alignment probably failed.
          setLyricsStatus("none");
          return;
        }
        setLyricsAlignments(alignments);
        setLyricsStatus("found");
      })
      .catch(() => {
        if (!cancelled) setLyricsStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [song.songName, song.artistName, parsedLines]);

  // Keep refs in sync for the rAF loop.
  useEffect(() => {
    syncScrollRef.current = syncScroll;
  }, [syncScroll]);
  useEffect(() => {
    syncOffsetRef.current = lyricsOffset;
  }, [lyricsOffset]);
  useEffect(() => {
    syncAlignmentsRef.current = lyricsAlignments;
  }, [lyricsAlignments]);
  useEffect(() => {
    syncPausedRef.current = syncPaused;
    if (syncPaused) {
      syncPauseStartRef.current = performance.now();
    } else if (syncPauseStartRef.current > 0) {
      syncPauseTimeRef.current += performance.now() - syncPauseStartRef.current;
      syncPauseStartRef.current = 0;
    }
  }, [syncPaused]);

  // Determine the effective key (with transposition)
  const useFlats = shouldUseFlats(song.key);
  const transposedKey = useMemo(() => {
    if (!song.key) return null;
    // Transpose the key note
    const keyMatch = song.key.match(/^([A-G])(#|b)?(m?)$/);
    if (!keyMatch) return song.key;
    const [, letter, accidental, minor] = keyMatch;
    const note = letter + (accidental || "");
    const transposed = transposeChord(note, transposition, useFlats);
    return transposed + (minor || "");
  }, [song.key, transposition, useFlats]);

  // Transpose function for current context
  const transposeFn = useCallback(
    (chord: string) => transposeChord(chord, transposition, useFlats),
    [transposition, useFlats]
  );

  // Get the display name for a chord (with transposition applied)
  const getDisplayChord = useCallback(
    (originalChord: string) => {
      if (transposition === 0) return originalChord;
      return transposeFn(originalChord);
    },
    [transposition, transposeFn]
  );

  // Get fingerings for a chord (considering transposition and overrides)
  const getChordWithFingerings = useCallback(
    (originalChord: string): { displayName: string; fingerings: ChordFingering[]; selectedIndex: number } => {
      const displayName = getDisplayChord(originalChord);

      // Get fingerings: use UG applicature for non-transposed, chords-db for transposed
      let fingerings: ChordFingering[];
      if (transposition === 0 && song.applicature[originalChord]) {
        fingerings = getChordFingerings(originalChord, song.applicature);
      } else {
        fingerings = getChordShapes(displayName);
        // If chords-db doesn't have it, try UG applicature as fallback
        if (fingerings.length === 0 && song.applicature[originalChord]) {
          fingerings = song.applicature[originalChord];
        }
      }

      const selectedIndex = chordOverrides[originalChord] || 0;
      return { displayName, fingerings, selectedIndex };
    },
    [transposition, song.applicature, chordOverrides, getDisplayChord]
  );

  // Handle chord alternative selection
  const handleChordSelect = useCallback((originalChord: string, index: number) => {
    setChordOverrides(prev => ({ ...prev, [originalChord]: index }));
  }, []);

  // Reset transposition and chord overrides
  const handleReset = useCallback(() => {
    setTransposition(0);
    setChordOverrides({});
    setCapoOverride(null);
  }, []);

  // Save state explicitly (also saves the song)
  const handleSaveState = useCallback(async () => {
    if (song.id) {
      await saveSong({ ...song, transposition, chordOverrides, capoOverride });
      await saveSongState(song.id, {
        transposition,
        chordOverrides,
        capoOverride,
        fontSize,
        viewMode,
        updatedAt: Date.now(),
      });
      onSaveToggle();
    }
  }, [song, transposition, chordOverrides, capoOverride, fontSize, viewMode, onSaveToggle]);

  // Clear saved state
  const handleClearState = useCallback(async () => {
    if (song.id) {
      await deleteSongState(song.id);
      setTransposition(0);
      setChordOverrides({});
      setCapoOverride(null);
      setFontSize(DEFAULT_FONT_SIZE);
      setViewMode("both");
    }
  }, [song.id]);

  const effectiveCapo = capoOverride !== null ? capoOverride : song.capo;

  // Play a chord preview (uses the effective capo)
  const handlePlayChord = useCallback(
    (fingering: ChordFingering) => {
      unlockAudio();
      playChord(fingering, { capo: effectiveCapo ?? 0 });
    },
    [effectiveCapo]
  );

  // --- Shareable link ---
  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const path = buildShareableUrl(song.id, {
      transposition,
      chordOverrides,
      capoOverride,
      fontSize,
      viewMode,
    });
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      // Fallback: select the URL in a prompt so the user can copy manually.
      window.prompt("Copy this link to share:", url);
    }
  }, [song.id, transposition, chordOverrides, capoOverride, fontSize, viewMode]);

  // Unique chords for the chord summary section
  const uniqueChords = useMemo(() => {
    const set = new Set<string>();
    for (const line of parsedLines) {
      if (line.type === "chord") {
        for (const seg of line.segments) {
          if (seg.chord) set.add(seg.chord);
        }
      }
    }
    return Array.from(set);
  }, [parsedLines]);

  // --- Autoscroll ---
  const autoscrollRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const stopAutoscroll = useCallback(() => {
    if (autoscrollRef.current !== null) {
      cancelAnimationFrame(autoscrollRef.current);
      autoscrollRef.current = null;
    }
    setAutoscroll(false);
  }, []);

  useEffect(() => {
    if (!autoscroll) {
      if (autoscrollRef.current !== null) {
        cancelAnimationFrame(autoscrollRef.current);
        autoscrollRef.current = null;
      }
      lastFrameRef.current = 0;
      return;
    }

    const pxPerSec = scrollSpeed * 8; // 1x=8px/s .. 10x=80px/s
    const step = (ts: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = ts;
      const dt = (ts - lastFrameRef.current) / 1000;
      lastFrameRef.current = ts;

      const docHeight = document.documentElement.scrollHeight;
      const maxScroll = docHeight - window.innerHeight;
      const current = window.scrollY;

      if (current >= maxScroll - 1) {
        // Reached the bottom — stop.
        stopAutoscroll();
        return;
      }

      window.scrollBy(0, pxPerSec * dt);
      autoscrollRef.current = requestAnimationFrame(step);
    };

    autoscrollRef.current = requestAnimationFrame(step);
    return () => {
      if (autoscrollRef.current !== null) {
        cancelAnimationFrame(autoscrollRef.current);
        autoscrollRef.current = null;
      }
    };
  }, [autoscroll, scrollSpeed, stopAutoscroll]);

  // --- Synced-lyrics scroll ---
  // Uses an internal clock (performance.now) to drive scroll to each aligned
  // line at its LRC timestamp. A user-adjustable offset lets them nudge the
  // sync if the lyrics are slightly ahead/behind.
  const stopSyncScroll = useCallback(() => {
    if (syncRafRef.current !== null) {
      cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
    }
    setSyncScroll(false);
    setSyncPaused(false);
    setActiveSyncLine(null);
  }, []);

  useEffect(() => {
    if (!syncScroll) {
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
      setActiveSyncLine(null);
      return;
    }
    // If no alignments, can't sync.
    if (syncAlignmentsRef.current.length === 0) {
      stopSyncScroll();
      return;
    }
    // Disable constant autoscroll — sync takes over.
    setAutoscroll(false);

    syncStartRef.current = performance.now();
    syncPauseTimeRef.current = 0;
    syncPauseStartRef.current = 0;
    let lastLine: number | null = null;

    const step = () => {
      if (!syncScrollRef.current) return;
      // When paused, keep the rAF alive but don't advance the clock.
      if (syncPausedRef.current) {
        syncRafRef.current = requestAnimationFrame(step);
        return;
      }
      // Use YouTube player time as the master clock when available (true
      // audio sync, self-corrects on seek). Fall back to internal clock,
      // subtracting accumulated paused duration.
      const ytTime = ytTimeRef.current;
      const elapsed = ytTime !== null
        ? ytTime
        : (performance.now() - syncStartRef.current - syncPauseTimeRef.current) / 1000;
      const adjustedTime = elapsed - syncOffsetRef.current;
      const lineIdx = lineAtTime(syncAlignmentsRef.current, adjustedTime);

      if (lineIdx !== null && lineIdx !== lastLine) {
        lastLine = lineIdx;
        setActiveSyncLine(lineIdx);
        const el = lineRefs.current[lineIdx];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }

      // Stop when we've passed the last alignment + 5s.
      const lastAlign = syncAlignmentsRef.current[syncAlignmentsRef.current.length - 1];
      if (adjustedTime > lastAlign.time + 5) {
        stopSyncScroll();
        return;
      }

      syncRafRef.current = requestAnimationFrame(step);
    };

    syncRafRef.current = requestAnimationFrame(step);
    return () => {
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
    };
  }, [syncScroll, stopSyncScroll]);

  // Resync: tap to set the offset so the current line is "now".
  const handleResync = useCallback(() => {
    if (syncAlignmentsRef.current.length === 0) return;
    // Find the alignment closest to the current scroll position.
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    let closest = syncAlignmentsRef.current[0];
    let closestDist = Infinity;
    for (const a of syncAlignmentsRef.current) {
      const el = lineRefs.current[a.lineIndex];
      if (!el) continue;
      const dist = Math.abs(el.offsetTop - viewportCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = a;
      }
    }
    const elapsed = (performance.now() - syncStartRef.current) / 1000;
    // Set offset so that adjustedTime == closest.time right now.
    setLyricsOffset(elapsed - closest.time);
  }, []);

  // Spacebar toggles sync pause/resume (only when sync is active and the
  // user isn't typing in an input/textarea).
  useEffect(() => {
    if (!syncScroll) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      setSyncPaused(p => !p);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [syncScroll]);

  // Clean up sync scroll on unmount.
  useEffect(() => {
    return () => {
      if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
    };
  }, []);

  // Stop autoscroll if the user scrolls up manually while it's running.
  useEffect(() => {
    if (!autoscroll) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < lastY - 4) {
        stopAutoscroll();
      } else {
        lastY = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [autoscroll, stopAutoscroll]);

  // Clean up autoscroll on unmount
  useEffect(() => {
    return () => {
      if (autoscrollRef.current !== null) cancelAnimationFrame(autoscrollRef.current);
    };
  }, []);

  // --- Song playback (Tier 3) ---
  const stopPlayback = useCallback(() => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlaying(false);
    setActivePlaybackLine(null);
  }, []);

  const handleTogglePlayback = useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }
    const chords = extractPlaybackChords(parsedLines, (chordName) => {
      const { displayName, fingerings } = getChordWithFingerings(chordName);
      return { name: displayName, fingerings };
    });
    if (chords.length === 0) return;
    unlockAudio();
    const player = new SongPlayer(chords, {
      bpm: playbackBpm,
      beatsPerChord,
      capo: effectiveCapo ?? 0,
      onChord: (c) => setActivePlaybackLine(c ? c.lineIndex : null),
      onEnd: () => {
        setPlaying(false);
        setActivePlaybackLine(null);
        playerRef.current = null;
      },
    });
    playerRef.current = player;
    player.start();
    setPlaying(true);
  }, [playing, parsedLines, getChordWithFingerings, playbackBpm, beatsPerChord, effectiveCapo, stopPlayback]);

  // Stop playback if the song changes or on unmount.
  useEffect(() => {
    return () => stopPlayback();
  }, [song.id, stopPlayback]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 print-area">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-text truncate">{song.songName}</h1>
            <p className="text-text-muted text-lg truncate">{song.artistName}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 print:hidden">
            <button
              onClick={handleSaveState}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                isSaved
                  ? "bg-bg-hover text-text-muted border border-bg-border"
                  : "bg-accent hover:bg-accent-hover text-white"
              }`}
            >
              {isSaved ? "Update Saved" : "Save Song"}
            </button>
            <a
              href={song.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-lg text-text-muted text-sm transition-colors"
              title="Open original"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 2H4C2.9 2 2 2.9 2 4V12C2 13.1 2.9 14 4 14H12C13.1 14 14 13.1 14 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <button
              onClick={handleShare}
              className={`px-3 py-2 border rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
                shareCopied
                  ? "bg-accent/15 border-accent text-accent"
                  : "bg-bg-card hover:bg-bg-hover border-bg-border text-text-muted"
              }`}
              title="Copy a shareable link with your current setup"
            >
              {shareCopied ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8L7 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 9V4C6 2.9 6.9 2 8 2H12C13.1 2 14 2.9 14 4V8C14 9.1 13.1 10 12 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M10 7V12C10 13.1 9.1 14 8 14H4C2.9 14 2 13.1 2 12V8C2 6.9 2.9 6 4 6H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {shareCopied ? "Copied" : "Share"}
            </button>
          </div>
        </div>

        {/* Key, capo, tuning info */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {song.key && (
            <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
              <span className="text-text-dim">Key: </span>
              <span className="text-text font-mono font-semibold">{song.key}</span>
              {transposedKey && transposedKey !== song.key && (
                <>
                  <span className="text-text-dim mx-1">→</span>
                  <span className="text-accent font-mono font-semibold">{transposedKey}</span>
                </>
              )}
            </div>
          )}
          <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
            <span className="text-text-dim">Capo: </span>
            <span className="text-text font-mono font-semibold">
              {effectiveCapo !== null ? `Fret ${effectiveCapo}` : "None"}
            </span>
          </div>
          {song.tuning && (
            <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
              <span className="text-text-dim">Tuning: </span>
              <span className="text-text-muted font-mono text-xs">{song.tuning}</span>
            </div>
          )}
          <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
            <span className="text-text-dim">Type: </span>
            <span className="text-text-muted capitalize">{song.type}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <TransposeControls
            transposition={transposition}
            onTranspose={setTransposition}
            onReset={handleReset}
            currentKey={song.key}
            transposedKey={transposedKey}
          />

          {/* Capo override */}
          <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-2">
            <span className="text-text-muted text-xs font-medium px-2">Capo</span>
            <button
              onClick={() => setCapoOverride(Math.max(0, (capoOverride ?? song.capo ?? 0) - 1))}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors text-sm"
            >
              −
            </button>
            <span className="text-text font-mono font-semibold text-sm min-w-[30px] text-center">
              {capoOverride ?? song.capo ?? 0}
            </span>
            <button
              onClick={() => setCapoOverride((capoOverride ?? song.capo ?? 0) + 1)}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors text-sm"
            >
              +
            </button>
          </div>

          {/* View mode */}
          <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1">
            {(["both", "chords", "lyrics"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text hover:bg-bg-hover"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Font size */}
          <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1">
            <span className="text-text-muted text-xs font-medium px-1">Aa</span>
            <button
              onClick={() => setFontSize(f => Math.max(MIN_FONT_SIZE, f - 1))}
              disabled={fontSize <= MIN_FONT_SIZE}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border disabled:opacity-40 rounded-lg text-text transition-colors text-sm font-bold"
              title="Smaller text"
            >
              −
            </button>
            <span className="text-text font-mono text-xs min-w-[28px] text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize(f => Math.min(MAX_FONT_SIZE, f + 1))}
              disabled={fontSize >= MAX_FONT_SIZE}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border disabled:opacity-40 rounded-lg text-text transition-colors text-sm font-bold"
              title="Larger text"
            >
              +
            </button>
          </div>

          {/* Autoscroll */}
          <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-xl p-1.5">
            <button
              onClick={() => {
                unlockAudio();
                setAutoscroll(a => !a);
              }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                autoscroll
                  ? "bg-accent text-white"
                  : "bg-bg-hover hover:bg-bg-border text-text"
              }`}
              title={autoscroll ? "Pause autoscroll" : "Start autoscroll"}
            >
              {autoscroll ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="3" y="2" width="3" height="10" rx="1" />
                  <rect x="8" y="2" width="3" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3 2L12 7L3 12V2Z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={scrollSpeed}
              onChange={e => setScrollSpeed(parseInt(e.target.value, 10))}
              className="w-20 accent-accent"
              title={`Scroll speed: ${scrollSpeed}x`}
            />
            <span className="text-text-muted text-xs font-mono min-w-[24px] text-center">{scrollSpeed}x</span>
          </div>

          {/* Synced-lyrics scroll */}
          {lyricsStatus === "found" && (
            <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-xl p-1.5">
              <button
                onClick={() => setSyncScroll(s => !s)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                  syncScroll
                    ? "bg-accent text-white"
                    : "bg-bg-hover hover:bg-bg-border text-text"
                }`}
                title={syncScroll ? "Stop synced scroll" : "Scroll synced to lyrics"}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7H4L5 4L7 10L9 5L10 7H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-text-muted text-xs">Sync</span>
              {ytClockActive && (
                <span className="text-accent text-[10px] font-medium" title="Synced to YouTube playback">
                  YT
                </span>
              )}
              {syncScroll && (
                <>
                  <button
                    onClick={handleResync}
                    className="px-2 py-1 bg-bg-hover hover:bg-bg-border rounded text-text-muted text-xs transition-colors"
                    title="Set offset so the line nearest the viewport center is 'now'"
                  >
                    ↺ Resync
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLyricsOffset(o => o - 0.5)}
                      className="w-5 h-5 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded text-text-dim text-xs transition-colors"
                      title="Lyrics earlier by 0.5s"
                    >
                      −
                    </button>
                    <span className="text-text-dim text-[10px] font-mono min-w-[32px] text-center">
                      {lyricsOffset > 0 ? "+" : ""}{lyricsOffset.toFixed(1)}s
                    </span>
                    <button
                      onClick={() => setLyricsOffset(o => o + 0.5)}
                      className="w-5 h-5 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded text-text-dim text-xs transition-colors"
                      title="Lyrics later by 0.5s"
                    >
                      +
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {(lyricsStatus === "fetching" || lyricsStatus === "none" || lyricsStatus === "error") && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-text-dim text-xs" title={
              lyricsStatus === "fetching" ? "Searching LRCLib for synced lyrics..." :
              lyricsStatus === "none" ? "No synced lyrics found for this song" :
              "Couldn't fetch lyrics"
            }>
              {lyricsStatus === "fetching" && (
                <>
                  <div className="w-3 h-3 border border-bg-border border-t-accent rounded-full animate-spin" />
                  <span>Finding lyrics...</span>
                </>
              )}
              {lyricsStatus === "none" && <span>No synced lyrics</span>}
              {lyricsStatus === "error" && <span>Lyrics unavailable</span>}
            </div>
          )}

          {/* Song playback */}
          <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-xl p-1.5">
            <button
              onClick={handleTogglePlayback}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                playing ? "bg-accent text-white" : "bg-bg-hover hover:bg-bg-border text-text"
              }`}
              title={playing ? "Stop playback" : "Play song (strum through chords)"}
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
            <div className="flex flex-col gap-0.5 px-1">
              <label className="text-text-dim text-[9px] uppercase tracking-wider leading-none">
                BPM {playbackBpm}
              </label>
              <input
                type="range"
                min={50}
                max={180}
                value={playbackBpm}
                onChange={e => setPlaybackBpm(parseInt(e.target.value, 10))}
                className="w-16 accent-accent"
                title="Playback tempo"
              />
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-text-dim text-[9px] uppercase tracking-wider px-1">beats</span>
              {[2, 3, 4, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setBeatsPerChord(n)}
                  className={`w-6 h-6 rounded text-[10px] font-mono font-medium transition-colors ${
                    beatsPerChord === n
                      ? "bg-accent text-white"
                      : "bg-bg-hover text-text-muted hover:text-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowAllChords(!showAllChords)}
            className="px-3 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
          >
            {showAllChords ? "Hide" : "Show"} Chords
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors flex items-center gap-1.5"
            title="Print or save as PDF"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5V1H11V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 9H1V5H13V9H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 7H11V13H3V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Print / PDF
          </button>

          {(transposition !== 0 || Object.keys(chordOverrides).length > 0 || capoOverride !== null || fontSize !== DEFAULT_FONT_SIZE || viewMode !== "both") && (
            <button
              onClick={handleClearState}
              className="px-3 py-2 text-text-muted hover:text-accent text-sm transition-colors"
            >
              Clear Changes
            </button>
          )}
        </div>
      </div>

      {/* YouTube sync + section looping */}
      <div className="mb-4 print:hidden">
        <YouTubePlayer
          query={`${song.artistName} ${song.songName}`}
          onTimeUpdate={(time) => {
            ytTimeRef.current = time;
            setYtClockActive(time !== null);
          }}
        />
      </div>

      {/* Chord summary — all unique chords with diagrams */}
      {showAllChords && uniqueChords.length > 0 && (
        <div className="mb-6 bg-bg-card border border-bg-border rounded-xl p-4">
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3">
            Chords Used ({uniqueChords.length}) — click ▶ to hear
          </h2>
          <div className="flex flex-wrap gap-2">
            {uniqueChords.map(originalChord => {
              const { displayName, fingerings, selectedIndex } = getChordWithFingerings(originalChord);
              const fingering = fingerings[selectedIndex] || fingerings[0];
              return (
                <div key={originalChord} className="group relative bg-bg-hover rounded-lg p-1">
                  {fingering ? (
                    <>
                      <ChordDiagram chordName={displayName} fingering={fingering} size="small" />
                      <button
                        onClick={() => handlePlayChord(fingering)}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-bg-card/90 hover:bg-accent hover:text-white text-text-muted rounded-full transition-colors opacity-0 group-hover:opacity-100"
                        title={`Play ${displayName}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                          <path d="M2 1L9 5L2 9V1Z" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <div className="w-[70px] h-[80px] flex flex-col items-center justify-center">
                      <span className="text-accent font-mono font-semibold text-sm">{displayName}</span>
                      <span className="text-text-dim text-xs mt-1">no diagram</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div
        className="bg-bg-card border border-bg-border rounded-xl p-6 overflow-x-auto"
        style={{ ["--tab-font-size" as string]: `${fontSize}px` }}
      >
        <div className="tab-content" style={{ fontSize: `${fontSize}px` }}>
          {parsedLines.map((line, lineIdx) => (
            <div
              key={lineIdx}
              ref={el => { lineRefs.current[lineIdx] = el; }}
            >
              {renderLine(
                line,
                lineIdx,
                getChordWithFingerings,
                handleChordSelect,
                viewMode,
                handlePlayChord,
                effectiveCapo,
                activePlaybackLine ?? activeSyncLine
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between text-xs text-text-dim print:hidden">
        <span>
          Provider: <span className="text-text-muted capitalize">{song.provider}</span>
        </span>
        {song.rating > 0 && (
          <span>
            Rating: <span className="text-text-muted">{song.rating.toFixed(1)}/5</span>
          </span>
        )}
      </div>

      {/* Floating sync control — visible while synced scroll is active */}
      {syncScroll && (
        <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 bg-bg-card border border-bg-border rounded-full shadow-2xl pl-2 pr-1 py-1 print:hidden">
          <button
            onClick={() => setSyncPaused(p => !p)}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            title={syncPaused ? "Resume (Space)" : "Pause (Space)"}
          >
            {syncPaused ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent">
                <path d="M4 2L13 8L4 14V2Z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-text">
                <rect x="3" y="2" width="3" height="10" rx="1" />
                <rect x="8" y="2" width="3" height="10" rx="1" />
              </svg>
            )}
          </button>
          <div className="flex flex-col items-start leading-none">
            <span className="text-text text-xs font-semibold">
              {syncPaused ? "Paused" : "Syncing"}
            </span>
            <span className="text-text-dim text-[9px] mt-0.5">Space to {syncPaused ? "resume" : "pause"}</span>
          </div>
          <button
            onClick={stopSyncScroll}
            className="w-9 h-9 flex items-center justify-center bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-full transition-colors"
            title="Stop sync"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Render a single parsed line
function renderLine(
  line: ParsedLine,
  lineIdx: number,
  getChordWithFingerings: (chord: string) => { displayName: string; fingerings: ChordFingering[]; selectedIndex: number },
  handleChordSelect: (chord: string, index: number) => void,
  viewMode: ViewMode,
  onPlayChord: (fingering: ChordFingering) => void,
  capo: number | null,
  activePlaybackLine: number | null
): React.ReactNode {
  const isActive = activePlaybackLine === lineIdx;
  const highlight = isActive ? "bg-accent/15 rounded px-1 -mx-1" : "";

  switch (line.type) {
    case "blank":
      return <div key={lineIdx} className="h-4" />;

    case "section":
      return (
        <div key={lineIdx} className="text-accent font-semibold text-sm mt-4 mb-1">
          {line.label}
        </div>
      );

    case "lyric":
      // In chords-only mode, hide pure lyric lines.
      if (viewMode === "chords") return null;
      return (
        <div key={lineIdx} className={`text-text ${highlight}`}>
          {line.text}
        </div>
      );

    case "chord":
      // In lyrics-only mode, render the chord line but strip out chord tokens.
      if (viewMode === "lyrics") {
        const text = line.segments
          .map(seg => (seg.chord ? "" : seg.text))
          .join("");
        return (
          <div key={lineIdx} className={`text-text ${highlight}`}>
            {text}
          </div>
        );
      }
      return (
        <div key={lineIdx} className={`chord-line ${highlight}`}>
          {line.segments.map((seg, segIdx) => {
            if (seg.chord) {
              const { displayName, fingerings, selectedIndex } = getChordWithFingerings(seg.chord);
              return (
                <ChordToken
                  key={segIdx}
                  chordName={displayName}
                  fingerings={fingerings}
                  selectedIndex={selectedIndex}
                  onSelectIndex={(i) => handleChordSelect(seg.chord!, i)}
                  onPlay={onPlayChord}
                  capo={capo}
                />
              );
            }
            return (
              <span key={segIdx} className="text-text">
                {seg.text}
              </span>
            );
          })}
        </div>
      );

    default:
      return null;
  }
}
