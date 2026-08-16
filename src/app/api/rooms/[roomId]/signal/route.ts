import { isRoomId } from "@/lib/ids";
import { jsonNoStore } from "@/lib/http";
import type { Role, SignalPayload } from "@/lib/protocol";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const SIGNAL_TYPES = new Set(["offer", "answer", "ice", "peer-left", "peer-joined"]);

function isRole(value: unknown): value is Role {
  return value === "a" || value === "b";
}

function isSignalPayload(value: unknown): value is SignalPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || !SIGNAL_TYPES.has(record.type)) return false;
  if ("url" in record || "href" in record) return false;
  return true;
}

export async function GET(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  if (!isRoomId(params.roomId)) {
    return jsonNoStore({ error: "Invalid room" }, { status: 400 });
  }
  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") || "0");
  const role = url.searchParams.get("role");
  if (!isRole(role)) {
    return jsonNoStore({ error: "Invalid role" }, { status: 400 });
  }

  const store = getStore();
  const room = await store.getRoom(params.roomId);
  if (!room) return jsonNoStore({ error: "Room not found" }, { status: 404 });
  await store.touch(params.roomId, role);

  const messages = await store.waitSignals(params.roomId, Number.isFinite(after) ? after : 0, 8000);
  const seq = messages.length ? messages[messages.length - 1].seq : after;
  return jsonNoStore({ messages, seq });
}

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  if (!isRoomId(params.roomId)) {
    return jsonNoStore({ error: "Invalid room" }, { status: 400 });
  }

  const body = (await req.json()) as { role?: unknown; payload?: unknown };
  if (!isRole(body.role) || !isSignalPayload(body.payload)) {
    return jsonNoStore({ error: "Invalid signal" }, { status: 400 });
  }

  const store = getStore();
  const envelope = await store.publish(params.roomId, body.role, body.payload);
  if (!envelope) return jsonNoStore({ error: "Room not found" }, { status: 404 });
  await store.touch(params.roomId, body.role);
  return jsonNoStore({ ok: true, seq: envelope.seq });
}
