import { clearCookie, readCookie } from "@/lib/http";
import { refreshSession } from "@/lib/spotify";
import { SESSION_COOKIE, deleteSession, getSession, putSession } from "@/lib/store";

// Hands the display a short-lived Spotify access token so it can poll the
// Spotify API directly; the refresh token and client secret stay server-side.
export async function GET(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  let session = sessionId ? await getSession(sessionId) : null;
  if (!sessionId || !session) return Response.json({ error: "not_paired" }, { status: 401 });

  if (session.expiresAt - Date.now() < 60_000) {
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
  }

  return Response.json(
    { accessToken: session.accessToken, expiresAt: session.expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
