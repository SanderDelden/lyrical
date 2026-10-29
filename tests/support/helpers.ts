import { vi } from "vitest";
import { kvEntries } from "./cloudflare-workers";

export const ORIGIN = "https://lyrical.example";

export function request(path: string, init: { method?: string; cookies?: Record<string, string> } = {}) {
  const cookie = Object.entries(init.cookies ?? {})
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: cookie ? { cookie } : undefined,
  });
}

// Route handlers receive their dynamic segments as a promise.
export function params<T>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

// The cookies a response sets, by name. A cleared cookie has an empty value.
export function cookiesSet(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    cookies[pair.slice(0, index)] = decodeURIComponent(pair.slice(index + 1));
  }
  return cookies;
}

export function stored<T>(key: string): T | undefined {
  const entry = kvEntries.get(key);
  return entry ? (JSON.parse(entry.value) as T) : undefined;
}

export function storedTtl(key: string): number | undefined {
  return kvEntries.get(key)?.expirationTtl;
}

export function seed(key: string, value: unknown) {
  kvEntries.set(key, { value: JSON.stringify(value) });
}

type FetchCall = { url: URL; init: RequestInit | undefined };

// Replaces global fetch. The handler receives each outgoing request and returns
// the body (and optionally status) to answer with.
export function mockFetch(handler: (url: URL, init?: RequestInit) => { status?: number; body?: unknown }) {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const { status = 200, body = {} } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}
