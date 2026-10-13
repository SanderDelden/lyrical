# Lyrical

Live, time-synced lyrics for whatever is playing on your Spotify account, made
for a big screen you are not typing on: the browser in a Tesla, so passengers
can read along.

- The display shows a QR code. Scan it with your phone, log in to Spotify
  there, and the display switches to the lyrics. Nothing is typed on the display.
- Lyrics come from [LRCLIB](https://lrclib.net); playback position comes from
  the Spotify Web API.

It runs on Cloudflare Workers. To host your own copy, see
[Deploy to Cloudflare](#deploy-to-cloudflare).

## Requirements

- Node.js 22 or newer
- A Spotify app (client ID and secret) from the
  [Spotify developer dashboard](https://developer.spotify.com/dashboard).
  Spotify requires the app owner to have Premium, and every Spotify account that
  uses the app must be added under the app's *User Management* while the app is
  in development mode.

## Run it locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Add your Spotify credentials. Copy the example file and fill in both values:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

   ```ini
   SPOTIFY_CLIENT_ID=your-client-id
   SPOTIFY_CLIENT_SECRET=your-client-secret
   ```

   `.dev.vars` is git-ignored.

3. In the Spotify dashboard, add this redirect URI to your app, exactly:

   ```
   http://127.0.0.1:5173/api/auth/callback
   ```

4. Start the dev server and open <http://127.0.0.1:5173>:

   ```sh
   npm run dev
   ```

   Use `127.0.0.1`, not `localhost`: Spotify only accepts plain-http redirect
   URIs on the loopback IP, and the redirect URI is derived from the address you
   open.

5. Locally the QR code points at `127.0.0.1`, which your phone cannot reach.
   Click the QR code instead to do the "phone" step in a
   second tab. Scanning with a real phone needs the deployed version.

Before pushing, `npm run lint`, `npm run typecheck` and `npm test` run the same
checks as the pipeline.

To work on the lyrics screen without Spotify, open
<http://127.0.0.1:5173/?demo>. It plays a fixed track against the local clock;
`?demo=120` starts two minutes in.

## Deploy to Cloudflare

The app is deployed by a GitHub Actions workflow
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) on every push to
`main` or `dev`. Both branches deploy to the same Worker, so the last push wins.
You need your own Cloudflare account (the free plan is enough) and your
own Spotify app. Setting it up is a one-time job:

### 1. Get the code into your own GitHub repository

Fork this repository, or clone it and push it to a new repository of your own.

### 2. Collect your Cloudflare account ID and workers.dev subdomain

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com) and open
   **Workers & Pages**. The first visit asks you to pick a `workers.dev`
   subdomain; the app will be served from `https://lyrical.<subdomain>.workers.dev`.
2. Copy the **Account ID** shown on that page.

### 3. Create a Cloudflare API token

1. Go to **My Profile → API Tokens → Create Token**.
2. Use the **Edit Cloudflare Workers** template. It includes what the
   deployment needs: editing Worker scripts and Workers KV storage.
3. Under **Account Resources**, select your account. **Zone Resources** can stay
   on "All zones" or be limited; no zone access is used for a `workers.dev` URL.
4. Create the token and copy it. It is shown only once.

### 4. Add the redirect URI to your Spotify app

In the [Spotify developer dashboard](https://developer.spotify.com/dashboard),
open your app's settings and add this redirect URI, exactly:

```
https://lyrical.<subdomain>.workers.dev/api/auth/callback
```

Also add every Spotify account that will use the app under **User Management**.

### 5. Add the repository secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions**
and add four repository secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | The token from step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID from step 2 |
| `SPOTIFY_CLIENT_ID` | Client ID of your Spotify app |
| `SPOTIFY_CLIENT_SECRET` | Client secret of your Spotify app |

Or with the [GitHub CLI](https://cli.github.com), which prompts for each value:

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set SPOTIFY_CLIENT_ID
gh secret set SPOTIFY_CLIENT_SECRET
```

### 6. Deploy

Push to `main` or `dev`, or start the workflow by hand under **Actions → CI → Run
workflow**. The app is then live at `https://lyrical.<subdomain>.workers.dev`;
open that on the display. The workflow log deliberately hides this address, so
look it up under **Workers & Pages → lyrical** in the Cloudflare dashboard if
you are unsure of it.

### What the workflow does

It runs four jobs in sequence; a failing job stops the ones after it.

1. **lint** runs ESLint (`npm run lint`) and the TypeScript check
   (`npm run typecheck`, which first generates the Worker binding types).
2. **test** runs the test suite (`npm test`).
3. **build** runs `npm run build` (`vite build`). vinext compiles the app into
   a Worker bundle plus static assets in `.cloudflare/output/`, which is stored
   as the `worker-build` artifact.
4. **deploy** downloads that artifact and runs
   `cf deploy --prebuilt --secrets-file …`, so exactly what was built is what
   gets uploaded. On the first run it also creates the KV namespace declared in
   `cloudflare.config.ts` (no namespace ID has to be configured), and on every
   run it sets the two Spotify credentials as Worker secrets.

Nothing is deployed from your own machine and no IDs are committed, so the same
repository works unchanged for anyone's account.

### Changing things later

- **Worker name / URL:** change `name` in `cloudflare.config.ts`, and update the
  redirect URI in Spotify to match.
- **Custom domain:** add it to the Worker under **Settings → Domains & Routes**
  in the Cloudflare dashboard, and add
  `https://<your-domain>/api/auth/callback` as a redirect URI in Spotify. The
  app derives its redirect URI from the address it is opened on.
- **Rotating Spotify credentials:** update the GitHub secrets and re-run the
  workflow.
- **Deploying from your machine instead:** run `npx cf auth login` once, then:

  ```sh
  npm run build
  npx cf deploy --prebuilt --secrets-file .dev.vars
  ```

## Design

- **Light and dark theme.** By default the app follows the device. The button
  in the bottom-left corner of the display cycles Auto → Light → Dark, and the
  choice is remembered in that browser. All colours are tokens at the top of
  `app/globals.css`.
- **Backdrop.** While a track plays, its album cover is shown blurred behind
  the lyrics, under a veil that keeps the text readable in either theme.
- **Typeface.** The lyrics use the system font. Headings and the logo use
  [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque),
  loaded from Google Fonts, with the system font as fallback.
- **Logo.** Three lines of lyrics with the current one lit up. `app/logo.tsx`
  draws it in the theme's colours; `public/icon.svg` and `public/apple-icon.png`
  are the same mark on a dark tile, used as the favicon and home-screen icon.

`/?demo` is the quickest way to look at the lyrics screen while changing it.

## Tests

```sh
npm test            # run once
npx vitest          # watch mode
```

The tests use [Vitest](https://vitest.dev) and run in plain Node, so they need
no Cloudflare or Spotify account. The Workers runtime module is replaced by an
in-memory stand-in (`tests/support/cloudflare-workers.ts`) and calls to Spotify
and LRCLIB are mocked. They cover the lyrics lookup and LRC parsing, the Spotify
OAuth helpers, and every API route including the full pairing flow. The screens
themselves (`app/display.tsx` and the pages) are not covered.

## How it works

```
display (car)                    worker                         phone
     | POST /api/pair  ---------->| stores pair:CODE in KV
     | shows QR for /pair/CODE    |
     |                            |<------ GET /pair/CODE (confirm the code)
     |                            |<------ /api/auth/login -> Spotify -> /api/auth/callback
     |                            | stores session, attaches it to pair:CODE
     | GET /api/pair/CODE (poll)->| sets the session cookie on the display
     | GET /api/token ----------->| returns a short-lived Spotify access token
     | polls Spotify directly for the current track and position
     | fetches lyrics from LRCLIB directly
```

- The Spotify client secret and refresh tokens stay in the worker. The display
  only ever holds a short-lived access token.
- Only the browser that created a pairing code can collect its session.
- On an iPhone the phone page offers "Continue in the Spotify app", which
  approves the connection in the installed Spotify app instead of the login web
  page. This is experimental: it uses the link Spotify's iOS SDK uses, which
  Spotify does not document for web apps, so it may stop working. The browser
  login stays available as a fallback and is the only option on other devices.
- Between Spotify polls (every 3 seconds) the display extrapolates the playback
  position from its own clock.

| Path | Purpose |
| --- | --- |
| `app/display.tsx` | The display: pairing screen, Spotify polling, lyrics view |
| `app/globals.css` | The whole design: colour tokens for the light and dark theme, and all layout |
| `app/theme-toggle.tsx` | The Auto / Light / Dark button |
| `app/help/` | Help page: what the app does, common questions and the Spotify setup guide |
| `app/pair/[code]/` | Confirmation page opened on the phone |
| `app/api/` | Pairing, Spotify login, token and logout routes |
| `lib/` | Spotify OAuth, KV storage, LRCLIB lookup and LRC parsing |
| `tests/` | Tests for the library code and the API routes |
| `cloudflare.config.ts` | Worker config: KV namespace and secrets |
| `.github/workflows/ci.yml` | Lint, test, build and deploy to Cloudflare on push to `main` or `dev` |

## Status

Built with [vinext](https://github.com/cloudflare/vinext) (the Next.js API on
Vite) for Cloudflare Workers, with Workers KV for pairing codes and sessions.

Not done yet:

- Visual design of the lyrics screen.
