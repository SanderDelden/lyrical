import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl, exchangeCode, redirectUri, refreshSession } from "@/lib/spotify";
import { mockFetch, request } from "./support/helpers";

const session = { refreshToken: "old-refresh", accessToken: "old-access", expiresAt: 0 };

describe("authorizeUrl", () => {
  it("points the browser at Spotify's login with a callback on the same origin", () => {
    const url = new URL(authorizeUrl(request("/api/auth/login"), "state-1"));

    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "test-client-id",
      scope: "user-read-currently-playing user-read-playback-state",
      redirect_uri: "https://lyrical.example/api/auth/callback",
      state: "state-1",
    });
  });

  it("uses the Spotify app link with %20-encoded spaces when asked", () => {
    const url = authorizeUrl(request("/api/auth/login"), "state-1", true);

    expect(url.startsWith("spotify-action://authorize?")).toBe(true);
    expect(url).toContain("scope=user-read-currently-playing%20user-read-playback-state");
    expect(url).not.toContain("+");
    expect(url).toContain("state=state-1");
    expect(url).toContain("nosignup=true");
    expect(url).toContain("nolinks=true");
  });

  it("derives the redirect URI from the address the app is opened on", () => {
    expect(redirectUri(new Request("http://127.0.0.1:5173/anything?x=1"))).toBe(
      "http://127.0.0.1:5173/api/auth/callback",
    );
  });
});

describe("token requests", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ now: 1_000_000 });
    return () => vi.useRealTimers();
  });

  it("exchanges an authorization code using the client credentials", async () => {
    const calls = mockFetch(() => ({
      body: { access_token: "access", refresh_token: "refresh", expires_in: 3600 },
    }));

    expect(await exchangeCode(request("/api/auth/callback"), "auth-code")).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 1_000_000 + 3_600_000,
    });

    const [{ url, init }] = calls;
    expect(url.href).toBe("https://accounts.spotify.com/api/token");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Basic ${btoa("test-client-id:test-client-secret")}`,
    );
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "https://lyrical.example/api/auth/callback",
    });
  });

  it("fails the exchange when Spotify rejects the code or returns no refresh token", async () => {
    mockFetch(() => ({ status: 400, body: { error: "invalid_grant" } }));
    expect(await exchangeCode(request("/api/auth/callback"), "bad")).toBeNull();

    mockFetch(() => ({ body: { access_token: "access", expires_in: 3600 } }));
    expect(await exchangeCode(request("/api/auth/callback"), "code")).toBeNull();
  });

  it("keeps the old refresh token when a refresh does not return a new one", async () => {
    const calls = mockFetch(() => ({ body: { access_token: "new-access", expires_in: 3600 } }));

    expect(await refreshSession(session)).toEqual({
      accessToken: "new-access",
      refreshToken: "old-refresh",
      expiresAt: 1_000_000 + 3_600_000,
    });
    expect(Object.fromEntries(calls[0].init?.body as URLSearchParams)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
  });

  it("adopts a rotated refresh token", async () => {
    mockFetch(() => ({ body: { access_token: "a", refresh_token: "rotated", expires_in: 60 } }));

    expect(await refreshSession(session)).toMatchObject({ refreshToken: "rotated" });
  });

  it("tells a revoked grant apart from a temporary Spotify failure", async () => {
    mockFetch(() => ({ status: 400, body: { error: "invalid_grant" } }));
    expect(await refreshSession(session)).toBe("revoked");

    mockFetch(() => ({ status: 503 }));
    expect(await refreshSession(session)).toBeNull();

    mockFetch(() => ({ status: 400, body: { error: "invalid_client" } }));
    expect(await refreshSession(session)).toBeNull();
  });
});
