import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "@/app/api/auth/callback/route";
import { GET as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/logout/route";
import { GET as pollPairing } from "@/app/api/pair/[code]/route";
import { POST as createPairing } from "@/app/api/pair/route";
import { GET as token } from "@/app/api/token/route";
import type { Pairing, Session } from "@/lib/store";
import { kvEntries } from "./support/cloudflare-workers";
import { ORIGIN, cookiesSet, mockFetch, params, request, seed, stored, storedTtl } from "./support/helpers";

const NOW = 1_700_000_000_000;
const SESSION_ID = "ab".repeat(32);
const CODE = "ABCD2345";

type PairingResponse = { code: string; url: string; expiresIn: number };

// Runs the display's first step and returns what it would hold afterwards.
async function startPairing() {
  const response = await createPairing(request("/api/pair", { method: "POST" }));
  const body = (await response.json()) as PairingResponse;
  return { ...body, deviceSecret: cookiesSet(response)[`lyrical_device_${body.code}`] };
}

beforeEach(() => {
  kvEntries.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ now: NOW });
  return () => vi.useRealTimers();
});

describe("POST /api/pair", () => {
  it("creates a pairing that expires after ten minutes and ties it to the display", async () => {
    const response = await createPairing(request("/api/pair", { method: "POST" }));
    const body = (await response.json()) as PairingResponse;

    expect(body.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(body.url).toBe(`${ORIGIN}/pair/${body.code}`);
    expect(body.expiresIn).toBe(600);

    const deviceSecret = cookiesSet(response)[`lyrical_device_${body.code}`];
    expect(deviceSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(stored<Pairing>(`pair:${body.code}`)).toEqual({ deviceSecret });
    expect(storedTtl(`pair:${body.code}`)).toBe(600);
  });
});

describe("GET /api/pair/[code]", () => {
  it("reports pending until the phone has logged in", async () => {
    const { code, deviceSecret } = await startPairing();

    const response = await pollPairing(
      request(`/api/pair/${code}`, { cookies: { [`lyrical_device_${code}`]: deviceSecret } }),
      params({ code }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(cookiesSet(response)).toEqual({});
  });

  it("hands the session to the display exactly once", async () => {
    const { code, deviceSecret } = await startPairing();
    seed(`pair:${code}`, { deviceSecret, sessionId: SESSION_ID });
    const poll = () =>
      pollPairing(request(`/api/pair/${code}`, { cookies: { [`lyrical_device_${code}`]: deviceSecret } }), params({ code }));

    const first = await poll();
    expect(await first.json()).toEqual({ status: "ready" });
    expect(cookiesSet(first)).toEqual({ lyrical_session: SESSION_ID, [`lyrical_device_${code}`]: "" });
    expect(first.headers.getSetCookie()[0]).toContain("Max-Age=15552000");

    const second = await poll();
    expect(second.status).toBe(404);
    expect(cookiesSet(second)).toEqual({});
  });

  it("refuses a browser that did not create the code, even when the login is done", async () => {
    const { code, deviceSecret } = await startPairing();
    seed(`pair:${code}`, { deviceSecret, sessionId: SESSION_ID });

    for (const cookies of [undefined, { [`lyrical_device_${code}`]: "f".repeat(64) }]) {
      const response = await pollPairing(request(`/api/pair/${code}`, { cookies }), params({ code }));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ status: "expired" });
      expect(cookiesSet(response)).toEqual({});
    }
    expect(stored<Pairing>(`pair:${code}`)?.sessionId).toBe(SESSION_ID);
  });

  it("lets two displays in one browser pair independently", async () => {
    const a = await startPairing();
    const b = await startPairing();
    const cookies = { [`lyrical_device_${a.code}`]: a.deviceSecret, [`lyrical_device_${b.code}`]: b.deviceSecret };

    for (const { code } of [a, b]) {
      const response = await pollPairing(request(`/api/pair/${code}`, { cookies }), params({ code }));
      expect(await response.json()).toEqual({ status: "pending" });
    }
  });

  it("reports unknown and malformed codes as expired", async () => {
    for (const code of ["ZZZZZZZZ", "short", "abcd2345"]) {
      const response = await pollPairing(request(`/api/pair/${code}`), params({ code }));
      expect(response.status).toBe(404);
    }
  });
});

describe("GET /api/auth/login", () => {
  it("sends the phone to Spotify and remembers the state with the pairing code", async () => {
    const { code } = await startPairing();

    const response = await login(request(`/api/auth/login?code=${code}`));
    const location = new URL(response.headers.get("Location")!);
    const state = location.searchParams.get("state")!;

    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback`);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(cookiesSet(response)).toEqual({ lyrical_oauth: `${state}:${code}` });
  });

  it("opens the Spotify app instead when asked", async () => {
    const { code } = await startPairing();

    const response = await login(request(`/api/auth/login?code=${code}&via=app`));

    expect(response.headers.get("Location")).toMatch(/^spotify-action:\/\/authorize\?/);
  });

  it("uses a fresh state for every login", async () => {
    const { code } = await startPairing();
    const stateOf = async () =>
      new URL((await login(request(`/api/auth/login?code=${code}`))).headers.get("Location")!).searchParams.get(
        "state",
      );

    expect(await stateOf()).not.toBe(await stateOf());
  });

  it("turns away a code that someone already connected", async () => {
    seed(`pair:${CODE}`, { deviceSecret: "device", sessionId: SESSION_ID });

    const response = await login(request(`/api/auth/login?code=${CODE}`));

    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=used`);
  });

  it("turns away an unknown or missing code without contacting Spotify", async () => {
    for (const path of ["/api/auth/login?code=ZZZZZZZZ", "/api/auth/login"]) {
      const response = await login(request(path));
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=expired`);
      expect(cookiesSet(response)).toEqual({});
    }
  });
});

describe("GET /api/auth/callback", () => {
  const cookies = { lyrical_oauth: `state-1:${CODE}` };
  const spotifyTokens = { access_token: "access", refresh_token: "refresh", expires_in: 3600 };

  beforeEach(() => seed(`pair:${CODE}`, { deviceSecret: "device" }));

  it("stores the session and attaches it to the pairing", async () => {
    mockFetch(() => ({ body: spotifyTokens }));

    const response = await callback(request("/api/auth/callback?code=auth&state=state-1", { cookies }));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connected`);

    const { sessionId, deviceSecret } = stored<Pairing>(`pair:${CODE}`)!;
    expect(deviceSecret).toBe("device");
    expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(stored<Session>(`session:${sessionId}`)).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: NOW + 3_600_000,
    });
    expect(storedTtl(`session:${sessionId}`)).toBe(180 * 24 * 60 * 60);
  });

  it("gives the phone no session of its own and clears the state cookie", async () => {
    mockFetch(() => ({ body: spotifyTokens }));

    const response = await callback(request("/api/auth/callback?code=auth&state=state-1", { cookies }));

    expect(cookiesSet(response)).toEqual({ lyrical_oauth: "" });
  });

  it.each([
    ["the state does not match", "/api/auth/callback?code=auth&state=other", cookies],
    ["the state is missing", "/api/auth/callback?code=auth", cookies],
    ["there is no state cookie", "/api/auth/callback?code=auth&state=state-1", undefined],
  ])("rejects the login when %s", async (_case, path, requestCookies) => {
    const calls = mockFetch(() => ({ body: spotifyTokens }));

    const response = await callback(request(path, { cookies: requestCookies }));

    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=state`);
    expect(calls).toHaveLength(0);
    expect(stored<Pairing>(`pair:${CODE}`)).toEqual({ deviceSecret: "device" });
  });

  it("reports a denied login when Spotify sends no code", async () => {
    const response = await callback(
      request("/api/auth/callback?error=access_denied&state=state-1", { cookies }),
    );

    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=denied`);
  });

  it("reports an expired pairing without spending the authorization code", async () => {
    kvEntries.clear();
    const calls = mockFetch(() => ({ body: spotifyTokens }));

    const response = await callback(request("/api/auth/callback?code=auth&state=state-1", { cookies }));

    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=expired`);
    expect(calls).toHaveLength(0);
  });

  it("keeps the first login when a second one finishes on the same code", async () => {
    seed(`pair:${CODE}`, { deviceSecret: "device", sessionId: SESSION_ID });
    const calls = mockFetch(() => ({ body: spotifyTokens }));

    const response = await callback(request("/api/auth/callback?code=auth&state=state-1", { cookies }));

    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=used`);
    expect(calls).toHaveLength(0);
    expect(stored<Pairing>(`pair:${CODE}`)?.sessionId).toBe(SESSION_ID);
  });

  it("reports a Spotify failure and leaves the pairing untouched", async () => {
    mockFetch(() => ({ status: 400, body: { error: "invalid_grant" } }));

    const response = await callback(request("/api/auth/callback?code=auth&state=state-1", { cookies }));

    expect(response.headers.get("Location")).toBe(`${ORIGIN}/connect-error?reason=spotify`);
    expect(stored<Pairing>(`pair:${CODE}`)).toEqual({ deviceSecret: "device" });
    expect([...kvEntries.keys()]).toEqual([`pair:${CODE}`]);
  });
});

