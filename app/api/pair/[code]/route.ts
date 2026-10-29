import { clearCookie, readCookie, setCookie } from "@/lib/http";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, deletePairing, deviceCookie, getPairing } from "@/lib/store";

// Polled by the display until the phone has finished the Spotify login.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const pairing = await getPairing(code);
  // Only the display that created the code may collect the session.
  if (!pairing || pairing.deviceSecret !== readCookie(request, deviceCookie(code))) {
    return Response.json({ status: "expired" }, { status: 404 });
  }
  if (!pairing.sessionId) return Response.json({ status: "pending" });

  await deletePairing(code);
  const headers = new Headers();
  headers.append("Set-Cookie", setCookie(request, SESSION_COOKIE, pairing.sessionId, SESSION_TTL_SECONDS));
  headers.append("Set-Cookie", clearCookie(request, deviceCookie(code)));
  return Response.json({ status: "ready" }, { headers });
}
