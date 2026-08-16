import { corsHeaders, jsonNoStore } from "@/lib/http";
import { isOpaqueId } from "@/lib/ids";
import { resolveMaybeAssetHref } from "@/lib/html-rewrite";
import { assertSafeUrl } from "@/lib/ssrf";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  const body = (await req.json()) as { from?: string; href?: string };
  if (!body.from || !isOpaqueId(body.from) || typeof body.href !== "string") {
    return jsonNoStore({ error: "Invalid request" }, { status: 400, headers });
  }

  const store = getStore();
  const current = await store.getNavigation(body.from);
  if (!current) {
    return jsonNoStore({ error: "Unknown page" }, { status: 404, headers });
  }

  try {
    const resolved = resolveMaybeAssetHref(body.href, current.url) || body.href;
    const parsed = await assertSafeUrl(resolved);
    const navigation = await store.createNavigation(current.roomId, parsed.href);
    return jsonNoStore({ navigationId: navigation.id }, { headers });
  } catch {
    return jsonNoStore({ error: "That address cannot be loaded." }, { status: 400, headers });
  }
}
