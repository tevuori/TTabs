// Encode/decode song view state (transposition, capo, chord overrides) to/from
// a URL query string so a song can be shared with an exact setup.

import { SongState } from "./types";

// Build a query string (without the leading "?") from a SongState.
// Returns "" if there's nothing worth sharing.
export function encodeStateToQuery(state: Partial<SongState>): string {
  const params = new URLSearchParams();
  if (state.transposition && state.transposition !== 0) {
    params.set("t", String(state.transposition));
  }
  if (state.capoOverride !== null && state.capoOverride !== undefined) {
    params.set("capo", String(state.capoOverride));
  }
  if (state.fontSize && state.fontSize !== 14) {
    params.set("fs", String(state.fontSize));
  }
  if (state.viewMode && state.viewMode !== "both") {
    params.set("vm", state.viewMode);
  }
  if (state.chordOverrides && Object.keys(state.chordOverrides).length > 0) {
    // Compact encoding: "chord:index,chord:index,..."
    const parts = Object.entries(state.chordOverrides).map(
      ([chord, idx]) => `${chord}:${idx}`
    );
    params.set("co", parts.join(","));
  }
  return params.toString();
}

// Parse state from the current URL's query string.
export function decodeStateFromQuery(search: string): Partial<SongState> | null {
  if (!search) return null;
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const hasAny =
    params.has("t") ||
    params.has("capo") ||
    params.has("fs") ||
    params.has("vm") ||
    params.has("co");
  if (!hasAny) return null;

  const state: Partial<SongState> = {};

  const t = params.get("t");
  if (t !== null) {
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) state.transposition = n;
  }

  const capo = params.get("capo");
  if (capo !== null) {
    const n = parseInt(capo, 10);
    if (!Number.isNaN(n)) state.capoOverride = n;
  }

  const fs = params.get("fs");
  if (fs !== null) {
    const n = parseInt(fs, 10);
    if (!Number.isNaN(n)) state.fontSize = n;
  }

  const vm = params.get("vm");
  if (vm === "both" || vm === "chords" || vm === "lyrics") {
    state.viewMode = vm;
  }

  const co = params.get("co");
  if (co) {
    const overrides: Record<string, number> = {};
    for (const part of co.split(",")) {
      const [chord, idxStr] = part.split(":");
      const idx = parseInt(idxStr, 10);
      if (chord && !Number.isNaN(idx)) overrides[chord] = idx;
    }
    if (Object.keys(overrides).length > 0) state.chordOverrides = overrides;
  }

  return state;
}

// Build a full shareable URL for a song with the given state.
export function buildShareableUrl(songId: string, state: Partial<SongState>): string {
  const query = encodeStateToQuery(state);
  const path = `/song/${encodeURIComponent(songId)}`;
  return query ? `${path}?${query}` : path;
}
