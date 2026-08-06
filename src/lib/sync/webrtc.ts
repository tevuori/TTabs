// WebRTC sync helper for TTabs.
//
// Establishes a direct peer-to-peer data channel between the laptop browser
// (server mode) and the mobile app (mobile mode). The Vercel server is only
// used for signaling (exchanging SDP offer/answer) — actual data flows
// directly between the two devices, typically over the local WiFi network.
//
// Two roles:
//   - "offerer" (server/laptop): creates the RTCPeerConnection, data channel,
//     and SDP offer. Polls for the answer.
//   - "answerer" (mobile): fetches the offer, creates the SDP answer, and
//     receives the data channel.
//
// Data transfer protocol over the data channel:
//   1. Both sides serialize their SyncPayload to JSON
//   2. The offerer sends a "start" message with total size and chunk count
//   3. The offerer sends each chunk (64KB) as a JSON message
//   4. The answerer reassembles, merges, and sends its own payload back
//   5. The offerer merges the received payload
//
// Chunking is used because WebRTC data channels have practical message size
// limits (~256KB in some implementations).

export type SyncRole = "offerer" | "answerer";

export interface WebRTCSyncOptions {
  role: SyncRole;
  // The base URL of the signaling server (e.g. "https://tabs.tevuori.eu")
  serverUrl: string;
  // The sync session ID
  sessionId: string;
  // The local SyncPayload to send to the other side
  payload: unknown;
  // Called when the connection is established
  onConnected?: () => void;
  // Called with progress info during data transfer
  onProgress?: (info: { phase: "sending" | "receiving"; current: number; total: number }) => void;
  // Called when the remote payload is received
  onReceived: (payload: unknown) => void;
  // Called when the local payload has been sent
  onSent?: () => void;
  // AbortSignal to cancel the sync
  signal?: AbortSignal;
}

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CHUNK_SIZE = 48 * 1024; // 48KB per data channel message (safe for all browsers)

// Wait for ICE gathering to complete, then return the local description
// with all candidates included (non-trickle ICE).
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timer = setTimeout(() => resolve(), timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

// Send a payload over a data channel in chunks.
// Returns a promise that resolves when all chunks are sent and buffered
// amount drops to zero.
async function sendPayloadOverChannel(
  channel: RTCDataChannel,
  payload: unknown,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const json = JSON.stringify(payload);
  const totalChunks = Math.ceil(json.length / CHUNK_SIZE);
  const totalSize = json.length;

  // Send start message
  channel.send(JSON.stringify({ type: "start", totalChunks, totalSize }));

  for (let i = 0; i < totalChunks; i++) {
    const chunk = json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    // Wait if the buffer is backed up
    while (channel.bufferedAmount > 1024 * 1024) {
      await new Promise(r => setTimeout(r, 10));
    }
    channel.send(JSON.stringify({ type: "chunk", index: i, data: chunk }));
    onProgress?.(i + 1, totalChunks);
  }

  // Send end message
  channel.send(JSON.stringify({ type: "end" }));
}

// Receive a chunked payload from a data channel.
// Returns a promise that resolves with the reassembled JSON string.
function receivePayloadOverChannel(
  channel: RTCDataChannel,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let totalChunks = 0;
    let receivedChunks: string[] = [];
    let receivedCount = 0;

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "start") {
          totalChunks = msg.totalChunks;
          receivedChunks = new Array(totalChunks);
          receivedCount = 0;
        } else if (msg.type === "chunk") {
          receivedChunks[msg.index] = msg.data;
          receivedCount++;
          onProgress?.(receivedCount, totalChunks);
        } else if (msg.type === "end") {
          channel.removeEventListener("message", handler);
          const json = receivedChunks.join("");
          resolve(json);
        }
      } catch (e) {
        channel.removeEventListener("message", handler);
        reject(e);
      }
    };

    channel.addEventListener("message", handler);
  });
}

// Poll the signaling server for the answer (offerer) or offer (answerer).
async function fetchSignal(serverUrl: string, sessionId: string): Promise<{ offer: string | null; answer: string | null; status: string }> {
  const resp = await fetch(`${serverUrl}/api/sync/signal?session=${sessionId}`);
  if (!resp.ok) throw new Error(`Signal fetch failed: ${resp.status}`);
  return resp.json();
}

