// In-memory stand-in for the "cloudflare:workers" module (see vitest.config.ts).
// Entries never expire; the TTL is only recorded so tests can assert on it.

type Entry = { value: string; expirationTtl?: number };

export const kvEntries = new Map<string, Entry>();

export const env = {
  SPOTIFY_CLIENT_ID: "test-client-id",
  SPOTIFY_CLIENT_SECRET: "test-client-secret",
  KV: {
    async get(key: string, type?: "json") {
      const entry = kvEntries.get(key);
      if (!entry) return null;
      return type === "json" ? JSON.parse(entry.value) : entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      kvEntries.set(key, { value, expirationTtl: options?.expirationTtl });
    },
    async delete(key: string) {
      kvEntries.delete(key);
    },
  },
};
