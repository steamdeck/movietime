import { rewriteHtml } from "@/lib/html-rewrite";
import { fetchHtml } from "@/lib/fetch-page";
import { isOpaqueId } from "@/lib/ids";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