// Wait for a signal field to appear by polling.
async function waitForSignal(
  serverUrl: string,
  sessionId: string,
  field: "offer" | "answer",
  signal?: AbortSignal
): Promise<string> {
  const maxAttempts = 120; // 2 minutes at 1s interval
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) throw new Error("Aborted");
    const data = await fetchSignal(serverUrl, sessionId);
    if (data[field]) return data[field]!;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${field}`);
}

// --- Offerer (laptop/server) ---

export async function syncAsOfferer(opts: WebRTCSyncOptions): Promise<void> {
  const pc = new RTCPeerConnection(STUN_SERVERS);
  const channel = pc.createDataChannel("sync", { ordered: true });

  // Set up receive handler (we'll receive the mobile's payload after sending ours)
  const receivePromise = receivePayloadOverChannel(channel, (current, total) => {
    opts.onProgress?.({ phase: "receiving", current, total });
  });

  // Create offer and set local description
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  // Store the offer in the signaling server
  await fetch(`${opts.serverUrl}/api/sync/signal?session=${opts.sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "offer", value: JSON.stringify(pc.localDescription) }),
  });

  // Wait for the answer from the mobile
  const answerStr = await waitForSignal(opts.serverUrl, opts.sessionId, "answer", opts.signal);
  const answer = JSON.parse(answerStr);
  await pc.setRemoteDescription(answer);

  // Wait for the data channel to open
  await new Promise<void>((resolve, reject) => {
    if (channel.readyState === "open") {
      resolve();
      return;
    }
    channel.addEventListener("open", () => resolve());
    channel.addEventListener("error", (e) => reject(new Error(`Data channel error: ${e}`)));
    setTimeout(() => reject(new Error("Data channel timeout")), 30000);
  });

  opts.onConnected?.();

  // Send our payload to the mobile
  await sendPayloadOverChannel(channel, opts.payload, (current, total) => {
    opts.onProgress?.({ phase: "sending", current, total });
  });
  opts.onSent?.();

  // Receive the mobile's payload
  const receivedJson = await receivePromise;
  const receivedPayload = JSON.parse(receivedJson);
  opts.onReceived(receivedPayload);

  // Clean up
  channel.close();
  pc.close();
}

// --- Answerer (mobile) ---

export async function syncAsAnswerer(opts: WebRTCSyncOptions): Promise<void> {
  const pc = new RTCPeerConnection(STUN_SERVERS);

  // Set up a promise that resolves when the data channel arrives
  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    pc.addEventListener("datachannel", (e) => resolve(e.channel));
    setTimeout(() => reject(new Error("Data channel timeout")), 30000);
  });

  // Fetch the offer from the signaling server
  const offerStr = await waitForSignal(opts.serverUrl, opts.sessionId, "offer", opts.signal);
  const offer = JSON.parse(offerStr);
  await pc.setRemoteDescription(offer);

  // Create answer and set local description
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);

  // Store the answer in the signaling server
  await fetch(`${opts.serverUrl}/api/sync/signal?session=${opts.sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "answer", value: JSON.stringify(pc.localDescription) }),
  });

  // Wait for the data channel and for it to open
  const channel = await channelPromise;
  await new Promise<void>((resolve, reject) => {
    if (channel.readyState === "open") {
      resolve();
      return;
    }
    channel.addEventListener("open", () => resolve());
    channel.addEventListener("error", (e) => reject(new Error(`Data channel error: ${e}`)));
    setTimeout(() => reject(new Error("Data channel open timeout")), 30000);
  });

  opts.onConnected?.();

  // Receive the offerer's payload first
  const receivePromise = receivePayloadOverChannel(channel, (current, total) => {
    opts.onProgress?.({ phase: "receiving", current, total });
  });
  const receivedJson = await receivePromise;
  const receivedPayload = JSON.parse(receivedJson);
  opts.onReceived(receivedPayload);

  // Send our payload back
  await sendPayloadOverChannel(channel, opts.payload, (current, total) => {
    opts.onProgress?.({ phase: "sending", current, total });
  });
  opts.onSent?.();

  // Clean up
  channel.close();
  pc.close();
}
