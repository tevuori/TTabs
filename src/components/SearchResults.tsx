"use client";

import { SearchResult } from "@/lib/types";

interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
  errors?: string[];
  onOpenUGTab: (url: string) => void;
}

export default function SearchResults({
  results,
  loading,
  errors,
  onOpenUGTab,
}: SearchResultsProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Searching...</p>
      </div>
    );
  }

  if (errors && errors.length > 0 && results.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-bg-card border border-bg-border rounded-xl p-6 text-center">
          <p className="text-text font-medium mb-2">Search completed with errors</p>
          {errors.map((err, i) => (
            <p key={i} className="text-text-muted text-sm">
              {err}
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  // Group results by provider
  const ugResults = results.filter(r => r.provider === "ug");
  const songsterrResults = results.filter(r => r.provider === "songsterr");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {ugResults.length > 0 && (
        <div>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3 px-1">
            Ultimate Guitar ({ugResults.length})
          </h2>
          <div className="space-y-2">
            {ugResults.map((r, i) => (
              <UGResultCard key={`${r.id}-${i}`} result={r} onOpen={() => onOpenUGTab(r.url)} />
            ))}
          </div>
        </div>
      )}

      {songsterrResults.length > 0 && (
        <div>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3 px-1">
            Songsterr ({songsterrResults.length})
          </h2>
          <div className="space-y-2">
            {songsterrResults.map((r, i) => (
              <SongsterrResultCard key={`${r.id}-${i}`} result={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UGResultCard({ result, onOpen }: { result: SearchResult; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-bg-card hover:bg-bg-hover border border-bg-border hover:border-accent/40 rounded-xl p-4 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-text font-semibold truncate group-hover:text-accent transition-colors">
            {result.songName}
          </h3>
          <p className="text-text-muted text-sm truncate">{result.artistName}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2 py-0.5 bg-bg-hover text-text-muted text-xs rounded-md font-medium capitalize">
            {result.type}
          </span>
          {result.rating && result.rating > 0 && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="#f97316">
                <path d="M6 0L7.5 4.5L12 4.5L8.25 7.5L9.75 12L6 9L2.25 12L3.75 7.5L0 4.5L4.5 4.5L6 0Z" />
              </svg>
              {result.rating.toFixed(1)}
            </div>
          )}
        </div>
      </div>
      {result.version && result.version > 1 && (
        <p className="text-text-dim text-xs mt-1">Version {result.version}</p>
      )}
    </button>
  );
}

function SongsterrResultCard({ result }: { result: SearchResult }) {
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full text-left bg-bg-card hover:bg-bg-hover border border-bg-border hover:border-accent/40 rounded-xl p-4 transition-all group flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-text font-semibold truncate group-hover:text-accent transition-colors">
          {result.songName}
        </h3>
        <p className="text-text-muted text-sm truncate">{result.artistName}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="px-2 py-0.5 bg-bg-hover text-text-muted text-xs rounded-md font-medium">
          Tab
        </span>
        <svg
          className="text-text-dim group-hover:text-accent transition-colors"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M6 3L11 8L6 13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </a>
  );
}
