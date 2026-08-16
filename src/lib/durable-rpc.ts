import type { Role, SignalEnvelope, SignalPayload } from "./protocol";
import type { NavigationRecord, RoomRecord } from "./store";

export type JoinResult =
  | { error: "missing" | "full" }
  | { token: string; role: Role; room: RoomRecord };

export type MovieRoomMethods = {
  init(id: string, token: string): Promise<boolean>;
  snapshot(): Promise<RoomRecord | null>;
  join(token?: string): Promise<JoinResult>;
  touch(role: Role): Promise<void>;
  publish(from: Role, payload: SignalPayload): Promise<SignalEnvelope | null>;
  signalsAfter(after: number): Promise<SignalEnvelope[]>;
};

export type MovieNavMethods = {
  save(record: NavigationRecord): Promise<void>;
  load(): Promise<NavigationRecord | null>;
};

export type DurableBindings = {
  ROOMS: { getByName(name: string): MovieRoomMethods };
  NAVS: { getByName(name: string): MovieNavMethods };
};
