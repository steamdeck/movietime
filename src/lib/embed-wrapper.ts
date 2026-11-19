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
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <div id="bar">
      <button id="fs" type="button">Fullscreen</button>
      <button id="rw" type="button">Reload embed</button>
      <span id="hint">Protected embed — loading directly in your browser. Playback is not synced; use screen share for exact sync.</span>
    </div>
    <script>
    (function(){
      var NAV_ID = ${nav};
      var SRC = ${safe};
      var stage = document.getElementById("stage");
      var frame = document.createElement("iframe");
      // Sandboxed: the embed cannot reach our storage, and we deliberately
      // cannot reach into it (cross-origin) — same deal as any nested
      // third-party iframe. Playback stays independent per peer.
      frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-presentation allow-same-origin");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("allow", "fullscreen; autoplay; encrypted-media; picture-in-picture");
      frame.setAttribute("allowfullscreen", "");
      frame.src = SRC;
      stage.appendChild(frame);
      document.getElementById("rw").onclick = function(){ frame.src = SRC; };
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
