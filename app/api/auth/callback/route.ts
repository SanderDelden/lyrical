import { clearCookie, randomToken, readCookie } from "@/lib/http";
import { exchangeCode } from "@/lib/spotify";
import { OAUTH_COOKIE, getPairing, putPairing, putSession } from "@/lib/store";

// Spotify redirects the phone here. The session is handed to the display via
// the pairing record; the phone itself never gets a session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const finish = (path: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${url.origin}${path}`, "Set-Cookie": clearCookie(request, OAUTH_COOKIE) },
    });

  const [state, pairCode] = (readCookie(request, OAUTH_COOKIE) ?? "").split(":");
  if (!state || state !== url.searchParams.get("state")) return finish("/connect-error?reason=state");

  const authCode = url.searchParams.get("code");
  if (!authCode) return finish("/connect-error?reason=denied");

  const pairing = await getPairing(pairCode);
  if (!pairing) return finish("/connect-error?reason=expired");
  // shortcut: two logins finishing at the same moment can both pass this KV check; needs a Durable Object to be atomic.
  if (pairing.sessionId) return finish("/connect-error?reason=used");

  const session = await exchangeCode(request, authCode);
  if (!session) return finish("/connect-error?reason=spotify");

  const sessionId = randomToken();
  await putSession(sessionId, session);
  await putPairing(pairCode, { ...pairing, sessionId });
  return finish("/connected");
}
