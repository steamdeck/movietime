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

async function authorized(roomId: string, role: unknown, token: unknown): Promise<boolean> {
  if (!isRole(role) || typeof token !== "string" || !token) return false;
  const room = await getStore().getRoom(roomId);
  if (!room) return false;
  const expected = room.participants[role]?.token;
  return !!expected && token.length === expected.length && token === expected;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) {
    return jsonNoStore({ error: "Invalid room" }, { status: 400 });
  }
  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") || "0");
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");
  if (!(await authorized(roomId, role, token))) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRole(role)) {
    return jsonNoStore({ error: "Invalid role" }, { status: 400 });
  }

  const store = getStore();
  await store.touch(roomId, role);

  const messages = await store.waitSignals(roomId, Number.isFinite(after) ? after : 0, 8000);
  const seq = messages.length ? messages[messages.length - 1].seq : after;
  return jsonNoStore({ messages, seq });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) {
    return jsonNoStore({ error: "Invalid room" }, { status: 400 });
  }

  const body = (await req.json()) as { role?: unknown; token?: unknown; payload?: unknown };
  if (!isRole(body.role) || !isSignalPayload(body.payload)) {
    return jsonNoStore({ error: "Invalid signal" }, { status: 400 });
  }
  if (!(await authorized(roomId, body.role, body.token))) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getStore();
  const envelope = await store.publish(roomId, body.role, body.payload);
  if (!envelope) return jsonNoStore({ error: "Room not found" }, { status: 404 });
  await store.touch(roomId, body.role);
  return jsonNoStore({ ok: true, seq: envelope.seq });
}
