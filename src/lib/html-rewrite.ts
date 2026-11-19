import * as cheerio from "cheerio";
import { openUrl, sealUrl } from "./url-crypto";

const REWRITE_ATTRS: Array<[string, string]> = [
  ["a", "href"],
  ["area", "href"],
  ["link", "href"],
  ["img", "src"],
  ["script", "src"],
  ["iframe", "src"],
  ["embed", "src"],
  ["source", "src"],
  ["video", "src"],
  ["audio", "src"],
  ["track", "src"],
  ["form", "action"],
  ["object", "data"],
  ["use", "href"],
  ["image", "href"],
];

const UNSAFE_URL = /^(javascript|vbscript|file|gopher|expect|php):/i;
const UNSAFE_DATA_URL = /^data:text\/html/i;

function assetUrl(absolute: string): string {
  return `/api/asset?t=${encodeURIComponent(sealUrl(absolute))}`;
}

function resolveUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || UNSAFE_URL.test(trimmed) || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return null;
  }
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("#")) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function rewriteSrcset(value: string, baseUrl: string): string {
  const parts = value
    .split(",")
    .map((part) => {
      const text = part.trim();
      if (!text) return null;
      const bits = text.split(/\s+/);
      const head = bits[0] || "";
      // Keep opaque URLs the proxy must not touch.
      if (/^(data|blob):/i.test(head) || head.startsWith("#")) return text;
      const absolute = resolveUrl(head, baseUrl);
      if (!absolute) {
        // Unresolvable (e.g. javascript:) — drop the candidate.
        if (UNSAFE_URL.test(head) || UNSAFE_DATA_URL.test(head)) return null;
        return text;
      }
      const rest = bits.slice(1).join(" ");
      return rest ? `${assetUrl(absolute)} ${rest}` : assetUrl(absolute);
    })
    .filter((part): part is string => part !== null);
  return parts.join(", ");
}

