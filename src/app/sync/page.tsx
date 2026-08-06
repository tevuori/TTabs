"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { AuthGuard } from "@/components/AuthGuard";
import QRDisplay from "@/components/QRDisplay";
import QRScanner from "@/components/QRScanner";
import { exportAll, importAll } from "@/lib/storage";
import { IS_MOBILE } from "@/lib/app-mode";
import { getToken } from "@/lib/auth";
import type { SyncPayload, ImportResult } from "@/lib/storage/types";

export default function SyncPage() {
  return (
    <AuthGuard>
      <SyncContent />
    </AuthGuard>
  );
}

// --- Connection info encoded in the QR code ---

interface SyncConnection {
  url: string;      // e.g. "http://192.168.1.5:3000"
  session: string;  // 8-char hex session ID
}

function encodeConnection(conn: SyncConnection): string {
  return JSON.stringify(conn);
}

function parseConnection(text: string): SyncConnection | null {
  try {
    const obj = JSON.parse(text);
    if (typeof obj.url === "string" && typeof obj.session === "string") {
      return { url: obj.url, session: obj.session };
    }
  } catch {
    // not JSON
  }
  return null;
}

// --- Main component ---

function SyncContent() {
  if (IS_MOBILE) {
    return <MobileSync />;
  }
  return <ServerSync />;
}

// =====================================================================
// Server side: shows a QR code with connection info, polls for status
// =====================================================================

