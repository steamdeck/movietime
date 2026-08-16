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

function assetUrl(absolute: string): string {
  return `/api/asset?t=${encodeURIComponent(sealUrl(absolute))}`;
}

function resolveUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
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
  return value
    .split(",")
    .map((part) => {
      const bits = part.trim().split(/\s+/);
      const url = bits[0];
      const rest = bits.slice(1).join(" ");
      const absolute = resolveUrl(url, baseUrl);
      if (!absolute) return part.trim();
      return rest ? `${assetUrl(absolute)} ${rest}` : assetUrl(absolute);
    })
    .join(", ");
}

function rewriteCss(css: string, baseUrl: string): string {
  return css.replace(/url\((['"]?)(.*?)\1\)/g, (full, _quote, inner: string) => {
    const absolute = resolveUrl(inner, baseUrl);
    if (!absolute) return full;
    return `url("${assetUrl(absolute)}")`;
  });
}

export function injectScriptSource(navigationId: string): string {
  return `
(function(){
  var NAV_ID = ${JSON.stringify(navigationId)};
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

  document.addEventListener("click", function(e){
    var t = e.target;
    if (t && t.nodeType === 3) t = t.parentElement;
    var a = t && t.closest ? t.closest("a") : null;
    if (!a || !a.href) return;
    if (a.target === "_blank") return;
    var href = a.getAttribute("href") || "";
    if (href.startsWith("#")) return;
    e.preventDefault();
    follow(a.href);
  }, true);

  document.addEventListener("submit", function(e){
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;
    e.preventDefault();
    follow(form.action || location.href);
  }, true);

  window.addEventListener("message", function(event){
    var data = event.data;
    if (!data || data.ns !== "movietime") return;
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

export function rewriteHtml(html: string, baseUrl: string, navigationId: string): string {
  const $ = cheerio.load(html);

  $('meta[http-equiv="refresh"]').remove();
  $('meta[http-equiv="Content-Security-Policy"]').remove();
  $("base").remove();

  for (const [tag, attr] of REWRITE_ATTRS) {
    $(tag).each((_, el) => {
      const value = $(el).attr(attr);
      if (!value) return;
      const absolute = resolveUrl(value, baseUrl);
      if (absolute) $(el).attr(attr, assetUrl(absolute));
    });
  }

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

  const script = `<script>${injectScriptSource(navigationId)}</script>`;
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
