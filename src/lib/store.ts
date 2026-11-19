import { EventEmitter } from "events";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomId, randomRoomId, randomToken } from "./ids";
import type { DurableBindings } from "./durable-rpc";
import type { Role, SignalEnvelope, SignalPayload } from "./protocol";

export const ROOM_TTL_MS = 60 * 60 * 1000;
export const NAV_TTL_MS = 60 * 60 * 1000;

export type Participant = {
  token: string;
  lastSeen: number;
};

export type RoomRecord = {
  id: string;
  createdAt: number;
  expiresAt: number;
  participants: Partial<Record<Role, Participant>>;
  nextSeq: number;
  signals: SignalEnvelope[];
};

export type NavigationRecord = {
  id: string;
  roomId: string;
  url: string;
  /** "page" = server-fetched + rewritten; "embed" = direct client iframe wrapper. */
  kind: "page" | "embed";
  createdAt: number;
  expiresAt: number;
};

export interface AppStore {
  createRoom(): Promise<{ room: RoomRecord; token: string; role: Role }>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  joinRoom(
    roomId: string,
    token?: string
  ): Promise<{ room: RoomRecord; token: string; role: Role } | { error: "missing" | "full" }>;
  touch(roomId: string, role: Role): Promise<void>;
  publish(roomId: string, from: Role, payload: SignalPayload): Promise<SignalEnvelope | null>;
  waitSignals(roomId: string, after: number, waitMs: number): Promise<SignalEnvelope[]>;
  createNavigation(roomId: string, url: string, kind?: "page" | "embed"): Promise<NavigationRecord>;
  getNavigation(navigationId: string): Promise<NavigationRecord | null>;
}

type MemoryState = {
  rooms: Map<string, RoomRecord>;
  navigations: Map<string, NavigationRecord>;
  bus: EventEmitter;
};

function memoryState(): MemoryState {
  const g = globalThis as typeof globalThis & { __mtStore?: MemoryState };
  if (!g.__mtStore) {
    g.__mtStore = {
      rooms: new Map(),
      navigations: new Map(),
      bus: new EventEmitter(),
    };
    g.__mtStore.bus.setMaxListeners(200);
  }
  return g.__mtStore;
}

function prune(state: MemoryState) {
  const now = Date.now();
  state.rooms.forEach((room, id) => {
    if (room.expiresAt < now) state.rooms.delete(id);
  });
  state.navigations.forEach((nav, id) => {
    if (nav.expiresAt < now) state.navigations.delete(id);
  });
}

class MemoryStore implements AppStore {
  async createRoom() {
    const state = memoryState();
    prune(state);
    const now = Date.now();
    const token = randomToken();
    let id = randomRoomId();
    while (state.rooms.has(id)) id = randomRoomId();
    const room: RoomRecord = {
      id,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      participants: { a: { token, lastSeen: now } },
      nextSeq: 1,
      signals: [],
    };
    state.rooms.set(room.id, room);
    return { room, token, role: "a" as const };
  }

  async getRoom(roomId: string) {
    const state = memoryState();
    prune(state);
    return state.rooms.get(roomId) ?? null;
  }

  async joinRoom(roomId: string, token?: string) {
    const state = memoryState();
    prune(state);
    const room = state.rooms.get(roomId);
    if (!room) return { error: "missing" as const };
    const now = Date.now();

    if (token) {
      if (room.participants.a?.token === token) {
        room.participants.a.lastSeen = now;
        return { room, token, role: "a" as const };
      }
      if (room.participants.b?.token === token) {
        room.participants.b.lastSeen = now;
        return { room, token, role: "b" as const };
      }
    }

    if (!room.participants.b) {
      const nextToken = randomToken();
      room.participants.b = { token: nextToken, lastSeen: now };
      return { room, token: nextToken, role: "b" as const };
    }

    if (!room.participants.a) {
      const nextToken = randomToken();
      room.participants.a = { token: nextToken, lastSeen: now };
      return { room, token: nextToken, role: "a" as const };
    }

    return { error: "full" as const };
  }

  async touch(roomId: string, role: Role) {
    const room = (await this.getRoom(roomId)) ?? undefined;
    if (room?.participants[role]) {
      room.participants[role]!.lastSeen = Date.now();
    }
  }

  async publish(roomId: string, from: Role, payload: SignalPayload) {
    const state = memoryState();
    const room = state.rooms.get(roomId);
    if (!room) return null;
    const envelope: SignalEnvelope = {
      seq: room.nextSeq++,
      from,
      payload,
      ts: Date.now(),
    };
    room.signals.push(envelope);
    if (room.signals.length > 200) {
      room.signals.splice(0, room.signals.length - 200);
    }
    state.bus.emit(roomId, envelope);
    return envelope;
  }

