import { describe, expect, it, vi } from "vitest";
import { fetchLyrics, parseLrc } from "@/lib/lyrics";
import { mockFetch } from "./support/helpers";

describe("parseLrc", () => {
  it("parses timestamps into milliseconds", () => {
    expect(parseLrc("[00:12.50] First line\n[01:02.03] Second line")).toEqual([
      { timeMs: 12_500, text: "First line" },
      { timeMs: 62_030, text: "Second line" },
    ]);
  });

  it("handles timestamps without a fraction and beyond 59 minutes", () => {
    expect(parseLrc("[00:07] a\n[61:00.5] b")).toEqual([
      { timeMs: 7_000, text: "a" },
      { timeMs: 3_660_500, text: "b" },
    ]);
  });

  it("repeats a line that carries several timestamps and sorts by time", () => {
    expect(parseLrc("[00:30.00][00:10.00] Chorus\n[00:20.00] Verse")).toEqual([
      { timeMs: 10_000, text: "Chorus" },
      { timeMs: 20_000, text: "Verse" },
      { timeMs: 30_000, text: "Chorus" },
    ]);
  });

  it("keeps timed lines without text, which mark instrumental gaps", () => {
    expect(parseLrc("[00:05.00]\n[00:09.00] Words")).toEqual([
      { timeMs: 5_000, text: "" },
      { timeMs: 9_000, text: "Words" },
    ]);
  });

  it("ignores metadata tags, untimed lines and blank lines", () => {
    expect(parseLrc("[ar:Queen]\n[length:05:54]\n\nNo timestamp here\n[00:01.00] Real")).toEqual([
      { timeMs: 1_000, text: "Real" },
    ]);
  });
});

describe("fetchLyrics", () => {
  const track = { name: "Song", artist: "Artist", album: "Album", durationMs: 200_400 };
  const record = (overrides: object) => ({
    duration: 200,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...overrides,
  });

  it("returns synced lyrics from the exact lookup without searching", async () => {
    const calls = mockFetch(() => ({ body: record({ syncedLyrics: "[00:01.00] Hi" }) }));

    expect(await fetchLyrics(track)).toEqual({ kind: "synced", lines: [{ timeMs: 1_000, text: "Hi" }] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe("/api/get");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
      track_name: "Song",
      artist_name: "Artist",
      album_name: "Album",
      duration: "200",
    });
  });

  it("falls back to a search when the exact lookup finds nothing", async () => {
    const calls = mockFetch((url) =>
      url.pathname === "/api/get"
        ? { status: 404 }
        : { body: [record({ syncedLyrics: "[00:02.00] Found" })] },
    );

    expect(await fetchLyrics(track)).toEqual({ kind: "synced", lines: [{ timeMs: 2_000, text: "Found" }] });
    expect(calls[1].url.pathname).toBe("/api/search");
    expect(Object.fromEntries(calls[1].url.searchParams)).toEqual({ track_name: "Song", artist_name: "Artist" });
  });

  it("prefers a synced search result over plain lyrics from the exact lookup", async () => {
    mockFetch((url) =>
      url.pathname === "/api/get"
        ? { body: record({ plainLyrics: "Plain" }) }
        : { body: [record({ syncedLyrics: "[00:03.00] Synced" })] },
    );

    expect((await fetchLyrics(track)).kind).toBe("synced");
  });

  it("keeps the plain lyrics when the search has nothing better", async () => {
    mockFetch((url) => (url.pathname === "/api/get" ? { body: record({ plainLyrics: "Plain" }) } : { body: [] }));

    expect(await fetchLyrics(track)).toEqual({ kind: "plain", text: "Plain" });
  });

  it("only accepts search results within three seconds of the track length", async () => {
    mockFetch((url) =>
      url.pathname === "/api/get"
        ? { status: 404 }
        : {
            body: [
              record({ duration: 260, syncedLyrics: "[00:01.00] Live version" }),
              record({ duration: 203, plainLyrics: "Close enough" }),
            ],
          },
    );

    expect(await fetchLyrics(track)).toEqual({ kind: "plain", text: "Close enough" });
  });

  it("picks a synced candidate over a closer plain one", async () => {
    mockFetch((url) =>
      url.pathname === "/api/get"
        ? { status: 404 }
        : {
            body: [
              record({ duration: 200, plainLyrics: "Plain" }),
              record({ duration: 202, syncedLyrics: "[00:04.00] Synced" }),
            ],
          },
    );

    expect((await fetchLyrics(track)).kind).toBe("synced");
  });

  it("keeps the plain lyrics when the search fails", async () => {
    vi.stubGlobal("fetch", async (input: string) => {
      if (new URL(input).pathname === "/api/get") return Response.json(record({ plainLyrics: "Plain" }));
      throw new TypeError("network down");
    });

    expect(await fetchLyrics(track)).toEqual({ kind: "plain", text: "Plain" });
  });

  it("reports instrumental tracks", async () => {
    mockFetch((url) => (url.pathname === "/api/get" ? { body: record({ instrumental: true }) } : { body: [] }));

    expect(await fetchLyrics(track)).toEqual({ kind: "instrumental" });
  });

  it("reports none when nothing is found anywhere", async () => {
    mockFetch((url) => (url.pathname === "/api/get" ? { status: 404 } : { body: [] }));

    expect(await fetchLyrics(track)).toEqual({ kind: "none" });
  });

  it("treats synced lyrics without any timed line as missing", async () => {
    mockFetch((url) =>
      url.pathname === "/api/get"
        ? { body: record({ syncedLyrics: "no timestamps", plainLyrics: "Plain" }) }
        : { status: 500 },
    );

    expect(await fetchLyrics(track)).toEqual({ kind: "plain", text: "Plain" });
  });
});
