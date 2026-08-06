// Songsterr API client — search and URL construction
// Songsterr provides a JSON API for searching songs

import { SearchResult } from "./types";

const SONGSTERR_API = "https://www.songsterr.com/a/ra/songs.json";

interface SongsterrSong {
  id: number;
  title: string;
  artist: {
    id: number;
    name: string;
    nameWithoutThePrefix: string;
    useThePrefix: boolean;
  };
  chordsPresent?: boolean;
  tabTypes?: string[];
  tracks?: { chordDiagram?: any }[];
}

export async function searchSongsterr(query: string): Promise<SearchResult[]> {
  const url = `${SONGSTERR_API}?pattern=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Songsterr search failed: ${resp.status}`);
  }
  const songs: SongsterrSong[] = await resp.json();

  return songs.map(song => ({
    provider: "songsterr" as const,
    id: `songsterr_${song.id}`,
    artistName: song.artist.name,
    songName: song.title,
    type: "tab",
    url: `https://www.songsterr.com/a/wa/song?id=${song.id}`,
  }));
}

// Construct a direct Songsterr URL from artist and song name
export function buildSongsterrUrl(artist: string, song: string): string {
  return `https://www.songsterr.com/a/wa/bestMatchForQueryString?s=${encodeURIComponent(song)}&a=${encodeURIComponent(artist)}`;
}
