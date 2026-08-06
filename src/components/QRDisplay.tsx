"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { makeFrames, serializeFrame, generateSessionId } from "@/lib/sync/protocol";

interface QRDisplayProps {
  // The encoded payload string (gzip+base64) to stream via QR frames.
  encoded: string;
  // FPS for cycling through frames. Lower = easier to scan but slower transfer.
  fps?: number;
  // Called with progress info as frames cycle.
  onProgress?: (info: { current: number; total: number }) => void;
}

const QR_SIZE = 480;

// Fisher-Yates shuffle — returns a new shuffled array.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Renders an animated sequence of QR codes that cycle through the chunks
// of the encoded payload. The receiver scans these frames and reassembles them.
//
// Key design decisions for reliable scanning:
//   - Recursive setTimeout (not setInterval) so each frame is fully rendered
//     before the next is scheduled. This prevents the "slowdown after N frames"
//     bug where async render operations pile up.
//   - A settle delay after each render gives the camera time to capture the
//     frame before it changes.
//   - Frames are shuffled on each loop so consistently-missed frames get
//     chances at different timing positions.
export default function QRDisplay({ encoded, fps = 4, onProgress }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoop] = useState(0);
  const framesRef = useRef<string[]>([]); // serialized frame strings (original order)
  const orderRef = useRef<number[]>([]); // shuffled indices for the current loop
  const orderPosRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onProgressRef = useRef(onProgress);
  const runningRef = useRef(true);

  // Keep the onProgress ref current without retriggering the animation effect.
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Build the frames once when the encoded payload changes.
  useEffect(() => {
    if (!encoded) return;
    const sessionId = generateSessionId();
    const frames = makeFrames(encoded, sessionId);
    framesRef.current = frames.map(serializeFrame);
    setTotal(frames.length);
    // First loop: sequential order so the receiver learns the total quickly.
    orderRef.current = frames.map((_, i) => i);
    orderPosRef.current = 0;
    setCurrent(0);
    setLoop(0);
  }, [encoded]);

  // Render one frame to the canvas.
  const renderFrame = useCallback(async (frameText: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await QRCode.toCanvas(canvas, frameText, {
        width: QR_SIZE,
        margin: 1,
        errorCorrectionLevel: "M", // better scan resilience than L
        color: { dark: "#0a0a0b", light: "#ffffff" },
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Animation loop using recursive setTimeout. This ensures each frame is
  // fully rendered (and given time to be scanned) before the next one starts.
  useEffect(() => {
    if (framesRef.current.length === 0) return;
    runningRef.current = true;

    const interval = 1000 / fps;
    // Extra settle time after rendering — gives the camera time to capture
    // the frame cleanly before it changes.
    const settleMs = 80;

    const tick = async () => {
      if (!runningRef.current) return;
      const frames = framesRef.current;
      const order = orderRef.current;
      if (frames.length === 0 || order.length === 0) return;

      const orderPos = orderPosRef.current;
      const frameIdx = order[orderPos];

      await renderFrame(frames[frameIdx]);
      setCurrent(frameIdx + 1);
      onProgressRef.current?.({ current: frameIdx + 1, total: frames.length });

      const nextPos = orderPos + 1;
      if (nextPos >= order.length) {
        // Completed a full loop — reshuffle for the next pass so frames
        // that were consistently missed get different timing positions.
        orderRef.current = shuffled(frames.map((_, i) => i));
        orderPosRef.current = 0;
        setLoop(l => l + 1);
      } else {
        orderPosRef.current = nextPos;
      }

      if (runningRef.current) {
        timerRef.current = setTimeout(tick, interval + settleMs);
      }
    };

    tick(); // render the first frame immediately
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fps, renderFrame, encoded]);

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
        <canvas
          ref={canvasRef}
          width={QR_SIZE}
          height={QR_SIZE}
          className="block w-full max-w-[360px] h-auto"
        />
      </div>
      <div className="text-center">
        <div className="text-text-muted text-sm">
          Frame {current} / {total}
          {loop > 0 && <span className="text-text-dim"> (loop {loop + 1})</span>}
        </div>
        <div className="text-text-dim text-xs mt-1">
          Keep your screen steady — frames shuffle each loop for reliability
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
