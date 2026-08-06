"use client";

interface TransposeControlsProps {
  transposition: number;
  onTranspose: (semitones: number) => void;
  onReset: () => void;
  currentKey: string | null;
  transposedKey: string | null;
}

export default function TransposeControls({
  transposition,
  onTranspose,
  onReset,
  currentKey,
  transposedKey,
}: TransposeControlsProps) {
  return (
    <div className="flex items-center gap-3 bg-bg-card border border-bg-border rounded-xl p-2">
      <div className="flex items-center gap-1">
        <span className="text-text-muted text-xs font-medium px-2">Transpose</span>
        <button
          onClick={() => onTranspose(transposition - 1)}
          className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors"
          title="Transpose down"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-text font-mono font-semibold text-sm min-w-[40px] text-center">
          {transposition > 0 ? `+${transposition}` : transposition}
        </span>
        <button
          onClick={() => onTranspose(transposition + 1)}
          className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors"
          title="Transpose up"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 9L7 5L11 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {transposition !== 0 && (
        <button
          onClick={onReset}
          className="px-2 py-1 text-xs text-text-muted hover:text-accent transition-colors"
        >
          Reset
        </button>
      )}

      <div className="h-5 w-px bg-bg-border" />

      <div className="flex items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-text-dim">Key:</span>
          <span className="text-text-muted font-mono">{currentKey || "—"}</span>
        </div>
        {transposition !== 0 && transposedKey && (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-dim">
              <path d="M4 3L8 6L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-accent font-mono font-semibold">{transposedKey}</span>
          </>
        )}
      </div>
    </div>
  );
}
