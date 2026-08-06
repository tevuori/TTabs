import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tevuori.ttabs",
  appName: "TTabs",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  android: {
    // Allow mixed content (the WebView serves from local assets, but some
    // chord-db data or fonts may come from https origins).
    allowMixedContent: true,
  },
};

export default config;
