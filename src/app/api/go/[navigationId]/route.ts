import { isOpaqueId } from "@/lib/ids";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Direct-load endpoint for embed navigations only.
 *
 * The viewer wrapper points its sandboxed iframe here; we answer 302 to the
 * stored target so each browser fetches it with its own IP (bot-walled hosts
 * that 403 datacenter fetches work because the server never fetches).
 *
 * Privacy tradeoff (explicit): unlike proxied "page" navigations where the
 * peer's browser never sees the URL, here the peer's browser MUST resolve it
 * to load it. The address stays out of the UI / URL bar / DataChannel /
 * history, but anyone with the navigationId (or devtools open on the viewer)
 * can learn it from the redirect. Only use Embed mode when both participants
 * accept that.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ navigationId: string }> }
) {
  const { navigationId } = await params;
  if (!isOpaqueId(navigationId)) {
    return new Response("Not found", { status: 404 });
  }
  const navigation = await getStore().getNavigation(navigationId);
  if (!navigation || navigation.kind !== "embed") {
    return new Response("Not found", { status: 404 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: navigation.url,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
