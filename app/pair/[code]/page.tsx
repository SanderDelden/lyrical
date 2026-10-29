import { headers } from "next/headers";
import { Logo } from "@/app/logo";
import { getPairing } from "@/lib/store";

// Opened on the phone by scanning the QR code on the display.
export default async function PairPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const pairing = await getPairing(code);

  if (!pairing) {
    return (
      <main className="phone">
        <Logo />
        <h1>QR code expired</h1>
        <p>This QR code is no longer valid. Scan the one on the display again.</p>
      </main>
    );
  }

  // Authorizing inside the Spotify app only exists on iOS (see lib/spotify.ts).
  const isIphone = /iPhone|iPod/.test((await headers()).get("user-agent") ?? "");
  const loginUrl = `/api/auth/login?code=${code}`;

  return (
    <main className="phone">
      <Logo />
      {isIphone ? (
        <>
          <a className="button" href={`${loginUrl}&via=app`}>
            Connect with Spotify
          </a>
          <p>
            <a className="muted" href={loginUrl}>
              Log in with the browser instead
            </a>
          </p>
        </>
      ) : (
        <a className="button" href={loginUrl}>
          Connect with Spotify
        </a>
      )}

      {/* Mirrors Spotify's own consent screen for the scopes in lib/spotify.ts. */}
      <h2>Lyrical will be able to</h2>
      <ul className="access">
        <li>
          <strong>View your activity on Spotify</strong>
          <span>
            The content you are currently playing and Spotify Connect devices information. Lyrical uses
            this to know which song is playing and how far along it is. Lyrical does not use or store it.
          </span>
        </li>
        <li>
          <strong>View your Spotify account data</strong>
          <span>
            Your name and username, your profile picture, how many followers you have on Spotify and your
            public playlists. Spotify shares this with every connected app. Lyrical does not use or store
            it.
          </span>
        </li>
      </ul>
      <p className="muted">Lyrical cannot control playback or change anything in your account.</p>
      <p>
        <a className="muted" href="/help">
          Help and questions
        </a>
      </p>
    </main>
  );
}
