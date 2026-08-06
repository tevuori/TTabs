"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchResult, Provider, SongTab } from "@/lib/types";
import SearchBar from "@/components/SearchBar";
import SearchResults from "@/components/SearchResults";
import RecentSongs from "@/components/RecentSongs";
import Header from "@/components/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { IS_MOBILE } from "@/lib/app-mode";

export default function HomePage() {
  if (IS_MOBILE) {
    return (
      <AuthGuard>
        <MobileHome />
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <ServerHome />
    </AuthGuard>
  );
}

// --- Server home: search across UG and Songsterr ---

function ServerHome() {
  const router = useRouter();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[] | undefined>();
  const [fetchingTab, setFetchingTab] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string, providers: Provider[]) => {
    setLoading(true);
    setErrors(undefined);
    setResults([]);

    try {
      const resp = await fetch(
        `/api/search?query=${encodeURIComponent(query)}&providers=${providers.join(",")}`
      );
      const data = await resp.json();
      if (!resp.ok) {
        setErrors([data.error || "Search failed"]);
      } else {
        setResults(data.results || []);
        setErrors(data.errors);
      }
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenUGTab = useCallback(
    async (url: string) => {
      setFetchingTab(true);
      setTabError(null);

      try {
        const resp = await fetch(`/api/tab?url=${encodeURIComponent(url)}`);
        const data = await resp.json();
        if (!resp.ok) {
          setTabError(data.error || "Failed to fetch tab");
          return;
        }
        // Store the tab data and navigate to viewer
        const tab: SongTab = data;
        sessionStorage.setItem("currentTab", JSON.stringify(tab));
        router.push(`/song/${encodeURIComponent(tab.id)}`);
      } catch (e) {
        setTabError((e as Error).message);
      } finally {
        setFetchingTab(false);
      }
    },
    [router]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12">
        {results.length === 0 && !loading && (
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-text mb-3">
              Find your next song
            </h1>
            <p className="text-text-muted text-base sm:text-lg">
              Search guitar tabs and chords from Ultimate Guitar & Songsterr
            </p>
          </div>
        )}

        <div className="w-full mb-8">
          <SearchBar onSearch={handleSearch} loading={loading} />
        </div>

        {results.length === 0 && !loading && !fetchingTab && (
          <div className="w-full mb-4">
            <RecentSongs />
          </div>
        )}

        {tabError && (
          <div className="max-w-2xl w-full mb-4 p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
            {tabError}
          </div>
        )}

        {fetchingTab && (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
            <p className="text-text-muted text-sm">Fetching tab...</p>
          </div>
        )}

        <div className="w-full">
          <SearchResults
            results={results}
            loading={loading}
            errors={errors}
            onOpenUGTab={handleOpenUGTab}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-bg-border py-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-text-dim text-xs">
          TTabs — Guitar tabs with chord diagrams, transposition, and more
        </div>
      </footer>
    </div>
  );
}

// --- Mobile home: offline, sync-focused ---

function MobileHome() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-text mb-3">
            TTabs
          </h1>
          <p className="text-text-muted text-base sm:text-lg">
            Your offline guitar tab library
          </p>
        </div>

        {/* Sync CTA */}
        <div className="w-full max-w-md mb-8">
          <button
            onClick={() => router.push("/sync")}
            className="w-full p-6 bg-bg-card border border-bg-border rounded-2xl hover:border-accent transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4V12M12 12L8 8M12 12L16 8M4 16V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
                </svg>
              </div>
              <div>
                <div className="text-text font-semibold text-base">Sync data</div>
                <div className="text-text-muted text-sm">
                  Transfer songs &amp; setlists via QR code
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Library shortcut */}
        <div className="w-full max-w-md mb-4">
          <button
            onClick={() => router.push("/library")}
            className="w-full p-5 bg-bg-card border border-bg-border rounded-2xl hover:border-accent transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-bg-hover rounded-xl flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 5H16M4 10H16M4 15H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-muted" />
                </svg>
              </div>
              <div>
                <div className="text-text font-medium text-sm">Library</div>
                <div className="text-text-muted text-xs">Browse your saved songs</div>
              </div>
            </div>
          </button>
        </div>

        {/* Recent songs */}
        <div className="w-full">
          <RecentSongs />
        </div>
      </main>

      <footer className="border-t border-bg-border py-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-text-dim text-xs">
          TTabs — Offline guitar tabs
        </div>
      </footer>
    </div>
  );
}
