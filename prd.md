Build a real-time, consent-based shared browsing application.

## Core behavior

There are exactly two participants in a private room:

* User A
* User B

Each participant has their own browser-viewing area and their own URL input.

The key requirement is:

**When either participant enters a URL, the other participant should be shown the corresponding webpage, but the actual URL must NOT be displayed to the other participant.**

For example:

```text
User A enters:
https://example.com/some/private/path

User B sees:
the resulting webpage

User B must NOT receive/display:
https://example.com/some/private/path
```

Likewise:

```text
User B enters:
https://example.org/article

User A sees:
the resulting webpage

User A must NOT receive/display:
https://example.org/article
```

Do NOT show the other participant's URL in their URL bar, history panel, logs, UI, or synchronization messages.

---

# Architecture

Use:

* Next.js
* TypeScript
* React
* Tailwind CSS
* WebRTC DataChannel for real-time synchronization
* WebSocket signaling
* Vercel for the frontend/application
* STUN/TURN for WebRTC connectivity

Use WebRTC/DataChannel for low-latency control messages.

Do not send screen/video data through Vercel.

---

# Private navigation protocol

Do NOT broadcast the raw URL to the other participant.

Instead, each participant should send an opaque navigation command such as:

```ts
{
  type: "navigate",
  navigationId: "random-id"
}
```

The receiving side should obtain/render the corresponding page through the application's controlled browsing mechanism.

The raw URL should remain private to the participant who entered it.

Do not put URLs into:

* shared DataChannel messages
* room state
* public logs
* UI visible to the other participant
* browser history of the other participant

If a backend component necessarily needs the URL to retrieve/render a page, keep that value server-side and do not expose it to the other participant.

---

# Important browser-security requirements

Do NOT attempt to bypass:

* Same-Origin Policy
* CORS
* CSP
* X-Frame-Options
* authentication
* DRM
* browser security restrictions

A normal webpage cannot arbitrarily read or control the contents of another origin.

If a target website refuses iframe embedding, do not attempt to circumvent that restriction.

Instead, implement a clearly defined fallback.

---

# Arbitrary website support

The application should support arbitrary URLs as far as browser security allows.

For websites that allow embedding, render them in the application's viewing area.

For websites that cannot be embedded, provide an optional screen-sharing fallback using:

```ts
navigator.mediaDevices.getDisplayMedia()
```

The user must explicitly choose what to share.

Never secretly capture a screen.

---

# Independent URL inputs

Each participant has a private URL bar.

Example:

```text
User A:

┌─────────────────────────────────────┐
│ URL: [ https://example.com       ] │
│                       [ Open ]      │
└─────────────────────────────────────┘
```

User B has a completely separate URL bar.

Neither participant sees the other's typed URL.

When a participant navigates, send only the minimum opaque synchronization information necessary.

---

# Synchronization

When User A changes the page:

```text
User A
   │
   │ navigation event
   ▼
WebRTC DataChannel
   │
   ▼
User B
   │
   └── render corresponding page
```

When User B changes the page:

```text
User B
   │
   │ navigation event
   ▼
WebRTC DataChannel
   │
   ▼
User A
```

Prevent synchronization loops.

For example, if User A causes User B to navigate, the resulting navigation on User B must not automatically cause a second navigation event back to User A.

Use an origin identifier:

```ts
type NavigationSource = "local" | "remote";
```

Only local navigation should create an outbound synchronization event.

---

# Scroll synchronization

When both participants are viewing the same synchronized page, synchronize scrolling.

Send:

```ts
{
  type: "scroll",
  x: number,
  y: number,
  timestamp: number
}
```

Throttle scroll events.

Do not send the URL as part of the scroll message.

Prevent scroll feedback loops.

---

# Optional navigation controls

Support:

* Back
* Forward
* Reload

When a participant presses Back, synchronize the navigation action without exposing the resulting URL to the other participant.

Example:

```ts
{
  type: "history",
  action: "back"
}
```

Do not send:

```ts
{
  type: "history",
  url: "https://..."
}
```

---

# Video support

If the synchronized webpage contains an accessible HTML5 video, provide synchronized:

* Play
* Pause
* Seek
* Playback rate