  async waitSignals(roomId: string, after: number, waitMs: number) {
    const state = memoryState();
    const room = state.rooms.get(roomId);
    if (!room) return [];
    const existing = room.signals.filter((s) => s.seq > after);
    if (existing.length > 0) return existing;

    return new Promise<SignalEnvelope[]>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, waitMs);

      const onMsg = () => {
        const next = state.rooms.get(roomId)?.signals.filter((s) => s.seq > after) ?? [];
        if (next.length > 0) {
          cleanup();
          resolve(next);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        state.bus.off(roomId, onMsg);
      };

      state.bus.on(roomId, onMsg);
    });
  }

  async createNavigation(roomId: string, url: string, kind: "page" | "embed" = "page") {
    const state = memoryState();
    const now = Date.now();
    const record: NavigationRecord = {
      id: randomId(18),
      roomId,
      url,
      kind,
      createdAt: now,
      expiresAt: now + NAV_TTL_MS,
    };
    state.navigations.set(record.id, record);
    return record;
  }

  async getNavigation(navigationId: string) {
    const state = memoryState();
    prune(state);
    return state.navigations.get(navigationId) ?? null;
  }
}

type RedisJson = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, ttlSec: number) => Promise<void>;
  rpush: (key: string, value: string) => Promise<void>;
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
};

function redisClient(): RedisJson | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  async function command<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([args]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Redis request failed");
    const data = (await res.json()) as { result?: T }[];
    return data[0]?.result as T;
  }

  return {
    async get<T>(key: string) {
      const result = await command<string | null>(["GET", key]);
      return result ? (JSON.parse(result) as T) : null;
    },
    async set(key, value, ttlSec) {
      await command(["SET", key, JSON.stringify(value), "EX", ttlSec]);
    },
    async rpush(key, value) {
      await command(["RPUSH", key, value]);
      await command(["EXPIRE", key, 3600]);
    },
    async lrange(key, start, stop) {
      return (await command<string[]>(["LRANGE", key, start, stop])) ?? [];
    },
  };
}

class RedisStore implements AppStore {
  constructor(private redis: RedisJson) {}

  private roomKey(id: string) {
    return `mt:room:${id}`;
  }
  private sigKey(id: string) {
    return `mt:sig:${id}`;
  }
  private navKey(id: string) {
    return `mt:nav:${id}`;
  }

  async createRoom() {
    const now = Date.now();
    const token = randomToken();
    let id = randomRoomId();
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await this.redis.get(this.roomKey(id));
      if (!existing) break;
      id = randomRoomId();
    }
    const room: RoomRecord = {
      id,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      participants: { a: { token, lastSeen: now } },
      nextSeq: 1,
      signals: [],
    };
    await this.redis.set(this.roomKey(room.id), { ...room, signals: undefined }, 3600);
    return { room, token, role: "a" as const };
  }

  async getRoom(roomId: string) {
    const meta = await this.redis.get<Omit<RoomRecord, "signals">>(this.roomKey(roomId));
    if (!meta) return null;
    const raw = await this.redis.lrange(this.sigKey(roomId), 0, -1);
    const signals = raw.map((item) => JSON.parse(item) as SignalEnvelope);
    return { ...meta, signals };
  }

  async joinRoom(roomId: string, token?: string) {
    const room = await this.getRoom(roomId);
    if (!room) return { error: "missing" as const };
    const now = Date.now();

    if (token) {
      if (room.participants.a?.token === token) {
        room.participants.a.lastSeen = now;
        await this.saveMeta(room);
        return { room, token, role: "a" as const };
      }
      if (room.participants.b?.token === token) {
        room.participants.b.lastSeen = now;
        await this.saveMeta(room);
        return { room, token, role: "b" as const };
      }
    }

    if (!room.participants.b) {
      const nextToken = randomToken();
      room.participants.b = { token: nextToken, lastSeen: now };
      await this.saveMeta(room);
      return { room, token: nextToken, role: "b" as const };
    }

    if (!room.participants.a) {
      const nextToken = randomToken();
      room.participants.a = { token: nextToken, lastSeen: now };
      await this.saveMeta(room);
      return { room, token: nextToken, role: "a" as const };
    }

    return { error: "full" as const };
  }

  private async saveMeta(room: RoomRecord) {
    const meta: Omit<RoomRecord, "signals"> = {
      id: room.id,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      participants: room.participants,
      nextSeq: room.nextSeq,
    };
    await this.redis.set(this.roomKey(room.id), meta, 3600);
  }

  async touch(roomId: string, role: Role) {
    const room = await this.getRoom(roomId);
    if (room?.participants[role]) {
      room.participants[role]!.lastSeen = Date.now();
      await this.saveMeta(room);
    }
  }

  async publish(roomId: string, from: Role, payload: SignalPayload) {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    const envelope: SignalEnvelope = {
      seq: room.nextSeq++,
      from,
      payload,
      ts: Date.now(),
    };
    await this.saveMeta(room);
    await this.redis.rpush(this.sigKey(roomId), JSON.stringify(envelope));
    return envelope;
  }

  async waitSignals(roomId: string, after: number, waitMs: number) {
    const started = Date.now();
    while (Date.now() - started < waitMs) {
      const raw = await this.redis.lrange(this.sigKey(roomId), 0, -1);
      const signals = raw
        .map((item) => JSON.parse(item) as SignalEnvelope)
        .filter((s) => s.seq > after);
      if (signals.length > 0) return signals;
      await new Promise((r) => setTimeout(r, 350));
    }
    return [];
  }

  async createNavigation(roomId: string, url: string, kind: "page" | "embed" = "page") {
    const now = Date.now();
    const record: NavigationRecord = {
      id: randomId(18),
      roomId,
      url,
      kind,
      createdAt: now,
      expiresAt: now + NAV_TTL_MS,
    };
    await this.redis.set(this.navKey(record.id), record, 3600);
    return record;
  }

  async getNavigation(navigationId: string) {
    return this.redis.get<NavigationRecord>(this.navKey(navigationId));
  }
}

