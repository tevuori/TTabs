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
import { syncAsOfferer, syncAsAnswerer } from "@/lib/sync/webrtc";
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
  url: string;      // e.g. "https://tabs.tevuori.eu"
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
// Server side (laptop browser): creates session, WebRTC offer, shows QR
// =====================================================================

function ServerSync() {
  const [connection, setConnection] = useState<SyncConnection | null>(null);
  const [phase, setPhase] = useState<"preparing" | "waiting" | "connecting" | "syncing" | "done" | "error">("preparing");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: "sending" | "receiving"; current: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    setPhase("preparing");
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      // 1. Create a sync session on the server
      const token = getToken();
      const sessionResp = await fetch("/api/sync/session", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!sessionResp.ok) {
        const data = await sessionResp.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create session (${sessionResp.status})`);
      }
      const sessionData = await sessionResp.json();
      const conn: SyncConnection = {
        url: sessionData.serverUrl,
        session: sessionData.sessionId,
      };
      setConnection(conn);

      // 2. Export local data
      const localPayload = await exportAll();

      // 3. Start WebRTC as offerer — this creates the offer, stores it,
      //    and waits for the mobile to answer. The QR code needs to be
      //    visible while we wait, so we set phase to "waiting" now.
      setPhase("waiting");

      abortRef.current = new AbortController();
      await syncAsOfferer({
        role: "offerer",
        serverUrl: conn.url,
        sessionId: conn.session,
        payload: localPayload,
        signal: abortRef.current.signal,
        onConnected: () => setPhase("syncing"),
        onProgress: (info) => setProgress(info),
        onReceived: async (remotePayload) => {
          const res = await importAll(remotePayload as SyncPayload, "merge");
          setResult(res);
        },
      });

      setPhase("done");
    } catch (e) {
      if ((e as Error).message !== "Aborted") {
        setError((e as Error).message);
        setPhase("error");
      }
    }
  }, []);

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
  }, [start]);

  const restart = useCallback(() => {
    abortRef.current?.abort();
    start();
  }, [start]);

  if (phase === "preparing") {
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
          Scan this QR code with the TTabs mobile app. Data transfers directly
          between your devices over your local network — no internet needed for
          the actual data.
        </p>

        {error && (
          <div className="space-y-4 mb-6">
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
              {error}
            </div>
            <button
              onClick={restart}
              className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {connection && (phase === "waiting" || phase === "connecting" || phase === "syncing") && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <QRDisplay
                value={encodeConnection(connection)}
                label={`Session: ${connection.session}`}
              />
            </div>

            <div className="bg-bg-card border border-bg-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                {phase === "waiting" && (
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
                {phase === "syncing" && progress && (
                  <>
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    <div className="flex-1">
                      <p className="text-text text-sm font-medium">
                        {progress.phase === "sending" ? "Sending data..." : "Receiving data..."}
                      </p>
                      <div className="mt-1.5 w-full bg-bg-hover rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-accent h-full transition-all duration-150"
                          style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-text-dim text-xs mt-1">
                        {progress.current} / {progress.total} chunks
                      </p>
                    </div>
                  </>
                )}
                {phase === "syncing" && !progress && (
                  <>
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    <div>
                      <p className="text-text text-sm font-medium">Connecting...</p>
                      <p className="text-text-dim text-xs mt-0.5">
                        Establishing peer-to-peer connection
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={restart}
              className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Cancel and restart
            </button>
          </div>
        )}

        {phase === "done" && result && (
          <div className="space-y-6">
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
            <button
              onClick={restart}
              className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
            >
              Sync again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// =====================================================================
// Mobile side: scans QR, connects via WebRTC, exchanges data
// =====================================================================

function MobileSync() {
  const [phase, setPhase] = useState<"scan" | "connecting" | "syncing" | "done" | "error">("scan");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: "sending" | "receiving"; current: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const handleScan = useCallback(async (text: string) => {
    const conn = parseConnection(text);
    if (!conn) {
      setError("That QR code doesn't look like a TTabs sync code.");
      setPhase("error");
      return;
    }

    setPhase("connecting");
    setError(null);

    try {
      const localPayload = await exportAll();

      abortRef.current = new AbortController();
      await syncAsAnswerer({
        role: "answerer",
        serverUrl: conn.url,
        sessionId: conn.session,
        payload: localPayload,
        signal: abortRef.current.signal,
        onConnected: () => setPhase("syncing"),
        onProgress: (info) => setProgress(info),
        onReceived: async (remotePayload) => {
          const res = await importAll(remotePayload as SyncPayload, "merge");
          setResult(res);
        },
      });

      setPhase("done");
    } catch (e) {
      if ((e as Error).message !== "Aborted") {
        setError((e as Error).message);
        setPhase("error");
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("scan");
    setError(null);
    setResult(null);
    setProgress(null);
  }, []);

  // --- Scan phase ---
  if (phase === "scan") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <h1 className="text-2xl font-bold text-text mb-2">Data Sync</h1>
          <p className="text-text-muted text-sm mb-6">
            Scan the QR code shown on the TTabs server to sync. Data transfers
            directly between devices over your local network.
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

  // --- Connecting ---
  if (phase === "connecting") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-10 h-10 border-2 border-bg-border border-t-accent rounded-full animate-spin mb-4" />
          <p className="text-text-muted text-sm">Connecting to server...</p>
          <p className="text-text-dim text-xs mt-1">Establishing peer-to-peer connection</p>
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
          {progress ? (
            <>
              <p className="text-text text-sm font-medium mb-3">
                {progress.phase === "sending" ? "Sending data..." : "Receiving data..."}
              </p>
              <div className="w-full max-w-xs bg-bg-hover rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-full transition-all duration-150"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-text-dim text-xs mt-2">
                {progress.current} / {progress.total} chunks
              </p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 border-2 border-bg-border border-t-accent rounded-full animate-spin mb-4" />
              <p className="text-text-muted text-sm">Exchanging data...</p>
            </>
          )}
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
          <button
            onClick={reset}
            className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
          >
            Scan again
          </button>
        </main>
      </div>
    );
  }

  return null;
}
