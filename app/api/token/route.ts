import { clearCookie, readCookie, setCookie } from "@/lib/http";
import { refreshSession } from "@/lib/spotify";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, deleteSession, getSession, putSession } from "@/lib/store";

// Hands the display a short-lived Spotify access token so it can poll the
// Spotify API directly; the refresh token and client secret stay server-side.
export async function GET(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  let session = sessionId ? await getSession(sessionId) : null;
  if (!sessionId || !session) return Response.json({ error: "not_paired" }, { status: 401 });

  // The display asks for ?refresh after Spotify rejected a token that has not expired yet.
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (new URL(request.url).searchParams.has("refresh") || session.expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshSession(session);
    if (!refreshed) return Response.json({ error: "spotify_unavailable" }, { status: 502 });
    if (refreshed === "revoked") {
      await deleteSession(sessionId);
      return Response.json(
        { error: "not_paired" },
        { status: 401, headers: { "Set-Cookie": clearCookie(request, SESSION_COOKIE) } },
      );
    }
    session = refreshed;
    await putSession(sessionId, session);
    // putSession renewed the KV TTL; renew the cookie with it so neither runs out first.
    headers.append("Set-Cookie", setCookie(request, SESSION_COOKIE, sessionId, SESSION_TTL_SECONDS));
  }

  return Response.json(
    { accessToken: session.accessToken, expiresIn: Math.floor((session.expiresAt - Date.now()) / 1000) },
    { headers },
  );
}
