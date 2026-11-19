export type Role = "a" | "b";

export type NavigationSource = "local" | "remote";

export type HistoryAction = "back" | "forward" | "reload";

export type SyncMessage =
  | { type: "navigate"; navigationId: string }
  | { type: "scroll"; x: number; y: number; timestamp: number; control?: boolean }
  | { type: "history"; action: HistoryAction; navigationId?: string }
  | { type: "video:play"; position: number; timestamp: number; control?: boolean }
  | { type: "video:pause"; position: number; timestamp: number; control?: boolean }
  | { type: "video:seek"; position: number; timestamp: number; control?: boolean }
  | { type: "video:rate"; rate: number; position: number; timestamp: number; control?: boolean }
  | { type: "control:request" }
  | { type: "control:grant" }
  | { type: "control:revoke" }
  | { type: "control:deny" }
  | { type: "screenshare:start" }
  | { type: "screenshare:stop" }
  | { type: "ping"; t: number }
  | { type: "pong"; t: number };

export type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: IceCandidateJSON }
  | { type: "peer-left" }
  | { type: "peer-joined"; role: Role };

export type IceCandidateJSON = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type SignalEnvelope = {
  seq: number;
  from: Role;
  payload: SignalPayload;
  ts: number;
};

const SYNC_TYPES = new Set<SyncMessage["type"]>([
  "navigate",
  "scroll",
  "history",
  "video:play",
  "video:pause",
  "video:seek",
  "video:rate",
  "control:request",
  "control:grant",
  "control:revoke",
  "control:deny",
  "screenshare:start",
  "screenshare:stop",
  "ping",
  "pong",
]);

const FORBIDDEN_KEYS = ["url", "href", "src", "location", "uri", "link"];

export function parseSyncMessage(raw: string): SyncMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of FORBIDDEN_KEYS) {
    if (key in record) return null;
  }
  if (typeof record.type !== "string" || !SYNC_TYPES.has(record.type as SyncMessage["type"])) {
    return null;
  }
  if (!validShape(record)) return null;
  return data as SyncMessage;
}

function validShape(record: Record<string, unknown>): boolean {
  switch (record.type) {
    case "navigate":
      return typeof record.navigationId === "string" && /^[a-f0-9]{24,64}$/.test(record.navigationId);
    case "scroll": {
      if (typeof record.x !== "number" || typeof record.y !== "number") return false;
      if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return false;
      if (Math.abs(record.x) > 100_000 || Math.abs(record.y) > 100_000) return false;
      if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) return false;
      return record.control === undefined || typeof record.control === "boolean";
    }
    case "history":
      if (record.action !== "back" && record.action !== "forward" && record.action !== "reload") {
        return false;
      }
      return (
        record.navigationId === undefined ||
        (typeof record.navigationId === "string" &&
          /^[a-f0-9]{24,64}$/.test(record.navigationId))
      );
    case "video:play":
    case "video:pause":
    case "video:seek":
      if (typeof record.position !== "number" || !Number.isFinite(record.position)) return false;
      if (record.position < 0 || record.position > 24 * 3600) return false;
      if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) return false;
      if (record.type === "video:seek" && "rate" in record) return false;
      return record.control === undefined || typeof record.control === "boolean";
    case "video:rate":
      if (typeof record.rate !== "number" || !Number.isFinite(record.rate)) return false;
      if (record.rate <= 0 || record.rate > 4) return false;
      if (typeof record.position !== "number" || !Number.isFinite(record.position)) return false;
      if (record.position < 0 || record.position > 24 * 3600) return false;
      if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) return false;
      return record.control === undefined || typeof record.control === "boolean";
    case "ping":
    case "pong":
      return typeof record.t === "number" && Number.isFinite(record.t);
    case "control:request":
    case "control:grant":
    case "control:revoke":
    case "control:deny":
    case "screenshare:start":
    case "screenshare:stop":
      return true;
    default:
      return false;
  }
}

export function assertNoUrl(message: SyncMessage): boolean {
  return !FORBIDDEN_KEYS.some((key) => key in message);
}
