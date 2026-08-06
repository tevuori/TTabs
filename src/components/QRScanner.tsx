"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface QRScannerProps {
  // Called when a QR code is successfully scanned.
  onScan: (text: string) => void;
}

// Scans a single QR code via the device camera. Once a code is detected,
// the camera stops and the decoded text is passed to onScan.
export default function QRScanner({ onScan }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const startScanning = useCallback(async () => {
    if (status === "scanning") return;
    setStatus("scanning");
    setError(null);

    try {
      const reader = new BrowserMultiFormatReader();

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      let deviceId: string | undefined;
      if (devices.length > 1) {
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
            const text = result.getText();
            controlsRef.current?.stop();
            setStatus("done");
            onScanRef.current(text);
          }
        }
      );
      controlsRef.current = controls;
    } catch (e) {
      setError(`Camera error: ${(e as Error).message}`);
      setStatus("error");
    }
  }, [status]);

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
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
              <p className="text-white text-sm font-medium">QR scanned</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="w-full max-w-sm p-3 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {status === "scanning" && (
        <button
          onClick={stopScanning}
          className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
