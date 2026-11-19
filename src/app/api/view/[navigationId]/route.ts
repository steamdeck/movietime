import { rewriteHtml } from "@/lib/html-rewrite";
import { renderEmbedWrapper } from "@/lib/embed-wrapper";
import { fetchHtml } from "@/lib/fetch-page";
import { isOpaqueId } from "@/lib/ids";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentIsHtml(contentType: string): boolean {
  // fetchHtml sends Accept: text/html and can return error pages with odd
  // types, but a declared non-HTML payload (image/PDF/octet-stream) should
  // never be rendered as a page — the bytes would only show as garbage.
  // text/* and */*+xml are given the benefit of the doubt (some servers
  // mislabel XHTML); everything else is rejected.
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (!type || type === "application/octet-stream") return false;
  if (type === "text/html" || type === "application/xhtml+xml") return true;
  if (type.startsWith("text/")) return true;
  if (type.endsWith("+xml")) return true;
  return false;
}

function errorPage(message: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="no-referrer" />
    <style>
      html, body { height: 100%; margin: 0; background: #14110f; color: #efe7dc; font-family: Georgia, serif; }
      main { height: 100%; display: grid; place-items: center; padding: 24px; text-align: center; }
      p { max-width: 28rem; line-height: 1.5; color: #cbbba8; }
    </style>
  </head>
  <body>
    <main>
      <div>
        <h1 style="font-size: 1.15rem; font-weight: 500;">Page unavailable</h1>
        <p>${message}</p>
        <p>If the site blocks embedding or server fetching, use explicit screen sharing instead.</p>
      </div>
    </main>
  </body>
</html>`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ navigationId: string }> }
) {
  const { navigationId } = await params;
  if (!isOpaqueId(navigationId)) {
    return new Response(errorPage("This view does not exist."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const navigation = await getStore().getNavigation(navigationId);
  if (!navigation) {
    return new Response(errorPage("This view has expired."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  try {
    if (navigation.kind === "embed") {
      // No server fetch: the wrapper page's iframe points at our /api/go
      // redirect, which 302s each browser to the stored target. Each browser
      // fetches it with its own IP — bot-walled hosts that 403 datacenter
      // fetches load because the server never fetches.
      return new Response(renderEmbedWrapper(`/api/go/${navigation.id}`, navigation.id), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy": "frame-ancestors 'self'",
        },
      });
    }
    const fetched = await fetchHtml(navigation.url);
    if (!contentIsHtml(fetched.contentType)) {
      return new Response(
        errorPage(
          "That address is not a web page (it looks like a file download). " +
            "Open it with the asset proxy or screen-share it instead."
        ),
        {
          status: 422,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        }
      );
    }
    if (fetched.status === 401 || fetched.status === 403 || fetched.status === 429) {
      // Upstream refused the *server* fetch (bot protection / login wall /
      // geo block). What you saw as a bare "403 Forbidden nginx/..." is the
      // target site's answer to our datacenter IP — not Movietime refusing
      // you. Render our explainer instead of the upstream block page so the
      // two are never confused.
      return new Response(
        errorPage(
          `The site refused the shared viewer's request (HTTP ${fetched.status}). ` +
            "This usually means it blocks datacenter/bot fetching. " +
            "Your peer sees this explanation too — nothing private leaked. " +
            "Use explicit screen sharing for this site."
        ),
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        }
      );
    }
    if (fetched.status !== 200) {
      return new Response(
        errorPage(
          `The site responded with HTTP ${fetched.status}, so there is no page to share. ` +
            "If it needs login or blocks bots, use explicit screen sharing instead."
        ),
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        }
      );
    }
    const html = rewriteHtml(fetched.body.toString("utf8"), fetched.finalUrl, navigation.id);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch {
    return new Response(
      errorPage("This site could not be fetched for the shared viewer. Ask your partner to start screen sharing."),
      {
        status: 422,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }
    );
  }
}
