import { randomToken, setCookie } from "@/lib/http";
import { authorizeUrl } from "@/lib/spotify";
import { OAUTH_COOKIE, PAIRING_TTL_SECONDS, getPairing } from "@/lib/store";

// Opened on the phone from the pairing page: sends it to Spotify.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const pairing = await getPairing(code);
  if (!pairing) return Response.redirect(`${url.origin}/connect-error?reason=expired`, 302);
  if (pairing.sessionId) return Response.redirect(`${url.origin}/connect-error?reason=used`, 302);

  const state = randomToken(16);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl(request, state, url.searchParams.get("via") === "app"),
      "Set-Cookie": setCookie(request, OAUTH_COOKIE, `${state}:${code}`, PAIRING_TTL_SECONDS),
    },
  });
}
