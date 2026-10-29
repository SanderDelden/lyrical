"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { fetchLyrics, type LyricLine, type Lyrics } from "@/lib/lyrics";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const POLL_MS = 3000;
const PAIR_POLL_MS = 2000;
// Highlight each line slightly before it is sung, so there is time to read it.
const LEAD_MS = 300;

// Shown under "No lyrics found", so the screen is not just an apology.
const NO_LYRICS_REMARKS = [
  "Time to freestyle.",
  "Just hum confidently.",
  "Make up your own. Nobody will know.",
  "La la la it is, then.",
  "Mumble the verses, nail the chorus.",
  "This one stays between you and the artist.",
  "Perfect moment for an air guitar solo.",
  "Whatever you sing now is technically correct.",
];

// The same track always gets the same remark, so it does not change while it plays.
function remarkFor(trackId: string): string {
  let sum = 0;
  for (const character of trackId) sum += character.charCodeAt(0);
  return NO_LYRICS_REMARKS[sum % NO_LYRICS_REMARKS.length];
}

type Track = {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  imageUrl: string | null;
  // Smallest cover size; it is only shown blurred, as the backdrop.
  backdropUrl: string | null;
};

// progressMs is the playback position at local time `at` (performance.now()).
// isPodcast is set while a podcast episode plays; track is then null.
type Playback = { track: Track | null; isPodcast: boolean; isPlaying: boolean; progressMs: number; at: number };

const IDLE: Playback = { track: null, isPodcast: false, isPlaying: false, progressMs: 0, at: 0 };

// /?demo plays a fixed track against the local clock, without Spotify.
// /?demo=120 starts two minutes in.
const DEMO_TRACK: Track = {
  id: "demo",
  name: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",
  durationMs: 354_000,
  imageUrl: "/demo-cover.svg",
  backdropUrl: "/demo-cover.svg",
};

// The parts of Spotify's currently-playing response that are used here.
type NowPlayingResponse = {
  currently_playing_type: string;
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    id: string;
    name: string;
    duration_ms: number;
    artists?: { name: string }[];
    album?: { name: string; images?: { url: string }[] };
  } | null;
};

class NotPairedError extends Error {}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;
// Set when Spotify rejected the last token, so the next one is freshly refreshed.
let tokenRejected = false;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.accessToken;
  const response = await fetch(tokenRejected ? "/api/token?refresh" : "/api/token");
  if (response.status === 401) throw new NotPairedError();
  if (!response.ok) throw new Error(`Token request failed: ${response.status}`);
  // expiresIn is relative, so a display whose clock is off still caches correctly.
  const { accessToken, expiresIn } = (await response.json()) as { accessToken: string; expiresIn: number };
  cachedToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

export function Display() {
  // Not stored anywhere on purpose: the notice must be accepted every time the page opens.
  const [accepted, setAccepted] = useState(false);
  return (
    <>
      <Screen />
      {!accepted && <SafetyNotice onAccept={() => setAccepted(true)} />}
    </>
  );
}

function SafetyNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="notice" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div className="notice-card">
        <h1 id="notice-title">Safety warning</h1>
        <p>
          Lyrical should not be used while driving. You are responsible for your own safety and the safety
          of those around you. Keep your eyes on the road at all times.
        </p>
        <button className="button" onClick={onAccept} autoFocus>
          I understand
        </button>
      </div>
    </div>
  );
}

function Screen() {
  const [phase, setPhase] = useState<"loading" | "pairing" | "playing">("loading");
  const [demoStartMs, setDemoStartMs] = useState<number | null>(null);

  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo !== null) {
      setDemoStartMs((Number(demo) || 0) * 1000);
      setPhase("playing");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        await getAccessToken();
        if (!cancelled) setPhase("playing");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NotPairedError) setPhase("pairing");
        else timer = setTimeout(check, POLL_MS);
      }
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Stable, because Pairing and Player restart their polling when these change.
  const paired = useCallback(() => setPhase("playing"), []);
  const unpaired = useCallback(() => setPhase("pairing"), []);

  const disconnect = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    cachedToken = null;
    setPhase("pairing");
  }, []);

  if (phase === "loading") {
    return (
      <main className="screen centered">
        <Backdrop />
      </main>
    );
  }
  if (phase === "pairing") return <Pairing onPaired={paired} />;
  return (
    <Player
      demoStartMs={demoStartMs}
      onUnpaired={unpaired}
      onDisconnect={demoStartMs === null ? disconnect : null}
    />
  );
}

