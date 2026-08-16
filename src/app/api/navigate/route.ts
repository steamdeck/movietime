import { isRoomId } from "@/lib/ids";
import { jsonNoStore } from "@/lib/http";
import { assertSafeUrl } from "@/lib/ssrf";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { roomId?: string; url?: string; token?: string };
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

  try {
    const parsed = await assertSafeUrl(body.url);
    const navigation = await store.createNavigation(body.roomId, parsed.href);
    return jsonNoStore({ navigationId: navigation.id });
  } catch {
    return jsonNoStore({ error: "That address cannot be loaded." }, { status: 400 });
  }
}
