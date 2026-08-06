"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { makeFrames, serializeFrame, generateSessionId } from "@/lib/sync/protocol";

interface QRDisplayProps {
  // The encoded payload string (gzip+base64) to stream via QR frames.
  encoded: string;
  // FPS for cycling through frames. Higher = faster transfer but harder to scan.
  fps?: number;
  // Called with progress info as frames cycle.
  onProgress?: (info: { current: number; total: number }) => void;
}

// Renders an animated sequence of QR codes that cycle through the chunks
// of the encoded payload. The receiver scans these frames in order and
// reassembles them.
export default function QRDisplay({ encoded, fps = 10, onProgress }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const framesRef = useRef<string[]>([]); // serialized frame strings
  const indexRef = useRef(0);

  // Build the frames once when the encoded payload changes.
  useEffect(() => {
    if (!encoded) return;
    const sessionId = generateSessionId();
    const frames = makeFrames(encoded, sessionId);
    framesRef.current = frames.map(serializeFrame);
    setTotal(frames.length);
    indexRef.current = 0;
    setCurrent(0);
  }, [encoded]);

  // Render the current frame to the canvas, then advance on a timer.
  const renderFrame = useCallback(async (frameText: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await QRCode.toCanvas(canvas, frameText, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: "L", // max data capacity
        color: { dark: "#0a0a0b", light: "#ffffff" },
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (framesRef.current.length === 0) return;
    const interval = 1000 / fps;

    const tick = async () => {
      const frames = framesRef.current;
      if (frames.length === 0) return;
      const idx = indexRef.current;
      await renderFrame(frames[idx]);
      setCurrent(idx + 1);
      onProgress?.({ current: idx + 1, total: frames.length });
      // Loop back to the start so the receiver can re-scan missed frames.
      indexRef.current = (idx + 1) % frames.length;
    };

    tick(); // render immediately
    const timer = setInterval(tick, interval);
    return () => clearInterval(timer);
  }, [fps, renderFrame, onProgress]);

  if (error) {
    return (
      <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-sm">
        Failed to generate QR: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white rounded-xl p-3 shadow-lg">
        <canvas ref={canvasRef} width={320} height={320} className="block" />
      </div>
      <div className="text-center">
        <div className="text-text-muted text-sm">
          Frame {current} / {total}
        </div>
        <div className="text-text-dim text-xs mt-1">
          Keep your screen steady — frames loop until the receiver confirms
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full max-w-xs bg-bg-hover rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-accent h-full transition-all duration-150"
          style={{ width: `${total > 0 ? (current / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
