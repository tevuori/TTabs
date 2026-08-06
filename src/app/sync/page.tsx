"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { AuthGuard } from "@/components/AuthGuard";
import QRDisplay from "@/components/QRDisplay";
import QRScanner from "@/components/QRScanner";
import { exportAll, importAll } from "@/lib/storage";
import { encodePayload } from "@/lib/sync/protocol";
import type { SyncPayload, ImportResult } from "@/lib/storage/types";

export default function SyncPage() {
  return (
    <AuthGuard>
      <SyncContent />
    </AuthGuard>
  );
}

function SyncContent() {
  const [tab, setTab] = useState<"send" | "receive">("send");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-2">Data Sync</h1>
        <p className="text-text-muted text-sm mb-6">
          Transfer your songs, setlists, and settings between devices using QR codes.
          Point one device&apos;s camera at the other&apos;s screen.
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 bg-bg-card border border-bg-border rounded-xl p-1">
          <button
            onClick={() => setTab("send")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "send"
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            Send data
          </button>
          <button
            onClick={() => setTab("receive")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "receive"
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            Receive data
          </button>
        </div>

        {tab === "send" ? <SendTab /> : <ReceiveTab />}
      </main>
    </div>
  );
}

// --- Send tab: export data and display as animated QR codes ---

function SendTab() {
  const [encoded, setEncoded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ songs: number; setlists: number; size: string } | null>(null);

  const prepare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await exportAll();
      const encodedStr = await encodePayload(payload);
      setEncoded(encodedStr);
      const bytes = encodedStr.length;
      const sizeStr = bytes > 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : bytes > 1024
        ? `${(bytes / 1024).toFixed(0)} KB`
        : `${bytes} B`;
      setStats({
        songs: payload.songs.length,
        setlists: payload.setlists.length,
        size: sizeStr,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Preparing data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
        <button
          onClick={prepare}
          className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!encoded) return null;

  return (
    <div className="space-y-4">
      {stats && (
        <div className="flex items-center gap-4 text-sm text-text-muted bg-bg-card border border-bg-border rounded-xl p-3">
          <span>{stats.songs} songs</span>
          <span>{stats.setlists} setlists</span>
          <span className="ml-auto text-text-dim">{stats.size}</span>
        </div>
      )}
      <p className="text-text-muted text-sm">
        Show this screen to the other device&apos;s camera. The QR codes will
        cycle through all the data — keep the screen steady and well-lit.
      </p>
      <QRDisplay encoded={encoded} />
    </div>
  );
}

// --- Receive tab: scan QR codes and import the data ---

function ReceiveTab() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handlePayload = useCallback(async (payload: SyncPayload) => {
    try {
      const res = await importAll(payload, "merge");
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="p-5 bg-green-950/20 border border-green-900/40 rounded-xl text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-green-500 rounded-full flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12L10 17L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-text font-semibold text-base mb-2">Sync complete</h2>
          <div className="flex justify-center gap-4 text-sm text-text-muted">
            <span><span className="text-text font-medium">{result.added}</span> added</span>
            <span><span className="text-text font-medium">{result.updated}</span> updated</span>
            <span><span className="text-text-dim">{result.skipped}</span> skipped</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/library")}
            className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl text-sm transition-colors"
          >
            Go to library
          </button>
          <button
            onClick={() => setResult(null)}
            className="px-4 py-2.5 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
          >
            Sync again
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
        <button
          onClick={() => setError(null)}
          className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-text-muted text-sm">
        Point your camera at the other device&apos;s QR code screen. The data
        will be merged — newer versions win.
      </p>
      <QRScanner onPayload={handlePayload} />
    </div>
  );
}
