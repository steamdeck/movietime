/**
 * Client-direct embed wrapper. Renders a same-origin Movietime shell page
 * containing one sandboxed iframe pointed at the per-viewer redirect.
 *
 * Why this exists: server fetching fails for bot-walled hosts (vidsrc-style
 * embeds return HTTP 403 to datacenter IPs). In that case the peer never gets
 * pixels through the proxy — but both browsers can usually load the embed
 * directly, exactly like a nested <iframe> inside a proxied page. This wrapper
 * makes "open embed URL" a first-class path: server stores the URL against an
 * opaque id, each browser's viewer redirects to the target itself, the raw URL
 * never goes over the DataChannel or into any URL bar.
 *
 * Auth model: the navigationId is bearer (same as /api/view). The redirect
 * target is only known to the server; the wrapper page itself carries no URL.
 * Explicit tradeoff: the peer's browser must resolve the target to load it,
 * so the address is visible in devtools/network on their machine (not in the
 * UI). Only use Embed mode when both participants accept that.
 *
 * Framing model: the embed iframe is deliberately NOT sandboxed. Sandbox
 * flags (even permissive ones) change the frame's origin/security context,
 * and hardened players detect that and refuse to load. The embed is
 * cross-origin, so the same-origin policy already isolates it: it cannot
 * reach our DOM, storage, or cookies, and we cannot reach into it.
 */
export function renderEmbedWrapper(goHref: string, navigationId: string): string {
  const safe = JSON.stringify(goHref);
  const nav = JSON.stringify(navigationId);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="no-referrer" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shared embed</title>
    <style>
      html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }
      #stage { position: fixed; inset: 0; }
      #stage iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
      #bar {
        position: fixed; left: 0; right: 0; bottom: 0;
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
        background: rgba(16, 14, 12, 0.92); color: #efe7dc;
        font: 13px/1.4 Georgia, serif;
        transform: translateY(100%); transition: transform 0.25s ease;
        z-index: 10;
      }
      body.showbar #bar { transform: none; }
      #bar button {
        border: 1px solid #4a443c; background: #221e1a; color: #e8c97a;
        border-radius: 6px; padding: 8px 12px; min-height: 36px; font-size: 13px;
      }
      #hint { color: #cbbba8; flex: 1; }
      /* Vendor status strip: title + episode the landing page reports.
       * Display only — we never touch playback. */
      #titlebar {
        position: fixed; top: 0; left: 0; right: 0;
        padding: 8px 14px calc(8px);
        background: rgba(0,0,0,0.65); color: #f3e9d4;
        font: 600 14px/1.3 system-ui, sans-serif;
        z-index: 10; pointer-events: none;
      }
      #titlebar[hidden] { display: none; }
      #sestate { color: #cbbba8; font-weight: 400; margin-left: 8px; }
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <div id="titlebar" hidden><span id="vstitle"></span><span id="sestate"></span></div>
    <div id="bar">
      <button id="fs" type="button">Fullscreen</button>
      <button id="rw" type="button">Reload embed</button>
      <span id="hint">Co-watch: the clock below keeps both sides together. Press play on the countdown.</span>
    </div>
    <script>
    (function(){
      var NAV_ID = ${nav};
      var SRC = ${safe};
      var stage = document.getElementById("stage");
      var frame = document.createElement("iframe");
      // Deliberately unsandboxed: hardened players refuse sandboxed frames.
      // Isolation comes from the cross-origin boundary instead — the embed
      // cannot reach our DOM/storage/cookies, and we cannot reach into it.
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("allow", "fullscreen; autoplay; encrypted-media; picture-in-picture");
      frame.setAttribute("allowfullscreen", "");
      frame.src = SRC;
      stage.appendChild(frame);
      document.getElementById("rw").onclick = function(){ frame.src = SRC; };
      // --- Vendor relay (vidsrc landing, same frame): the landing relays
      // whitelisted player events upward WITHOUT the movietime namespace, so
      // our onMessage filter (ns === "movietime") would drop them. This
      // listener handles raw vendor events directly from our own iframe,
      // re-wraps the whitelisted ones into movietime events for the shell,
      // and ALSO forwards TV_SET-style control messages from the shell down.
      // Never forwards arbitrary payloads: allowlist only, both directions.
      var titlebar = document.getElementById("titlebar");
      var vstitle = document.getElementById("vstitle");
      var sestate = document.getElementById("sestate");
      var VENDOR_TYPES = {
        PLAYER_TITLE: 1, TV_INFO: 1, TV_STATE: 1,
        PLAYER_UI: 1, MEDIA_NOT_FOUND: 1, VS_EXPIRED: 1, VS_DEVTOOLS: 1
      };
      function relayUp(d){
        if (!d || typeof d.type !== "string" || !VENDOR_TYPES[d.type]) return;
        try {
          var msg = { ns: "movietime", navigationId: NAV_ID, type: "embed:event", vendor: "vidsrc", etype: d.type };
          if (typeof d.title === "string") msg.title = d.title.slice(0, 200);
          if (typeof d.season !== "undefined") msg.season = +d.season || 0;
          if (typeof d.episode !== "undefined") msg.episode = +d.episode || 0;
          if (typeof d.visible !== "undefined") msg.visible = !!d.visible;
          parent.postMessage(msg, "*");
        } catch (e) {}
        // Local display strip (display only — never playback).
        try {
          if (d.type === "PLAYER_TITLE" && d.title) {
            vstitle.textContent = String(d.title).slice(0, 200);
            titlebar.hidden = false;
          } else if (d.type === "MEDIA_NOT_FOUND") {
            vstitle.textContent = "Media not found";
            titlebar.hidden = false;
          } else if (d.type === "TV_INFO" || d.type === "TV_STATE") {
            var bits = [];
            if (d.season) bits.push("S" + d.season);
            if (d.episode) bits.push("E" + d.episode);
            if (bits.length) {
              sestate.textContent = bits.join(" ");
              titlebar.hidden = false;
            }
          }
        } catch (e) {}
      }
      window.addEventListener("message", function(ev){
        if (ev.source !== frame.contentWindow) return;
        relayUp(ev.data);
      });
      document.getElementById("fs").onclick = function(){
        try {
          if (frame.requestFullscreen) frame.requestFullscreen();
          else if (stage.requestFullscreen) stage.requestFullscreen();
        } catch (e) {}
        try { parent.postMessage({ ns: "movietime", navigationId: NAV_ID, type: "embed:fullscreen" }, "*"); } catch (e) {}
      };
      // Tap / small screens: show controls briefly.
      var t = null;
      function wake(){
        document.body.classList.add("showbar");
        if (t) clearTimeout(t);
        t = setTimeout(function(){ document.body.classList.remove("showbar"); }, 4000);
      }
      document.addEventListener("pointerdown", wake, { passive: true });
      setTimeout(wake, 800);
      try { parent.postMessage({ ns: "movietime", navigationId: NAV_ID, type: "ready" }, "*"); } catch (e) {}
    })();
    </script>
  </body>
</html>`;
}
