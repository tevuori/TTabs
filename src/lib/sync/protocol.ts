// QR sync protocol for TTabs.
//
// QR codes have a practical capacity of ~1-3 KB, but a library can be
// megabytes. We use animated chunked QR streaming: the sender displays a
// fast-cycling sequence of QR frames, the receiver's camera reads them in
// order and reassembles.
//
// Payload pipeline:
//   SyncPayload (JSON) → gzip → base64 → chunked → QR frames
//
// Frame format (text encoded in each QR):
//   TT1|<sessionId>|<totalChunks>|<chunkIndex>|<base64Chunk>
//
//   TT1         = protocol marker + version
//   sessionId   = random 6-char ID identifying the transfer session
//   totalChunks = total number of frames in the session
//   chunkIndex  = 0-based index of this frame
//   base64Chunk = the chunk payload (~700 bytes of base64)

import type { SyncPayload } from "../storage/types";

export const PROTOCOL_MARKER = "TT1";
export const DEFAULT_CHUNK_SIZE = 700; // base64 chars per QR frame

export interface Frame {
  sessionId: string;
  totalChunks: number;
  chunkIndex: number;
  chunk: string;
}

// --- Compression (gzip via native CompressionStream, with fallback) ---

export async function encodePayload(payload: SyncPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);

  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(bytes as BufferSource);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return base64Encode(merged);
  }

  // Fallback: no compression (rare in modern browsers/WebViews).
  return base64Encode(bytes);
}

export async function decodePayload(encoded: string): Promise<SyncPayload> {
  const bytes = base64Decode(encoded);

  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(bytes as BufferSource);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const json = new TextDecoder().decode(merged);
    return JSON.parse(json) as SyncPayload;
  }

  // Fallback: no decompression.
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as SyncPayload;
}

// --- Base64 (handles large byte arrays via chunking) ---

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000; // 32KB per chunk to avoid call stack limits
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Chunking ---

export function makeFrames(
  encoded: string,
  sessionId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Frame[] {
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length; i += chunkSize) {
    chunks.push(encoded.slice(i, i + chunkSize));
  }
  const totalChunks = chunks.length;
  return chunks.map((chunk, index) => ({
    sessionId,
    totalChunks,
    chunkIndex: index,
    chunk,
  }));
}

// Serialize a frame to the QR text format.
export function serializeFrame(frame: Frame): string {
  return `${PROTOCOL_MARKER}|${frame.sessionId}|${frame.totalChunks}|${frame.chunkIndex}|${frame.chunk}`;
}

// Parse a QR text into a frame, or null if it's not a valid TTabs frame.
export function parseFrame(text: string): Frame | null {
  const parts = text.split("|");
  if (parts.length < 5) return null;
  if (parts[0] !== PROTOCOL_MARKER) return null;
  const sessionId = parts[1];
  const totalChunks = parseInt(parts[2], 10);
  const chunkIndex = parseInt(parts[3], 10);
  // The chunk itself may contain "|" characters, so rejoin the rest.
  const chunk = parts.slice(4).join("|");
  if (!sessionId || Number.isNaN(totalChunks) || Number.isNaN(chunkIndex)) {
    return null;
  }
  return { sessionId, totalChunks, chunkIndex, chunk };
}

// Reassemble chunks into the original encoded string.
// Returns null if not all chunks are present yet.
export function reassemble(
  chunks: Map<number, string>,
  total: number
): string | null {
  if (chunks.size < total) return null;
  let result = "";
  for (let i = 0; i < total; i++) {
    const c = chunks.get(i);
    if (c === undefined) return null;
    result += c;
  }
  return result;
}

// Generate a random session ID (6 alphanumeric chars).
export function generateSessionId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
