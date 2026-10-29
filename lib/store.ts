import { env } from "cloudflare:workers";

export const SESSION_COOKIE = "lyrical_session";
// Named per code so two display tabs in one browser do not overwrite each other's secret.
export const deviceCookie = (code: string) => `lyrical_device_${code}`;
export const OAUTH_COOKIE = "lyrical_oauth";

export const PAIRING_TTL_SECONDS = 10 * 60;
export const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;

// A pairing links the display that shows the QR code (identified by
// deviceSecret) to the session created once the phone finishes the Spotify login.
export type Pairing = { deviceSecret: string; sessionId?: string };

export type Session = { refreshToken: string; accessToken: string; expiresAt: number };

export function isPairCode(code: string): boolean {
  return /^[A-Z2-9]{8}$/.test(code);
}

export async function getPairing(code: string): Promise<Pairing | null> {
  if (!isPairCode(code)) return null;
  return env.KV.get<Pairing>(`pair:${code}`, "json");
}

export async function putPairing(code: string, pairing: Pairing): Promise<void> {
  await env.KV.put(`pair:${code}`, JSON.stringify(pairing), { expirationTtl: PAIRING_TTL_SECONDS });
}

export async function deletePairing(code: string): Promise<void> {
  await env.KV.delete(`pair:${code}`);
}

export async function getSession(id: string): Promise<Session | null> {
  if (!/^[0-9a-f]{64}$/.test(id)) return null;
  return env.KV.get<Session>(`session:${id}`, "json");
}

export async function putSession(id: string, session: Session): Promise<void> {
  await env.KV.put(`session:${id}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
}

export async function deleteSession(id: string): Promise<void> {
  await env.KV.delete(`session:${id}`);
}
