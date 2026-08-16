import { isRoomId } from "@/lib/ids";
import { jsonNoStore } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) {
    return jsonNoStore({ error: "Invalid room" }, { status: 400 });
  }
  const room = await getStore().getRoom(roomId);
  if (!room) return jsonNoStore({ error: "Room not found" }, { status: 404 });
  return jsonNoStore({
    roomId: room.id,
    occupied: Object.keys(room.participants).length,
    max: 2,
  });
}
