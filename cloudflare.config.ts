import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "lyrical",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-13",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      // Pairing codes and Spotify sessions.
      KV: bindings.kv(),
      // Local dev reads these from .dev.vars (see .dev.vars.example).
      SPOTIFY_CLIENT_ID: bindings.secret(),
      SPOTIFY_CLIENT_SECRET: bindings.secret(),
    },
  }),
});
