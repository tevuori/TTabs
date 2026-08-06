"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  parseFrame,
  reassemble,
  decodePayload,
  type Frame,
} from "@/lib/sync/protocol";
import type { SyncPayload } from "@/lib/storage/types";

interface QRScannerProps {
  // Called when the full payload has been reassembled and decoded.
  onPayload: (payload: SyncPayload) => void;
  // Called with progress info as frames are collected.
  onProgress?: (info: { collected: number; total: number }) => void;
}

// Scans QR codes via the device camera and reassembles the chunked frames
// into a complete SyncPayload.
export default function QRScanner({ onPayload, onProgress }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState(0);
  const [total, setTotal] = useState(0);

  // Accumulated chunks for the current session.
  const chunksRef = useRef<Map<number, string>>(new Map());
  const totalRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const doneRef = useRef(false);

  const handleResult = useCallback(
    async (text: string) => {
      if (doneRef.current) return;
      const frame = parseFrame(text);
      if (!frame) return;

      // Reset if a new session starts (e.g. sender restarted).
      if (sessionIdRef.current && frame.sessionId !== sessionIdRef.current) {
        chunksRef.current = new Map();
        sessionIdRef.current = frame.sessionId;
        totalRef.current = frame.totalChunks;
        setCollected(0);
        setTotal(frame.totalChunks);
      } else if (!sessionIdRef.current) {
        sessionIdRef.current = frame.sessionId;
        totalRef.current = frame.totalChunks;
        setTotal(frame.totalChunks);
      }

      // Store the chunk (dedup by index).
      if (!chunksRef.current.has(frame.chunkIndex)) {
        chunksRef.current.set(frame.chunkIndex, frame.chunk);
        const newCount = chunksRef.current.size;
        setCollected(newCount);
        onProgress?.({ collected: newCount, total: totalRef.current });
      }

      // Check if we have all chunks.
      if (chunksRef.current.size >= totalRef.current) {
        const encoded = reassemble(chunksRef.current, totalRef.current);
        if (encoded) {
          doneRef.current = true;
          setStatus("done");
          // Stop the camera.
          controlsRef.current?.stop();
          try {
            const payload = await decodePayload(encoded);
            onPayload(payload);
          } catch (e) {
            setError(`Failed to decode payload: ${(e as Error).message}`);
            setStatus("error");
          }
        }
      }
    },
    [onPayload, onProgress]
  );

  const startScanning = useCallback(async () => {
    if (status === "scanning") return;
    setStatus("scanning");
    setError(null);
    doneRef.current = false;
    chunksRef.current = new Map();
    sessionIdRef.current = null;
    totalRef.current = 0;
    setCollected(0);
    setTotal(0);

    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      // List cameras and prefer the back camera on mobile.
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      let deviceId: string | undefined;
      if (devices.length > 1) {
        // Heuristic: back cameras often have "back" or "environment" in the label.
        const back = devices.find(d => /back|rear|environment/i.test(d.label));
        deviceId = back?.deviceId || devices[devices.length - 1].deviceId;
      } else if (devices.length === 1) {
        deviceId = devices[0].deviceId;
      }

      const video = videoRef.current;
      if (!video) return;

      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        video,
        (result, _err) => {
          if (result) {
            handleResult(result.getText());
          }
        }
      );
      controlsRef.current = controls;
    } catch (e) {
      setError(`Camera error: ${(e as Error).message}`);
      setStatus("error");
    }
  }, [status, handleResult]);

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStatus("idle");
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Video preview */}
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
        {/* Scanning overlay */}
        {status === "scanning" && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-4 border-2 border-accent/70 rounded-xl" />
            <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-accent animate-pulse" />
          </div>
        )}
        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={startScanning}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl text-sm transition-colors"
            >
              Start camera
            </button>
          </div>
        )}
        {status === "done" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-green-500 rounded-full flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12L10 17L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-white text-sm font-medium">Transfer complete</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="w-full max-w-sm p-3 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Progress */}
      {status === "scanning" && total > 0 && (
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-text-muted text-xs mb-1.5">
            <span>Receiving data</span>
            <span>{collected} / {total} frames</span>
          </div>
          <div className="w-full bg-bg-hover rounded-full h-2 overflow-hidden">
            <div
              className="bg-accent h-full transition-all duration-200"
              style={{ width: `${(collected / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      {status === "scanning" && (
        <button
          onClick={stopScanning}
          className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
        >
          Cancel
        </button>
      )}
      {status === "done" && (
        <button
          onClick={() => {
            setStatus("idle");
            setCollected(0);
            setTotal(0);
          }}
          className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
        >
          Done
        </button>
      )}
    </div>
  );
}
