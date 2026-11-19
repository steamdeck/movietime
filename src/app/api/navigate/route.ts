import { isRoomId } from "@/lib/ids";
import { jsonNoStore } from "@/lib/http";
import { parseHttpUrl } from "@/lib/ssrf";
import { assertSafeUrl } from "@/lib/ssrf";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    roomId?: string;
    url?: string;
    token?: string;
    mode?: string;
  };
  if (!body.roomId || !isRoomId(body.roomId) || typeof body.url !== "string") {
    return jsonNoStore({ error: "Invalid request" }, { status: 400 });
  }

  const store = getStore();
  const room = await store.getRoom(body.roomId);
  if (!room) return jsonNoStore({ error: "Room not found" }, { status: 404 });

  const tokenOk =
    (body.token && room.participants.a?.token === body.token) ||
    (body.token && room.participants.b?.token === body.token);
  if (!tokenOk) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.mode === "embed") {
    // Embed mode: no server fetch, no SSRF gate beyond shape. The raw URL is
    // stored server-side (the server must resolve it for the peer's viewer),
    // and each browser loads the target directly in a sandboxed iframe —
    // exactly like a nested embed. Bot-walled hosts that 403 our datacenter
    // fetch work here because we never fetch.
    const parsed = parseHttpUrl(body.url);
    if (!parsed) {
      return jsonNoStore({ error: "Only http and https URLs can be embedded." }, { status: 400 });
    }
    const navigation = await store.createNavigation(body.roomId, parsed.href, "embed");
    return jsonNoStore({ navigationId: navigation.id, mode: "embed" });
  }

  try {
    const parsed = await assertSafeUrl(body.url);
    const navigation = await store.createNavigation(body.roomId, parsed.href, "page");
    return jsonNoStore({ navigationId: navigation.id, mode: "page" });
  } catch {
    return jsonNoStore(
      {
        error: "That address cannot be loaded.",
        hint: "If the site blocks server fetching, try Embed instead.",
      },
      { status: 400 }
    );
  }
}
