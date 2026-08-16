# Movetime

A private, consent-based room for **two people** to browse together.

Each person has their own URL bar. When you open a page, the other person sees the page — not the address you typed. Raw URLs are never sent over the WebRTC DataChannel, never shown in the other person's UI, and never written into shared room state.

## How privacy works

1. You type a URL. It stays in your browser.
2. This app's **server** stores that URL against an opaque `navigationId` (in memory locally, or Redis on Vercel). It is not kept permanently.
3. Your peer only receives `{ "type": "navigate", "navigationId": "…" }`.
4. Their viewer loads `/api/view/<navigationId>`, which fetches and renders the page without exposing the original address.

**The server can see URLs it is asked to fetch.** Do not claim URLs are private from the server. Participants should treat this like handing the address to the app backend for the lifetime of the room.

Sites that refuse to be fetched, or that break when proxied, are **not** force-embedded. Use the explicit screen-sharing fallback (`getDisplayMedia`). The browser's own permission prompt controls what is shared. There is no hidden capture, and no attempt to bypass CORS, CSP, X-Frame-Options, DRM, or authentication.

## Local development

Requirements: Node.js 18.18+ and npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a room, copy the invite, and join from another browser or window.

In-memory signaling is enough for a single `next dev` / `next start` process. Two tabs on the same machine should connect.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_STUN_SERVER` | STUN URL. Defaults to Google's public STUN. |
| `NEXT_PUBLIC_TURN_SERVER` | TURN URL, e.g. `turn:turn.example.com:3478`. |
| `NEXT_PUBLIC_TURN_USERNAME` | TURN username. **Never hardcode this in source.** |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | TURN credential. **Never hardcode this in source.** |
| `NAV_ENCRYPTION_KEY` | Secret used to seal proxied asset tokens. Set a long random value in production. |
| `UPSTASH_REDIS_REST_URL` | Shared signaling store for multi-instance hosts. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token. |

TURN credentials are `NEXT_PUBLIC_*` because the browser WebRTC stack needs them. Prefer time-limited TURN REST credentials in production if your provider supports them.

## Vercel deployment

Vercel serverless instances do **not** share memory. Persistent WebSockets are also a poor fit. Signaling is isolated behind `/api/rooms/[roomId]/signal` (HTTP long-poll). For production:

1. Create an [Upstash Redis](https://upstash.com/) database.
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on the Vercel project.
3. Set `NAV_ENCRYPTION_KEY` to a long random string.
4. Configure TURN (`NEXT_PUBLIC_TURN_*`) so peers behind symmetric NATs can connect.
5. Deploy:

```bash
npx vercel
```

Or connect the GitHub repo in the Vercel dashboard and import as a Next.js project. No extra `vercel.json` is required.

Screen and camera media never transit Vercel. Only opaque sync messages and signaling JSON do. Media uses the WebRTC peer connection (STUN/TURN).

## TURN configuration

Many home and mobile networks need TURN, not just STUN.

1. Run a TURN server (coturn, Twilio, Cloudflare Calls, Metered, etc.).
2. Put the URL, username, and credential in the `NEXT_PUBLIC_TURN_*` variables.
3. Confirm both participants show **DataChannel open**. If the peer connection stays on `checking` / `failed`, TURN is missing or blocked.

## What syncs

- Navigation (opaque ids only)
- Back / forward / reload
- Scroll (throttled, loop-safe)
- HTML5 video play / pause / seek / rate, with drift correction
- Optional remote control, only after explicit grant (revocable)
- Optional screen share as a fallback

Synchronization loops are prevented with local/remote apply flags. Only local actions send outbound DataChannel events.

## Security notes

- Room ids are 128-bit random hex values.
- Rooms hold at most two participants.
- Both people must explicitly join.
- Screen sharing requires the browser permission UI.
- Remote control is off until granted, and can be revoked.
- Proxied pages run in a sandboxed iframe without `allow-same-origin`.
- Private/link-local addresses are blocked from server-side fetch.

## Scripts

```bash
npm run dev
npm run build
npm start
npm run lint
```
