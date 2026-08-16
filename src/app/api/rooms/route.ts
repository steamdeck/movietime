import { getStore } from "@/lib/store";
import { jsonNoStore } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const store = getStore();
  const { room, token, role } = await store.createRoom();
  return jsonNoStore({
    roomId: room.id,
    token,
    role,
    occupied: Object.keys(room.participants).length,
  });
}
