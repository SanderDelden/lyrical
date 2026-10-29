import { randomPairCode, randomToken, setCookie } from "@/lib/http";
import { deviceCookie, PAIRING_TTL_SECONDS, putPairing } from "@/lib/store";

// Called by the display: creates a pairing code to show as a QR code.
export async function POST(request: Request) {
  const code = randomPairCode();
  const deviceSecret = randomToken();
  await putPairing(code, { deviceSecret });

  const url = `${new URL(request.url).origin}/pair/${code}`;
  return Response.json(
    { code, url, expiresIn: PAIRING_TTL_SECONDS },
    { headers: { "Set-Cookie": setCookie(request, deviceCookie(code), deviceSecret, PAIRING_TTL_SECONDS) } },
  );
}
