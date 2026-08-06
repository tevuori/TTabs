"use client";

import { useState } from "react";
import { Provider } from "@/lib/types";

interface SearchBarProps {
  onSearch: (query: string, providers: Provider[]) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState<Provider[]>(["ug"]);

  const toggleProvider = (p: Provider) => {
    setProviders(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && providers.length > 0) {
      onSearch(query.trim(), providers);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-3">
        {/* Provider checkboxes */}
        <div className="flex items-center gap-4 justify-center">
          <label
            className="flex items-center gap-2 cursor-pointer select-none group"
          >
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                providers.includes("ug")
                  ? "bg-accent border-accent"
                  : "border-bg-border group-hover:border-text-muted"
              }`}
            >
              {providers.includes("ug") && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={providers.includes("ug")}
              onChange={() => toggleProvider("ug")}
              className="sr-only"
            />
            <span className="text-sm font-medium text-text">Ultimate Guitar</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                providers.includes("songsterr")
                  ? "bg-accent border-accent"
                  : "border-bg-border group-hover:border-text-muted"
              }`}
            >
              {providers.includes("songsterr") && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={providers.includes("songsterr")}
              onChange={() => toggleProvider("songsterr")}
              className="sr-only"
            />
            <span className="text-sm font-medium text-text">Songsterr</span>
          </label>
        </div>

        {/* Search input */}
        <div className="relative flex items-center">
          <svg
            className="absolute left-4 text-text-muted"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
          >
            <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" />
            <path
              d="M14.5 14.5L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for songs, artists..."
            className="w-full pl-12 pr-28 py-3.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-base"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim() || providers.length === 0}
            className="absolute right-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {providers.length === 0 && (
          <p className="text-text-muted text-xs text-center">
            Select at least one provider to search
          </p>
        )}
      </div>
    </form>
  );
}
