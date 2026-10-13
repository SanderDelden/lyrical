import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Spotify only accepts http redirect URIs on the 127.0.0.1 loopback address
  // (not "localhost"), and the URI must match exactly, so pin host and port.
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