Do not screen-share the video when both clients can access the same video.

Use lightweight synchronization messages:

```ts
{
  type: "video:play",
  position: number,
  timestamp: number
}
```

and:

```ts
{
  type: "video:pause",
  position: number,
  timestamp: number
}
```

Correct playback drift rather than repeatedly restarting playback.

---

# Screen-sharing fallback

For pages that cannot be embedded or reproduced safely, allow the user to explicitly start screen sharing.

Use:

```ts
navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: true
})
```

Show a clear indicator:

```text
🔴 Screen sharing active
[ Stop Sharing ]
```

The browser's native permission UI must control what is shared.

---

# Privacy

The application must ensure:

1. User A's typed URL is not shown to User B.
2. User B's typed URL is not shown to User A.
3. URLs are not included in DataChannel messages.
4. URLs are not displayed in shared room state.
5. Do not expose URLs through client-side logs.
6. Do not record browsing history.
7. Do not permanently store URLs.
8. Use private, non-guessable room IDs.
9. Use HTTPS/WSS.
10. Clearly explain that the application may need server-side access to a URL if a proxy/rendering mechanism is used.

Do not claim that URLs are private from the server if the architecture requires the server to process them.

---

# UI

Create a clean two-person interface:

```text
┌───────────────────────────────────────────────────┐
│                  Shared Room                      │
├─────────────────────────┬─────────────────────────┤
│ YOU                     │ OTHER PERSON             │
│                         │                         │
│ [ private URL ] [Open]  │ [ private URL ] [Open] │
│                         │                         │
│ ┌─────────────────────┐ │ ┌─────────────────────┐ │
│ │                     │ │ │                     │ │
│ │    webpage          │ │ │    webpage          │ │
│ │                     │ │ │                     │ │
│ └─────────────────────┘ │ └─────────────────────┘ │
│                         │                         │
└─────────────────────────┴─────────────────────────┘
```

Do not display the other person's URL anywhere.

Add:

* Connection indicator
* Room ID
* Copy room invitation
* Start/stop screen share
* Sync status
* Viewer-control permission

---

# WebRTC

Implement:

* RTCPeerConnection
* SDP offer/answer
* ICE candidates
* STUN
* TURN
* RTCDataChannel
* Reconnection
* Connection-state handling
* Cleanup

Environment variables:

```text
NEXT_PUBLIC_STUN_SERVER=
NEXT_PUBLIC_TURN_SERVER=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

Never hardcode TURN credentials.

---

# Signaling

Implement private room signaling.

Support:

* Create room
* Join room
* Exactly two participants
* Offer
* Answer
* ICE candidates
* Disconnect
* Reconnect

The signaling layer should not be used to transmit the actual screen/video stream.

---

# Security

Do not implement any mechanism that bypasses browser security or allows hidden access to another person's computer.

Both participants must explicitly join the room.

Screen sharing must require explicit browser permission.

Any remote control capability must require explicit consent and be revocable.

---

# Deployment

The project must deploy cleanly to Vercel.

Provide:

* `.env.example`
* README
* Local development instructions
* Vercel deployment instructions
* TURN configuration instructions

If persistent WebSockets are unsuitable for the chosen Vercel architecture, use a compatible external signaling service and isolate it behind a clean signaling interface.

---

# Deliverables

Generate a complete runnable project, not pseudocode.

Include:

* Next.js application
* UI
* Room system
* WebRTC connection
* DataChannel synchronization
* Private URL handling
* Navigation synchronization
* Scroll synchronization
* Video synchronization
* Screen-sharing fallback
* Security checks
* Error handling
* Reconnection
* Environment configuration
* README
* Vercel deployment instructions

Before completing the implementation, verify:

1. Two users can join the same room.
2. Each user has a private URL input.
3. User A can navigate and User B receives the corresponding synchronized page where technically supported.
4. User B can navigate and User A receives the corresponding synchronized page where technically supported.
5. Neither participant receives the other's raw URL through synchronization messages.
6. Scroll position synchronizes.
7. Video playback synchronizes where supported.
8. Screen sharing works as an explicit fallback.
9. Synchronization loops are prevented.
10. Browser security restrictions are never bypassed.
