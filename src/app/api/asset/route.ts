import { rewriteCssFile } from "@/lib/html-rewrite";
import { fetchResource } from "@/lib/fetch-page";
import { openUrl } from "@/lib/url-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    }

    const payload: BodyInit =
      typeof body === "string" ? body : new Uint8Array(body);

    return new Response(payload, {
      status: fetched.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Asset unavailable", { status: 422 });
  }
}