class DurableStore implements AppStore {
  constructor(private env: DurableBindings) {}

  private room(roomId: string) {
    return this.env.ROOMS.getByName(roomId.toLowerCase());
  }

  private nav(navigationId: string) {
    return this.env.NAVS.getByName(navigationId);
  }

  async createRoom() {
    const token = randomToken();
    let id = randomRoomId();
    for (let attempt = 0; attempt < 8; attempt++) {
      const created = await this.room(id).init(id, token);
      if (created) {
        const room = await this.room(id).snapshot();
        if (!room) throw new Error("Room create failed");
        return { room, token, role: "a" as const };
      }
      id = randomRoomId();
    }
    throw new Error("Could not allocate a room id");
  }

  async getRoom(roomId: string) {
    return this.room(roomId).snapshot();
  }

  async joinRoom(roomId: string, token?: string) {
    const result = await this.room(roomId).join(token);
    if ("error" in result) return result;
    return { room: result.room, token: result.token, role: result.role };
  }

  async touch(roomId: string, role: Role) {
    await this.room(roomId).touch(role);
  }

  async publish(roomId: string, from: Role, payload: SignalPayload) {
    return this.room(roomId).publish(from, payload);
  }

  async waitSignals(roomId: string, after: number, waitMs: number) {
    const started = Date.now();
    while (Date.now() - started < waitMs) {
      const signals = await this.room(roomId).signalsAfter(after);
      if (signals.length > 0) return signals;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return [];
  }

  async createNavigation(roomId: string, url: string, kind: "page" | "embed" = "page") {
    const now = Date.now();
    const record: NavigationRecord = {
      id: randomId(18),
      roomId,
      url,
      kind,
      createdAt: now,
      expiresAt: now + NAV_TTL_MS,
    };
    await this.nav(record.id).save(record);
    return record;
  }

  async getNavigation(navigationId: string) {
    return this.nav(navigationId).load();
  }
}

function durableBindings(): DurableBindings | null {
  try {
    const { env } = getCloudflareContext();
    if (env.ROOMS && env.NAVS) {
      return { ROOMS: env.ROOMS, NAVS: env.NAVS };
    }
  } catch {
    // next dev / Node has no Worker bindings
  }
  return null;
}

export function getStore(): AppStore {
  const durable = durableBindings();
  if (durable) {
    const g = globalThis as typeof globalThis & { __mtDoStore?: AppStore };
    g.__mtDoStore ??= new DurableStore(durable);
    return g.__mtDoStore;
  }

  const redis = redisClient();
  if (redis) {
    const g = globalThis as typeof globalThis & { __mtRedisStore?: AppStore };
    g.__mtRedisStore ??= new RedisStore(redis);
    return g.__mtRedisStore;
  }

  const g = globalThis as typeof globalThis & { __mtMemStore?: AppStore };
  g.__mtMemStore ??= new MemoryStore();
  return g.__mtMemStore;
}
