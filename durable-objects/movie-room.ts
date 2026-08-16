import { DurableObject } from "cloudflare:workers";
import type { Role, SignalEnvelope, SignalPayload } from "../src/lib/protocol";
import type { Participant, RoomRecord } from "../src/lib/store";
import type { JoinResult } from "../src/lib/durable-rpc";

const ROOM_TTL_MS = 60 * 60 * 1000;
const MAX_SIGNALS = 200;

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export class MovieRoom extends DurableObject {
  async init(id: string, token: string): Promise<boolean> {
    if (await this.load()) return false;
    const now = Date.now();
    await this.persist({
      id,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      participants: { a: { token, lastSeen: now } },
      nextSeq: 1,
      signals: [],
    });
    return true;
  }

  async snapshot(): Promise<RoomRecord | null> {
    return this.load();
  }

  async join(token?: string): Promise<JoinResult> {
    const room = await this.load();
    if (!room) return { error: "missing" };
    const now = Date.now();

    if (token) {
      if (room.participants.a?.token === token) {
        room.participants.a.lastSeen = now;
        await this.persist(room);
        return { token, role: "a", room };
      }
      if (room.participants.b?.token === token) {
        room.participants.b.lastSeen = now;
        await this.persist(room);
        return { token, role: "b", room };
      }
    }

    if (!room.participants.b) {
      const nextToken = randomToken();
      room.participants.b = { token: nextToken, lastSeen: now };
      await this.persist(room);
      return { token: nextToken, role: "b", room };
    }

    if (!room.participants.a) {
      const nextToken = randomToken();
      const participant: Participant = { token: nextToken, lastSeen: now };
      room.participants.a = participant;
      await this.persist(room);
      return { token: nextToken, role: "a", room };
    }

    return { error: "full" };
  }

  async touch(role: Role): Promise<void> {
    const room = await this.load();
    if (!room?.participants[role]) return;
    room.participants[role]!.lastSeen = Date.now();
    await this.persist(room);
  }

  async publish(from: Role, payload: SignalPayload): Promise<SignalEnvelope | null> {
    const room = await this.load();
    if (!room) return null;
    const envelope: SignalEnvelope = {
      seq: room.nextSeq++,
      from,
      payload,
      ts: Date.now(),
    };
    room.signals.push(envelope);
    if (room.signals.length > MAX_SIGNALS) {
      room.signals.splice(0, room.signals.length - MAX_SIGNALS);
    }
    await this.persist(room);
    return envelope;
  }

  async signalsAfter(after: number): Promise<SignalEnvelope[]> {
    const room = await this.load();
    if (!room) return [];
    return room.signals.filter((signal) => signal.seq > after);
  }

  async alarm(): Promise<void> {
    const room = await this.ctx.storage.get<RoomRecord>("room");
    if (!room || room.expiresAt <= Date.now()) {
      await this.ctx.storage.deleteAll();
    }
  }

  private async load(): Promise<RoomRecord | null> {
    const room = (await this.ctx.storage.get<RoomRecord>("room")) ?? null;
    if (!room) return null;
    if (room.expiresAt <= Date.now()) {
      await this.ctx.storage.deleteAll();
      return null;
    }
    return room;
  }

  private async persist(room: RoomRecord): Promise<void> {
    room.expiresAt = Date.now() + ROOM_TTL_MS;
    await this.ctx.storage.put("room", room);
    await this.ctx.storage.setAlarm(room.expiresAt);
  }
}
