import { isRoomId } from "@/lib/ids";
import { jsonNoStore } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) {
    return jsonNoStore({ error: "Invalid room" }, { status: 400 });
  }

  let token: string | undefined;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token;
  } catch {
    token = undefined;
  }

  const result = await getStore().joinRoom(roomId, token);
  if ("error" in result) {
    const status = result.error === "missing" ? 404 : 409;
    return jsonNoStore(
      { error: result.error === "missing" ? "Room not found" : "Room is full" },
      { status }
    );
  }

  await getStore().publish(roomId, result.role, {
    type: "peer-joined",
    role: result.role,
  });

  return jsonNoStore({
    roomId: result.room.id,
    token: result.token,
    role: result.role,
    occupied: Object.keys(result.room.participants).length,
  });
}
