"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchResult, Provider, SongTab } from "@/lib/types";
import SearchBar from "@/components/SearchBar";
import SearchResults from "@/components/SearchResults";
import RecentSongs from "@/components/RecentSongs";
import Header from "@/components/Header";
import { AuthGuard } from "@/components/AuthGuard";

export default function HomePage() {
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
    <AuthGuard>
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
    </AuthGuard>
  );
}
