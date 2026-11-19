import { rewriteHtml } from "@/lib/html-rewrite";
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
    const html = rewriteHtml(fetched.body.toString("utf8"), fetched.finalUrl, navigation.id);
    return new Response(html, {
      status: fetched.status === 200 ? 200 : fetched.status,
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
