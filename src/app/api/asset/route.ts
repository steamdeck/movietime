import { rewriteCssFile } from "@/lib/html-rewrite";
import { fetchResource } from "@/lib/fetch-page";
import { openUrl } from "@/lib/url-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INLINEABLE = /^(image|audio|video|font)\//;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  let url: string;
  try {
    url = openUrl(token);
  } catch {
    return new Response("Invalid token", { status: 400 });
  }

  try {
    const fetched = await fetchResource(url);
    let body: Buffer | string = fetched.body;
    const contentType = fetched.contentType;
    if (contentType.includes("text/css")) {
      body = rewriteCssFile(fetched.body.toString("utf8"), fetched.finalUrl);
    } else if (contentType.includes("text/html")) {
      // Never serve fetched HTML as HTML from our origin: a crafted page
      // would run with our origin's privileges. Force a download instead.
      return new Response(new Uint8Array(fetched.body), {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": 'attachment; filename="asset.html"',
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    const payload = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    return new Response(payload as unknown as BodyInit, {
      status: fetched.status,
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        // HTML/SVG swapped to attachment above; anything else the browser
        // might sniff into script execution stays inert.
        "Content-Security-Policy": INLINEABLE.test(contentType)
          ? "default-src 'none'; style-src 'unsafe-inline'"
          : "sandbox",
      },
    });
  } catch {
    return new Response("Asset unavailable", { status: 422 });
  }
}
