"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface QRDisplayProps {
  // The text to encode in the QR code (typically a small JSON string).
  value: string;
  // Optional label shown below the QR code.
  label?: string;
}

// Renders a single static QR code. Used by the sync page to display
// connection info (server URL + session ID) for the mobile app to scan.
export default function QRDisplay({ value, label }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    QRCode.toCanvas(canvas, value, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0b", light: "#ffffff" },
    })
      .then(() => setError(null))
      .catch(e => setError((e as Error).message));
  }, [value]);

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
          width={400}
          height={400}
          className="block w-full max-w-[320px] h-auto"
        />
      </div>
      {label && (
        <p className="text-text-dim text-xs text-center max-w-xs">{label}</p>
      )}
    </div>
  );
}
