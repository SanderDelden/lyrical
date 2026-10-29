import { Logo } from "@/app/logo";

const REASONS: Record<string, string> = {
  expired: "The QR code expired. Scan the QR code on the display again.",
  denied: "Spotify access was not granted.",
  used: "Someone already connected this display with this QR code.",
  state: "The login could not be verified. Scan the QR code on the display again.",
  spotify: "Spotify did not accept the login. Check the app's client ID, secret and redirect URI.",
};

export default async function ConnectErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <main className="phone">
      <Logo />
      <h1>Could not connect</h1>
      <p>{REASONS[reason ?? ""] ?? "Something went wrong. Scan the QR code on the display again."}</p>
    </main>
  );
}