describe("GET /api/token", () => {
  const cookies = { lyrical_session: SESSION_ID };
  const fresh: Session = { refreshToken: "refresh", accessToken: "access", expiresAt: NOW + 10 * 60_000 };
  const expiring: Session = { ...fresh, expiresAt: NOW + 30_000 };

  it("answers 401 without a session cookie, with an unknown one or a malformed one", async () => {
    for (const requestCookies of [undefined, cookies, { lyrical_session: "../etc" }]) {
      const response = await token(request("/api/token", { cookies: requestCookies }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "not_paired" });
    }
  });

  it("returns the stored access token while it is still valid, without calling Spotify", async () => {
    seed(`session:${SESSION_ID}`, fresh);
    const calls = mockFetch(() => ({}));

    const response = await token(request("/api/token", { cookies }));

    expect(await response.json()).toEqual({ accessToken: "access", expiresIn: 600 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(cookiesSet(response)).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("never exposes the refresh token", async () => {
    seed(`session:${SESSION_ID}`, fresh);

    const body = await (await token(request("/api/token", { cookies }))).text();

    expect(body).not.toContain("refresh");
  });

  it("refreshes a token that is about to expire and stores the result", async () => {
    seed(`session:${SESSION_ID}`, expiring);
    mockFetch(() => ({ body: { access_token: "new-access", expires_in: 3600 } }));

    const response = await token(request("/api/token", { cookies }));

    expect(await response.json()).toEqual({ accessToken: "new-access", expiresIn: 3600 });
    expect(stored<Session>(`session:${SESSION_ID}`)).toEqual({
      refreshToken: "refresh",
      accessToken: "new-access",
      expiresAt: NOW + 3_600_000,
    });
    expect(storedTtl(`session:${SESSION_ID}`)).toBe(180 * 24 * 60 * 60);
    expect(cookiesSet(response)).toEqual({ lyrical_session: SESSION_ID });
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=15552000");
  });

  it("drops the session when Spotify has revoked access", async () => {
    seed(`session:${SESSION_ID}`, expiring);
    mockFetch(() => ({ status: 400, body: { error: "invalid_grant" } }));

    const response = await token(request("/api/token", { cookies }));

    expect(response.status).toBe(401);
    expect(cookiesSet(response)).toEqual({ lyrical_session: "" });
    expect(stored(`session:${SESSION_ID}`)).toBeUndefined();
  });

  it("refreshes a token that has not expired when the display asks", async () => {
    seed(`session:${SESSION_ID}`, fresh);
    mockFetch(() => ({ body: { access_token: "new-access", expires_in: 3600 } }));

    const response = await token(request("/api/token?refresh", { cookies }));

    expect(await response.json()).toEqual({ accessToken: "new-access", expiresIn: 3600 });
  });

  it("keeps the session when the app's own credentials are rejected", async () => {
    seed(`session:${SESSION_ID}`, expiring);
    mockFetch(() => ({ status: 400, body: { error: "invalid_client" } }));

    const response = await token(request("/api/token", { cookies }));

    expect(response.status).toBe(502);
    expect(stored<Session>(`session:${SESSION_ID}`)).toEqual(expiring);
  });

  it("keeps the session when Spotify is only temporarily unavailable", async () => {
    seed(`session:${SESSION_ID}`, expiring);
    mockFetch(() => ({ status: 503 }));

    const response = await token(request("/api/token", { cookies }));

    expect(response.status).toBe(502);
    expect(cookiesSet(response)).toEqual({});
    expect(stored<Session>(`session:${SESSION_ID}`)).toEqual(expiring);
  });
});

describe("POST /api/logout", () => {
  it("deletes the session and clears the cookie", async () => {
    seed(`session:${SESSION_ID}`, { refreshToken: "r", accessToken: "a", expiresAt: NOW });

    const response = await logout(
      request("/api/logout", { method: "POST", cookies: { lyrical_session: SESSION_ID } }),
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(cookiesSet(response)).toEqual({ lyrical_session: "" });
    expect(stored(`session:${SESSION_ID}`)).toBeUndefined();
  });

  it("succeeds without a session", async () => {
    const response = await logout(request("/api/logout", { method: "POST" }));

    expect(response.status).toBe(200);
  });
});

describe("pairing from start to finish", () => {
  it("lets the display fetch a Spotify token after the phone has logged in", async () => {
    mockFetch(() => ({ body: { access_token: "access", refresh_token: "refresh", expires_in: 3600 } }));

    // Display: show a QR code.
    const { code, deviceSecret } = await startPairing();

    // Phone: follow the QR code to Spotify and come back with an authorization code.
    const loginResponse = await login(request(`/api/auth/login?code=${code}`));
    const state = new URL(loginResponse.headers.get("Location")!).searchParams.get("state");
    const callbackResponse = await callback(
      request(`/api/auth/callback?code=auth&state=${state}`, { cookies: cookiesSet(loginResponse) }),
    );
    expect(callbackResponse.headers.get("Location")).toBe(`${ORIGIN}/connected`);

    // Display: the next poll delivers the session, which then yields a token.
    const pollResponse = await pollPairing(
      request(`/api/pair/${code}`, { cookies: { [`lyrical_device_${code}`]: deviceSecret } }),
      params({ code }),
    );
    const { lyrical_session } = cookiesSet(pollResponse);
    const tokenResponse = await token(request("/api/token", { cookies: { lyrical_session } }));

    expect(await tokenResponse.json()).toEqual({ accessToken: "access", expiresIn: 3600 });

    // And disconnecting ends it.
    await logout(request("/api/logout", { method: "POST", cookies: { lyrical_session } }));
    expect((await token(request("/api/token", { cookies: { lyrical_session } }))).status).toBe(401);
  });
});
