export type LyricLine = { timeMs: number; text: string };

export type Lyrics =
  | { kind: "synced"; lines: LyricLine[] }
  | { kind: "plain"; text: string }
  | { kind: "instrumental" }
  | { kind: "none" };

export type TrackQuery = { name: string; artist: string; album: string; durationMs: number };

type LrclibRecord = {
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const LRCLIB = "https://lrclib.net/api";

// Parses LRC text such as "[01:23.45] line". A line may carry several timestamps.
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const [, minutes, seconds] of stamps) {
      lines.push({ timeMs: Math.round((Number(minutes) * 60 + Number(seconds)) * 1000), text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function toLyrics(record: LrclibRecord | null): Lyrics {
  if (!record) return { kind: "none" };
  if (record.instrumental) return { kind: "instrumental" };
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics);
    if (lines.length > 0) return { kind: "synced", lines };
  }
  if (record.plainLyrics) return { kind: "plain", text: record.plainLyrics };
  return { kind: "none" };
}

export async function fetchLyrics(track: TrackQuery, signal?: AbortSignal): Promise<Lyrics> {
  const seconds = Math.round(track.durationMs / 1000);

  const exact = await fetch(
    `${LRCLIB}/get?${new URLSearchParams({
      track_name: track.name,
      artist_name: track.artist,
      album_name: track.album,
      duration: String(seconds),
    })}`,
    { signal },
  );
  let exactLyrics: Lyrics = { kind: "none" };
  if (exact.ok) {
    exactLyrics = toLyrics(await exact.json());
    if (exactLyrics.kind === "synced") return exactLyrics;
  }

  // The exact lookup misses when Spotify's album name differs (remasters,
  // deluxe editions), so fall back to a search and match on duration.
  let candidates: LrclibRecord[] = [];
  try {
    const search = await fetch(
      `${LRCLIB}/search?${new URLSearchParams({ track_name: track.name, artist_name: track.artist })}`,
      { signal },
    );
    if (search.ok) candidates = await search.json();
  } catch (error) {
    // An aborted lookup must not deliver lyrics for a track that is no longer playing.
    if (signal?.aborted) throw error;
  }
  const close = candidates
    .filter((c) => Math.abs(c.duration - seconds) <= 3)
    .sort((a, b) => Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds));
  const best = close.find((c) => c.syncedLyrics) ?? close[0] ?? null;

  const found = toLyrics(best);
  return found.kind === "synced" || exactLyrics.kind === "none" ? found : exactLyrics;
}
