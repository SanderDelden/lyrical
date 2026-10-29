import type { Metadata } from "next";
import { headers } from "next/headers";
import { Logo } from "@/app/logo";
import { ThemeToggle } from "@/app/theme-toggle";
import { version } from "@/package.json";

export const metadata: Metadata = { title: "Help · Lyrical" };

// The address Spotify must send people back to, for whoever sets up this copy.
async function redirectUri(): Promise<string> {
  const host = (await headers()).get("host") ?? "your-lyrical-address";
  const local = /^(127\.0\.0\.1|localhost)(:|$)/.test(host);
  return `${local ? "http" : "https"}://${host}/api/auth/callback`;
}

export default async function HelpPage() {
  return (
    <main className="doc">
      <header className="doc-header">
        <a href="/" aria-label="Back to Lyrical">
          <Logo />
        </a>
        <ThemeToggle />
      </header>

      <h1>Help</h1>
      <p className="lead">
        Lyrical shows the lyrics of whatever is playing on your Spotify account, line by line and in time with
        the music. It is made for a big screen that nobody is typing on, such as the browser in a car, so
        passengers can read and sing along.
      </p>
      <nav className="doc-nav">
        <a href="#how">How it works</a>
        <a href="#faq">Questions</a>
        <a href="#setup">Spotify setup</a>
      </nav>

      <section id="how">
        <h2>How it works</h2>
        <ol>
          <li>Open Lyrical on the screen you want the lyrics on. It shows a QR code.</li>
          <li>
            Scan the QR code with your phone and tap <strong>Connect with Spotify</strong>. On an iPhone this
            opens the Spotify app to approve the connection; on other phones you log in to Spotify in the
            browser.
          </li>
          <li>The screen switches to the lyrics by itself. Play something on Spotify, on any device.</li>
        </ol>
        <p>
          Lyrical does not play music. Keep playing from your phone, the car or a speaker as usual; the screen
          follows along.
        </p>
        <p className="note">
          Lyrical is meant for passengers. If you are driving, keep your eyes on the road.
        </p>
      </section>

      <section id="faq">
        <h2>Questions</h2>

        <details>
          <summary>Why does a song show no lyrics?</summary>
          <p>
            The lyrics come from <a href="https://lrclib.net">LRCLIB</a>, a free database maintained by
            volunteers. Not every song is in it. When a song has lyrics but no timing, Lyrical shows the full
            text without highlighting; when it has nothing at all, it says so. Podcasts and audiobooks have no
            lyrics.
          </p>
        </details>

        <details>
          <summary>Why are the lyrics slightly early or late?</summary>
          <p>
            The timing for each line is entered by volunteers and can be a little off, or made for a different
            version of the song. Lyrical also only asks Spotify where the song is every three seconds, so after
            pausing, skipping or seeking it can take a few seconds to catch up.
          </p>
        </details>

        <details>
          <summary>The screen says “Play something on Spotify” while music is playing</summary>
          <p>
            Check that the music is playing on the same Spotify account that was connected. Spotify also
            reports nothing while a private session is active or when an advert is playing.
          </p>
        </details>

        <details>
          <summary>Why can&apos;t I connect my Spotify account?</summary>
          <p>
            Each copy of Lyrical runs on its owner&apos;s own Spotify developer app. Spotify only lets
            accounts connect that the owner has added to that app&apos;s user list, with a small maximum. Ask
            whoever runs this copy to add the email address of your Spotify account.
          </p>
        </details>

        <details>
          <summary>Is Spotify Premium required?</summary>
          <p>
            Not to use Lyrical: free Spotify accounts can connect and see lyrics too. Only whoever runs this
            copy of Lyrical needs Premium, because Spotify requires it for the owner of the developer app.
          </p>
        </details>

        <details>
          <summary>The QR code no longer works</summary>
          <p>
            A QR code is valid for ten minutes and for one connection. The screen replaces it with a fresh one
            when it expires, so scan the one that is showing now.
          </p>
        </details>

        <details>
          <summary>What can Lyrical see and what does it keep?</summary>
          <p>
            Lyrical only uses what you are currently playing. It cannot control playback or change anything in
            your account.
          </p>
          <p>
            To stay connected, the server keeps the access keys Spotify hands out for your account. They are
            deleted when you disconnect, or after 180 days without use. Lyrical does not keep a history of what
            you listen to. To find lyrics, the screen sends the title, artist, album and length of the current
            song to LRCLIB. The typeface is loaded from Google Fonts.
          </p>
        </details>

        <details>
          <summary>Does it only work in a car?</summary>
          <p>No. It works in any modern browser: a laptop, a tablet or a television work just as well.</p>
        </details>
      </section>

      <section id="setup">
        <h2>Spotify setup</h2>
        <p>
          This part is for whoever runs a copy of Lyrical. Each copy needs its own Spotify developer app, which
          is free to create. Spotify requires the owner of that app to have Spotify Premium.
        </p>
        <ol>
          <li>
            Go to the <a href="https://developer.spotify.com/dashboard">Spotify developer dashboard</a>, log in
            and choose <strong>Create app</strong>.
          </li>
          <li>Give it any name and description, and select <strong>Web API</strong> as the API it uses.</li>
          <li>
            Under <strong>Redirect URIs</strong>, add this address exactly as shown:
            <code className="block">{await redirectUri()}</code>
            It is the address of this copy of Lyrical. If you later move it to another address, add that one
            too.
          </li>
          <li>
            Save the app, open its <strong>Settings</strong> and copy the <strong>Client ID</strong> and{" "}
            <strong>Client secret</strong>.
          </li>
          <li>
            Open <strong>User Management</strong> and add the name and email address of every Spotify account
            that should be able to connect, your own account does not have to be included.
          </li>
          <li>
            Give the two values to Lyrical as <code>SPOTIFY_CLIENT_ID</code> and{" "}
            <code>SPOTIFY_CLIENT_SECRET</code>: in the Cloudflare setup when deploying it with the Deploy to Cloudflare
            button, or in the{" "}
            <code>.dev.vars</code> file when running it on your own computer.
          </li>
        </ol>
      </section>

      <footer className="doc-footer">
        {/* shortcut: links to the repo while there are no releases, point at /releases/tag/v${version} once there are. */}
        <a href="https://github.com/SanderDelden/lyrical">Lyrical v{version}</a>
      </footer>
    </main>
  );
}
