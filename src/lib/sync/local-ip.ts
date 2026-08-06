// Detect the server's local network IP address.
// Used by the sync session endpoint to tell the mobile app where to connect.

import { networkInterfaces } from "os";

export function getLocalIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal/loopback and non-IPv4 addresses.
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}