function rewriteCss(css: string, baseUrl: string): string {
  // Rewrite @import "..." / @import '...' (no url(...)) first.
  let out = css.replace(
    /@import\s+(?!url\()("([^"]+)"|'([^']+)')/g,
    (full, _quoted: string, double: string, single: string) => {
      const absolute = resolveUrl(double || single || "", baseUrl);
      if (!absolute) return full;
      return `@import "${assetUrl(absolute)}"`;
    }
  );
  out = out.replace(/url\((['"]?)(.*?)\1\)/g, (full, _quote, inner: string) => {
    const trimmed = (inner || "").trim();
    if (UNSAFE_URL.test(trimmed) || UNSAFE_DATA_URL.test(trimmed)) {
      return `url("#blocked")`;
    }
    const absolute = resolveUrl(trimmed, baseUrl);
    if (!absolute) return full;
    return `url("${assetUrl(absolute)}")`;
  });
  return out;
}

export function injectScriptSource(navigationId: string, interactive = true): string {
  return `
(function(){
  var NAV_ID = ${JSON.stringify(navigationId)};
  var INTERACTIVE = ${interactive ? "true" : "false"};
  var applying = false;
  var lastScroll = 0;
  function send(msg){
    try { parent.postMessage(Object.assign({ ns: "movietime", navigationId: NAV_ID }, msg), "*"); } catch (e) {}
  }
  function onScroll(){
    if (applying) return;
    var now = Date.now();
    if (now - lastScroll < 50) return;
    lastScroll = now;
    send({ type: "scroll", x: window.scrollX || 0, y: window.scrollY || 0, timestamp: now });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  function bindVideo(video){
    if (video.__mtBound) return;
    video.__mtBound = true;
    var sending = false;
    function emit(type){
      if (applying || sending) return;
      sending = true;
      send({ type: type, position: video.currentTime || 0, timestamp: Date.now(), rate: video.playbackRate || 1 });
      sending = false;
    }
    video.addEventListener("play", function(){ emit("video:play"); });
    video.addEventListener("pause", function(){ emit("video:pause"); });
    video.addEventListener("seeked", function(){ emit("video:seek"); });
    video.addEventListener("ratechange", function(){ emit("video:rate"); });
  }
  function scan(){
    document.querySelectorAll("video").forEach(bindVideo);
  }
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

  async function follow(href){
    try {
      var res = await fetch("/api/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ from: NAV_ID, href: href })
      });
      if (!res.ok) return;
      var data = await res.json();
      if (data && data.navigationId) {
        send({ type: "navigate", navigationId: data.navigationId });
        location.replace("/api/view/" + data.navigationId);
      }
    } catch (e) {}
  }

  function closestLink(node){
    while (node) {
      if (node.tagName === "A") return node;
      node = node.parentElement;
    }
    return null;
  }

  function onLinkClick(e){
    var t = e.target;
    if (t && t.nodeType === 3) t = t.parentElement;
    var a = t && t.closest ? t.closest("a") : closestLink(t);
    if (!a || !a.href) return;
    var href = a.getAttribute("href") || "";
    if (href.startsWith("#")) { e.preventDefault(); return; }
    if (/^(mailto|tel):/i.test(href)) return;
    e.preventDefault();
    if (!INTERACTIVE) return;
    follow(a.href);
  }

  document.addEventListener("click", onLinkClick, true);
  document.addEventListener("auxclick", onLinkClick, true);

  document.addEventListener("submit", function(e){
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;
    e.preventDefault();
    if (!INTERACTIVE) return;
    var action = form.action || location.href;
    try {
      if ((form.method || "get").toLowerCase() === "get") {
        var params = new URLSearchParams(new FormData(form));
        var url = new URL(action, location.href);
        params.forEach(function(v, k){ url.searchParams.set(k, v); });
        action = url.href;
      }
    } catch (err) {}
    follow(action);
  }, true);

  window.addEventListener("message", function(event){
    var data = event.data;
    if (!data || data.ns !== "movietime") return;
    // Only the viewer shell (our parent window) may drive this page.
    // Nested third-party frames must not be able to spoof scroll/video.
    if (event.source !== window.parent) return;
    applying = true;
    try {
      if (data.type === "scroll") {
        window.scrollTo(data.x || 0, data.y || 0);
      }
      if (data.type && String(data.type).indexOf("video:") === 0) {
        var video = document.querySelector("video");
        if (video) {
          var expected = typeof data.position === "number" ? data.position : video.currentTime;
          if (Math.abs((video.currentTime || 0) - expected) > 0.35) {
            video.currentTime = expected;
          }
          if (data.type === "video:play") {
            var p = video.play();
            if (p && p.catch) p.catch(function(){});
          }
          if (data.type === "video:pause") video.pause();
          if (data.type === "video:rate" && data.rate) video.playbackRate = data.rate;
        }
      }
    } finally {
      setTimeout(function(){ applying = false; }, 80);
    }
  });

  send({ type: "ready" });
})();`.trim();
}

export function rewriteHtml(
  html: string,
  baseUrl: string,
  navigationId: string,
  options?: { interactive?: boolean }
): string {
  const $ = cheerio.load(html);
  const interactive = options?.interactive ?? true;

  // The proxied page must never run its own scripts in our origin. Our sync
  // shim below is the only script that survives.
  $("script").remove();
  $("applet, object, embed").remove();
  $("frame").remove();
  $("frameset").each((_, el) => {
    $(el).replaceWith($(el).html() || "");
  });
  $('link[rel="import" i]').remove();

  // Case-insensitive refresh / CSP handling (attribute values vary in case).
  $("meta").each((_, el) => {
    const equiv = ($(el).attr("http-equiv") || "").toLowerCase();
    if (equiv === "refresh" || equiv === "content-security-policy") {
      $(el).remove();
    }
  });
  $("base").remove();

  // Strip inline event handlers (onclick=..., onload=..., ...).
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    const attribs = (el as { attribs?: Record<string, string> }).attribs || {};
    for (const name of Object.keys(attribs)) {
      if (/^on/i.test(name)) $(el).removeAttr(name);
    }
  });

  for (const [tag, attr] of REWRITE_ATTRS) {
    $(tag).each((_, el) => {
      const raw = ($(el).attr(attr) || "").trim();
      if (!raw) return;
      if (UNSAFE_URL.test(raw) || UNSAFE_DATA_URL.test(raw)) {
        $(el).removeAttr(attr);
        return;
      }
      const absolute = resolveUrl(raw, baseUrl);
      if (absolute) $(el).attr(attr, assetUrl(absolute));
    });
  }

  // Nested frames stay inert: rewritten above, now forced maximally sandboxed
  // so embedded documents cannot run scripts even if served as HTML.
  $("iframe").each((_, el) => {
    $(el).attr("sandbox", "");
    $(el).attr("referrerpolicy", "no-referrer");
  });

  $("[srcset]").each((_, el) => {
    const value = $(el).attr("srcset");
    if (value) $(el).attr("srcset", rewriteSrcset(value, baseUrl));
  });

  $("[style]").each((_, el) => {
    const value = $(el).attr("style");
    if (value) $(el).attr("style", rewriteCss(value, baseUrl));
  });

  $("style").each((_, el) => {
    const css = $(el).html();
    if (css) $(el).html(rewriteCss(css, baseUrl));
  });

  $("a, area, form, iframe").attr("referrerpolicy", "no-referrer");

  const script = `<script>${injectScriptSource(navigationId, interactive)}</script>`;
  if ($("body").length) {
    $("body").append(script);
  } else {
    $.root().append(script);
  }

  return $.html();
}

export function rewriteCssFile(css: string, baseUrl: string): string {
  return rewriteCss(css, baseUrl);
}

export function resolveMaybeAssetHref(href: string, fromUrl: string): string | null {
  try {
    const parsed = new URL(href, fromUrl);
    if (parsed.pathname === "/api/asset") {
      const token = parsed.searchParams.get("t");
      if (!token) return null;
      try {
        return openUrl(token);
      } catch {
        return null;
      }
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}
