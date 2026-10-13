import { clearCookie, readCookie } from "@/lib/http";
import { SESSION_COOKIE, deleteSession } from "@/lib/store";

export async function POST(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) await deleteSession(sessionId);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(request, SESSION_COOKIE) } });
}
