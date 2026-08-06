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
//   3. The offerer sends each chunk (48KB) as a JSON message
//   4. The answerer reassembles, merges, and sends its own payload back
//   5. The offerer merges the received payload

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

// STUN servers for NAT traversal. For local network connections,
// host candidates (local IPs) are used directly without STUN.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

const CHUNK_SIZE = 48 * 1024; // 48KB per data channel message
const ICE_GATHER_TIMEOUT = 10000; // 10s for ICE gathering
const CHANNEL_OPEN_TIMEOUT = 60000; // 60s for data channel to open

// Log with prefix for debugging. Check browser console to see these.
function log(...args: unknown[]) {
  console.log("[WebRTC]", ...args);
}

// Wait for ICE gathering to complete (non-trickle ICE).
// Resolves when gathering is complete or after a timeout.
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      log("ICE gathering timeout after", timeoutMs, "ms, state:", pc.iceGatheringState);
      resolve();
    }, timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      log("ICE gathering state:", pc.iceGatheringState);
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

// Monitor ICE connection state. Returns a promise that rejects early
// if the connection fails, so we don't wait for the full timeout.
function monitorIceConnection(pc: RTCPeerConnection): { failed: Promise<never>; cleanup: () => void } {
  let rejectFn: (e: Error) => void;
  const failed = new Promise<never>((_, reject) => {
    rejectFn = reject;
  });
  const handler = () => {
    log("ICE connection state:", pc.iceConnectionState);
    if (pc.iceConnectionState === "failed") {
      rejectFn(new Error("ICE connection failed — devices could not establish a direct connection. Make sure both devices are on the same network."));
    }
  };
  pc.addEventListener("iceconnectionstatechange", handler);
  return {
    failed,
    cleanup: () => pc.removeEventListener("iceconnectionstatechange", handler),
  };
}

// Wait for a data channel to open, with ICE failure detection.
function waitForChannelOpen(channel: RTCDataChannel, pc: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (channel.readyState === "open") {
      resolve();
      return;
    }
    const iceMonitor = monitorIceConnection(pc);
    const timer = setTimeout(() => {
      iceMonitor.cleanup();
      reject(new Error(`Data channel did not open within ${CHANNEL_OPEN_TIMEOUT / 1000}s (ICE state: ${pc.iceConnectionState})`));
    }, CHANNEL_OPEN_TIMEOUT);

    channel.addEventListener("open", () => {
      log("Data channel opened");
      clearTimeout(timer);
      iceMonitor.cleanup();
      resolve();
    });
    channel.addEventListener("error", (e) => {
      log("Data channel error:", e);
      clearTimeout(timer);
      iceMonitor.cleanup();
      reject(new Error(`Data channel error: ${e}`));
    });
    iceMonitor.failed.catch((e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// Send a payload over a data channel in chunks.
async function sendPayloadOverChannel(
  channel: RTCDataChannel,
  payload: unknown,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const json = JSON.stringify(payload);
  const totalChunks = Math.ceil(json.length / CHUNK_SIZE);
  const totalSize = json.length;
  log("Sending payload:", totalSize, "bytes,", totalChunks, "chunks");

  channel.send(JSON.stringify({ type: "start", totalChunks, totalSize }));

  for (let i = 0; i < totalChunks; i++) {
    const chunk = json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    while (channel.bufferedAmount > 1024 * 1024) {
      await new Promise(r => setTimeout(r, 10));
    }
    channel.send(JSON.stringify({ type: "chunk", index: i, data: chunk }));
    onProgress?.(i + 1, totalChunks);
  }

  channel.send(JSON.stringify({ type: "end" }));
  log("Payload sent");
}

// Receive a chunked payload from a data channel.
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
          log("Receiving payload:", msg.totalSize, "bytes,", totalChunks, "chunks");
        } else if (msg.type === "chunk") {
          receivedChunks[msg.index] = msg.data;
          receivedCount++;
          onProgress?.(receivedCount, totalChunks);
        } else if (msg.type === "end") {
          channel.removeEventListener("message", handler);
          const json = receivedChunks.join("");
          log("Payload received");
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

// Poll the signaling server.
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
    if (data[field]) {
      log(`Got ${field} from signaling server`);
      return data[field]!;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${field}`);
}

// Store SDP in the signaling server.
async function storeSignal(serverUrl: string, sessionId: string, type: "offer" | "answer", value: string): Promise<void> {
  const resp = await fetch(`${serverUrl}/api/sync/signal?session=${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, value }),
  });
  if (!resp.ok) throw new Error(`Failed to store ${type}: ${resp.status}`);
  log(`Stored ${type} in signaling server`);
}