function Pairing({ onPaired }: { onPaired: () => void }) {
  const [pairing, setPairing] = useState<{ code: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (code: string) => {
      try {
        const response = await fetch(`/api/pair/${code}`);
        if (cancelled) return;
        if (response.status === 404) return void start();
        if (response.ok && ((await response.json()) as { status: string }).status === "ready") return onPaired();
      } catch {
        // Network hiccup: keep polling.
      }
      if (!cancelled) timer = setTimeout(() => poll(code), PAIR_POLL_MS);
    };

    const start = async () => {
      try {
        const response = await fetch("/api/pair", { method: "POST" });
        if (!response.ok) throw new Error(`Pairing request failed: ${response.status}`);
        const created = (await response.json()) as { code: string; url: string };
        if (cancelled) return;
        setPairing(created);
        timer = setTimeout(() => poll(created.code), PAIR_POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(start, POLL_MS);
      }
    };

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onPaired]);

  return (
    <main className="screen centered">
      <Backdrop />
      <div className="pairing">
        {/* The QR code doubles as a link, for pairing in the same browser.
            It opens a new tab so this page keeps polling for the result. */}
        <a
          className="qr"
          href={pairing?.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Connect Spotify"
          dangerouslySetInnerHTML={{ __html: pairing ? renderSVG(pairing.url, { border: 2 }) : "" }}
        />
        <div className="pairing-text">
          <Logo />
          <h1>Sing along from every seat.</h1>
          <p>Scan the QR code with your phone (or click it), to connect Spotify</p>
        </div>
      </div>
      <div className="controls">
        <ThemeToggle />
        <a className="control" href="/help">
          Help
        </a>
      </div>
    </main>
  );
}

function Player({
  demoStartMs,
  onUnpaired,
  onDisconnect,
}: {
  demoStartMs: number | null;
  onUnpaired: () => void;
  onDisconnect: (() => void) | null;
}) {
  const [playback, setPlayback] = useState<Playback>(IDLE);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const getPosition = useCallback(() => {
    const { isPlaying, progressMs, at } = playbackRef.current;
    return isPlaying ? progressMs + (performance.now() - at) : progressMs;
  }, []);

  useEffect(() => {
    if (demoStartMs !== null) {
      setPlayback({ track: DEMO_TRACK, isPodcast: false, isPlaying: true, progressMs: demoStartMs, at: performance.now() });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      let delay = POLL_MS;
      try {
        const token = await getAccessToken();
        const sent = performance.now();
        const response = await fetch(`${NOW_PLAYING_URL}?additional_types=track`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const received = performance.now();
        if (cancelled) return;

        if (response.status === 401) {
          cachedToken = null;
          // Retry quickly once; if a refreshed token is rejected too, back off to the normal poll.
          delay = tokenRejected ? POLL_MS : 500;
          tokenRejected = true;
        } else if (response.status === 429) {
          delay = (Number(response.headers.get("Retry-After")) || 5) * 1000;
        } else if (response.status === 204) {
          setPlayback(IDLE);
        } else if (response.ok) {
          tokenRejected = false;
          const data = (await response.json()) as NowPlayingResponse;
          const item = data.currently_playing_type === "track" ? data.item : null;
          const progressMs: number = data.progress_ms ?? 0;
          setPlayback((previous) => ({
            // Keep the same track object while the track is unchanged.
            track: !item
              ? null
              : previous.track?.id === item.id
                ? previous.track
                : {
                    id: item.id,
                    name: item.name,
                    artist: item.artists?.[0]?.name ?? "",
                    album: item.album?.name ?? "",
                    durationMs: item.duration_ms,
                    imageUrl: item.album?.images?.[0]?.url ?? null,
                    backdropUrl: item.album?.images?.at(-1)?.url ?? null,
                  },
            // Spotify reports the type even though the episode itself is not requested.
            isPodcast: data.currently_playing_type === "episode",
            isPlaying: Boolean(data.is_playing),
            progressMs,
            // Assume the position was sampled halfway through the round trip.
            at: (sent + received) / 2,
          }));
          // Poll right after the track should end, to pick up the next one quickly.
          if (item && data.is_playing) {
            delay = Math.max(1000, Math.min(POLL_MS, item.duration_ms - progressMs + 500));
          }
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NotPairedError) return onUnpaired();
      }
      if (!cancelled) timer = setTimeout(poll, delay);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [demoStartMs, onUnpaired]);

  const track = playback.track;
  useEffect(() => {
    setLyrics(null);
    if (!track) return;
    const controller = new AbortController();
    fetchLyrics(track, controller.signal)
      .then(setLyrics)
      .catch(() => {
        if (!controller.signal.aborted) setLyrics({ kind: "none" });
      });
    return () => controller.abort();
  }, [track]);

  return (
    <main className="screen player">
      <Backdrop imageUrl={track?.backdropUrl} />
      <aside className="now-playing">
        {track ? (
          <>
            {track.imageUrl && <img className="cover" src={track.imageUrl} alt="" />}
            <div className="track">
              <h1>{track.name}</h1>
              <p className="muted">{track.artist}</p>
              <Progress durationMs={track.durationMs} getPosition={getPosition} />
            </div>
          </>
        ) : (
          <Logo />
        )}
      </aside>
      <section className="lyrics">
        {!track ? (
          <p className="status">
            {playback.isPodcast ? (
              <span>
                Podcasts have no lyrics.
                <small>Play a song on Spotify to sing along.</small>
              </span>
            ) : (
              "Play something on Spotify to see the lyrics."
            )}
          </p>
        ) : !lyrics ? (
          <div className="loading" aria-label="Loading lyrics">
            <i />
            <i />
            <i />
          </div>
        ) : lyrics.kind === "synced" ? (
          <SyncedLyrics lines={lyrics.lines} getPosition={getPosition} />
        ) : lyrics.kind === "plain" ? (
          <pre className="plain">{lyrics.text}</pre>
        ) : (
          <p className="status">
            <span>
              {lyrics.kind === "instrumental" ? "Instrumental" : "No lyrics found for this track."}
              {lyrics.kind === "none" && <small>{remarkFor(track.id)}</small>}
            </span>
          </p>
        )}
      </section>
      <div className="controls">
        <ThemeToggle />
        <a className="control" href="/help">
          Help
        </a>
        {onDisconnect && (
          <button className="control" onClick={onDisconnect}>
            <span>Disconnect</span>
          </button>
        )}
      </div>
    </main>
  );
}

// Fills the screen behind everything with a soft wash of colour: the blurred
// album cover while a track is playing, the theme's own glow otherwise.
function Backdrop({ imageUrl }: { imageUrl?: string | null }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <div style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined} />
    </div>
  );
}

function Progress({ durationMs, getPosition }: { durationMs: number; getPosition: () => number }) {
  const [fraction, setFraction] = useState(0);
  useEffect(() => {
    const update = () => setFraction(Math.min(1, getPosition() / durationMs));
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [durationMs, getPosition]);
  return (
    <div className="progress">
      <div style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

function SyncedLyrics({ lines, getPosition }: { lines: LyricLine[]; getPosition: () => number }) {
  const [active, setActive] = useState(-1);
  const [offset, setOffset] = useState(0);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  useEffect(() => {
    const update = () => {
      const position = getPosition() + LEAD_MS;
      let index = -1;
      while (index + 1 < lines.length && lines[index + 1].timeMs <= position) index++;
      setActive(index);
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [lines, getPosition]);

  // Slide the list so the active line sits on the reading line.
  useLayoutEffect(() => {
    const measure = () => {
      const line = lineRefs.current[Math.max(active, 0)];
      if (line) setOffset(line.offsetTop + line.offsetHeight / 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, lines]);

  return (
    <div className="synced" style={{ transform: `translateY(${-offset}px)` }}>
      {lines.map((line, index) => (
        <p
          key={index}
          ref={(element) => {
            lineRefs.current[index] = element;
          }}
          className={index === active ? "line active" : index < active ? "line past" : "line"}
        >
          {line.text || "♪"}
        </p>
      ))}
    </div>
  );
}
