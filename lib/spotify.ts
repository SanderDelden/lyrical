import { env } from "cloudflare:workers";
import type { Session } from "./store";

const SCOPES = "user-read-currently-playing user-read-playback-state";

export function redirectUri(request: Request): string {
  return `${new URL(request.url).origin}/api/auth/callback`;
}

// Experimental: the link Spotify's iOS SDK uses to authorize inside the Spotify
// app instead of on the login web page. It is not documented for web apps.
const APP_AUTHORIZE_URL = "spotify-action://authorize";
const WEB_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

export function authorizeUrl(request: Request, state: string, viaApp = false): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri(request),
    state,
  });
  if (!viaApp) return `${WEB_AUTHORIZE_URL}?${params}`;

  // Same flags the iOS SDK sends. Spaces go out as %20, like the SDK does,
  // because the app is not guaranteed to decode "+".
  params.set("nosignup", "true");
  params.set("nolinks", "true");
  return `${APP_AUTHORIZE_URL}?${params.toString().replaceAll("+", "%20")}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

// "revoked" means Spotify rejected the grant itself, as opposed to a transient failure.
async function requestToken(body: Record<string, string>): Promise<TokenResponse | "revoked" | null> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("Spotify token request failed", response.status, text);
    // Other 400s (invalid_client, invalid_request) are our config, not the user's grant.
    return response.status === 400 && text.includes('"invalid_grant"') ? "revoked" : null;
  }
  return response.json<TokenResponse>().catch(() => null);
}

function toSession(token: TokenResponse, fallbackRefreshToken?: string): Session | null {
  const refreshToken = token.refresh_token ?? fallbackRefreshToken;
  if (!refreshToken) return null;
  return {
    refreshToken,
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

export async function exchangeCode(request: Request, code: string): Promise<Session | null> {
  const token = await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(request),
  });
  return token && token !== "revoked" ? toSession(token) : null;
}

export async function refreshSession(session: Session): Promise<Session | "revoked" | null> {
  const token = await requestToken({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });
  if (!token || token === "revoked") return token;
  return toSession(token, session.refreshToken);
}