// --- Offerer (laptop/server) ---

export async function syncAsOfferer(opts: WebRTCSyncOptions): Promise<void> {
  log("Starting as offerer");
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const channel = pc.createDataChannel("sync", { ordered: true });

  // Set up receive handler (we'll receive the mobile's payload after sending ours)
  const receivePromise = receivePayloadOverChannel(channel, (current, total) => {
    opts.onProgress?.({ phase: "receiving", current, total });
  });

  // Create offer and set local description
  log("Creating offer...");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  log("Waiting for ICE gathering...");
  await waitForIceGathering(pc);

  // Store the offer in the signaling server
  await storeSignal(opts.serverUrl, opts.sessionId, "offer", JSON.stringify(pc.localDescription));

  // Wait for the answer from the mobile
  log("Waiting for answer...");
  const answerStr = await waitForSignal(opts.serverUrl, opts.sessionId, "answer", opts.signal);
  const answer = JSON.parse(answerStr);
  log("Setting remote description (answer)...");
  await pc.setRemoteDescription(answer);

  // Wait for the data channel to open
  await waitForChannelOpen(channel, pc);
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
  log("Offerer done");
}

// --- Answerer (mobile) ---

export async function syncAsAnswerer(opts: WebRTCSyncOptions): Promise<void> {
  log("Starting as answerer");
  const pc = new RTCPeerConnection(ICE_SERVERS);

  // Set up data channel listener — the event fires when setRemoteDescription
  // processes the offer. We capture the channel in a deferred promise so the
  // timeout only starts when we actually begin waiting (after setRemoteDescription).
  let channelResolve!: (ch: RTCDataChannel) => void;
  let channelReject!: (e: Error) => void;
  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    channelResolve = resolve;
    channelReject = reject;
  });
  pc.addEventListener("datachannel", (e) => {
    log("Data channel received from offerer");
    channelResolve(e.channel);
  });

  // Fetch the offer from the signaling server
  log("Waiting for offer...");
  const offerStr = await waitForSignal(opts.serverUrl, opts.sessionId, "offer", opts.signal);
  const offer = JSON.parse(offerStr);
  log("Setting remote description (offer)...");
  await pc.setRemoteDescription(offer);

  // Create answer and set local description
  log("Creating answer...");
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  log("Waiting for ICE gathering...");
  await waitForIceGathering(pc);

  // Store the answer in the signaling server
  await storeSignal(opts.serverUrl, opts.sessionId, "answer", JSON.stringify(pc.localDescription));

  // Now wait for the data channel — with a timeout that starts NOW,
  // not when the function was first called.
  log("Waiting for data channel...");
  const channelTimer = setTimeout(() => {
    channelReject(new Error(`Data channel did not arrive within ${CHANNEL_OPEN_TIMEOUT / 1000}s`));
  }, CHANNEL_OPEN_TIMEOUT);

  const iceMonitor = monitorIceConnection(pc);
  iceMonitor.failed.catch((e) => {
    clearTimeout(channelTimer);
    channelReject(e);
  });

  const channel = await channelPromise;
  clearTimeout(channelTimer);
  iceMonitor.cleanup();

  // Wait for the channel to open
  await waitForChannelOpen(channel, pc);
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
  log("Answerer done");
}