function ServerSync() {
  const [connection, setConnection] = useState<SyncConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"waiting" | "syncing" | "completed" | null>(null);
  const [syncResult, setSyncResult] = useState<ImportResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const resp = await fetch("/api/sync/session", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create session (${resp.status})`);
      }
      const data = await resp.json();
      setConnection({ url: data.serverUrl, session: data.sessionId });
      setSyncStatus("waiting");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    createSession();
  }, [createSession]);

  // Poll for sync status
  useEffect(() => {
    if (!connection) return;
    const token = getToken();
    const poll = async () => {
      try {
        const resp = await fetch(
          `/api/sync/status?session=${connection.session}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!resp.ok) return;
        const data = await resp.json();
        setSyncStatus(data.status);
        if (data.status === "completed") {
          setSyncResult(data.result);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore poll errors
      }
    };
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connection]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-2">Data Sync</h1>
        <p className="text-text-muted text-sm mb-6">
          Scan this QR code with the TTabs mobile app on your phone to sync
          over your local WiFi network. Both devices must be on the same network.
        </p>

        {error && (
          <div className="space-y-4 mb-6">
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
              {error}
            </div>
            <button
              onClick={createSession}
              className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {connection && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <QRDisplay
                value={encodeConnection(connection)}
                label={`Server: ${connection.url}`}
              />
            </div>

            {/* Status indicator */}
            <div className="bg-bg-card border border-bg-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                {syncStatus === "waiting" && (
                  <>
                    <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                    <div>
                      <p className="text-text text-sm font-medium">Waiting for mobile...</p>
                      <p className="text-text-dim text-xs mt-0.5">
                        Open the TTabs app on your phone and scan the QR code
                      </p>
                    </div>
                  </>
                )}
                {syncStatus === "syncing" && (
                  <>
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    <div>
                      <p className="text-text text-sm font-medium">Syncing...</p>
                      <p className="text-text-dim text-xs mt-0.5">
                        Transferring data over WiFi
                      </p>
                    </div>
                  </>
                )}
                {syncStatus === "completed" && syncResult && (
                  <>
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <div>
                      <p className="text-text text-sm font-medium">Sync complete</p>
                      <div className="flex gap-4 text-xs text-text-muted mt-0.5">
                        <span><span className="text-text font-medium">{syncResult.added}</span> added</span>
                        <span><span className="text-text font-medium">{syncResult.updated}</span> updated</span>
                        <span><span className="text-text-dim">{syncResult.skipped}</span> skipped</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={createSession}
              className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Generate new QR code
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// =====================================================================
// Mobile side: scans QR to get connection info, then syncs over HTTP
// =====================================================================

function MobileSync() {
  const [connection, setConnection] = useState<SyncConnection | null>(null);
  const [phase, setPhase] = useState<"scan" | "ready" | "syncing" | "done" | "error">("scan");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ received: ImportResult; sent: ImportResult } | null>(null);
  const [stats, setStats] = useState<{ songs: number; setlists: number } | null>(null);
  const router = useRouter();

  const handleScan = useCallback((text: string) => {
    const conn = parseConnection(text);
    if (!conn) {
      setError("That QR code doesn't look like a TTabs sync code.");
      setPhase("error");
      return;
    }
    setConnection(conn);
    setPhase("ready");
    setError(null);
  }, []);

  const doSync = useCallback(async () => {
    if (!connection) return;
    setPhase("syncing");
    setError(null);

    try {
      // 1. Export local data
      const localPayload = await exportAll();
      setStats({
        songs: localPayload.songs.length,
        setlists: localPayload.setlists.length,
      });

      // 2. POST local data to server (server merges it)
      const postResp = await fetch(
        `${connection.url}/api/sync/data?session=${connection.session}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(localPayload),
        }
      );
      if (!postResp.ok) {
        const data = await postResp.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${postResp.status}`);
      }
      const sent: ImportResult = await postResp.json();

      // 3. GET server data (now includes both server's and mobile's data)
      const getResp = await fetch(
        `${connection.url}/api/sync/data?session=${connection.session}`
      );
      if (!getResp.ok) {
        throw new Error(`Failed to fetch server data (${getResp.status})`);
      }
      const serverPayload: SyncPayload = await getResp.json();

      // 4. Merge server data into local IndexedDB
      const received = await importAll(serverPayload, "merge");

      setResult({ received, sent });
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [connection]);

  const reset = useCallback(() => {
    setConnection(null);
    setPhase("scan");
    setError(null);
    setResult(null);
    setStats(null);
  }, []);

  // --- Scan phase ---
  if (phase === "scan") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <h1 className="text-2xl font-bold text-text mb-2">Data Sync</h1>
          <p className="text-text-muted text-sm mb-6">
            Scan the QR code shown on the TTabs server to connect. Both
            devices must be on the same WiFi network.
          </p>
          {error && (
            <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
          <QRScanner onScan={handleScan} />
        </main>
      </div>
    );
  }

  // --- Ready to sync ---
  if (phase === "ready" && connection) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <h1 className="text-2xl font-bold text-text mb-2">Connected</h1>
          <p className="text-text-muted text-sm mb-6">
            Connected to server at <span className="font-mono text-text">{connection.url}</span>.
            Tap sync to exchange data — songs, setlists, and states will be
            merged on both devices (newest version wins).
          </p>
          <div className="space-y-4">
            <button
              onClick={doSync}
              className="w-full px-5 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl text-sm transition-colors"
            >
              Sync now
            </button>
            <button
              onClick={reset}
              className="w-full px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Scan a different QR code
            </button>
          </div>
        </main>
      </div>
    );
  }

  // --- Syncing ---
  if (phase === "syncing") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-10 h-10 border-2 border-bg-border border-t-accent rounded-full animate-spin mb-4" />
          <p className="text-text-muted text-sm">
            {stats ? `Sending ${stats.songs} songs, ${stats.setlists} setlists...` : "Connecting to server..."}
          </p>
        </main>
      </div>
    );
  }

  // --- Done ---
  if (phase === "done" && result) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <div className="p-5 bg-green-950/20 border border-green-900/40 rounded-xl text-center mb-6">
            <div className="w-12 h-12 mx-auto mb-3 bg-green-500 rounded-full flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 12L10 17L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-text font-semibold text-base mb-3">Sync complete</h2>
            <div className="space-y-2 text-sm text-text-muted">
              <div>
                <span className="text-text-dim">From server: </span>
                <span className="text-text font-medium">{result.received.added}</span> added,
                <span className="text-text font-medium"> {result.received.updated}</span> updated
              </div>
              <div>
                <span className="text-text-dim">To server: </span>
                <span className="text-text font-medium">{result.sent.added}</span> added,
                <span className="text-text font-medium"> {result.sent.updated}</span> updated
              </div>
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
              onClick={reset}
              className="px-4 py-2.5 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Sync again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // --- Error ---
  if (phase === "error") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm mb-4">
            {error}
          </div>
          <div className="space-y-3">
            {connection && (
              <button
                onClick={doSync}
                className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl text-sm transition-colors"
              >
                Retry sync
              </button>
            )}
            <button
              onClick={reset}
              className="w-full px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Scan again
            </button>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
