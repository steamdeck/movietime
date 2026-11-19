export type Role = "a" | "b";

export type NavigationSource = "local" | "remote";

export type HistoryAction = "back" | "forward" | "reload";

export type SyncMessage =
  | { type: "navigate"; navigationId: string; kind?: "page" | "embed" }
  | { type: "scroll"; x: number; y: number; timestamp: number; control?: boolean }
  | { type: "history"; action: HistoryAction; navigationId?: string; kind?: "page" | "embed" }
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
  | { type: "sync:state"; scroll: boolean; video: boolean; t: number }
  | { type: "cowatch:start"; at: number; t: number }
  | { type: "cowatch:pause"; at: number; t: number }
  | { type: "cowatch:seek"; at: number; t: number }
  | { type: "cowatch:stop" }
  | {
      type: "embed:event";
      vendor: "vidsrc";
      etype:
        | "PLAYER_TITLE"
        | "TV_INFO"
        | "TV_STATE"
        | "PLAYER_UI"
        | "MEDIA_NOT_FOUND"
        | "VS_EXPIRED"
        | "VS_DEVTOOLS"
        | "PLAYER_EVENT";
      navigationId?: string;
      title?: string;
      season?: number;
      episode?: number;
      visible?: boolean;
      // PLAYER_EVENT playback snapshot (display + mirror source only).
      pstatus?: "playing" | "paused" | "completed" | "seeked";
      progress?: number;
      duration?: number;
      imdb?: string;
      tmdb?: string;
      mediaType?: "movie" | "tv";
    }
  | {
      // Drive the vendor player (vidsrc Player Controls). Fire-and-forget:
      // read back the result via PLAYER_EVENT. Only mirrored between panes
      // showing the SAME navigationId; never carries a URL.
      type: "embed:cmd";
      vendor: "vidsrc";
      action: string;
      value?: number;
    }
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
  "sync:state",
  "cowatch:start",
  "cowatch:pause",
  "cowatch:seek",
  "cowatch:stop",
  "embed:event",
  "embed:cmd",
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
      if (typeof record.navigationId !== "string" || !/^[a-f0-9]{24,64}$/.test(record.navigationId)) {
        return false;
      }
      return (
        record.kind === undefined || record.kind === "page" || record.kind === "embed"
      );
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
    case "sync:state":
      return (
        typeof record.scroll === "boolean" &&
        typeof record.video === "boolean" &&
        typeof record.t === "number" &&
        Number.isFinite(record.t)
      );
    case "cowatch:start":
    case "cowatch:pause":
    case "cowatch:seek":
      return (
        typeof record.at === "number" &&
        Number.isFinite(record.at) &&
        record.at >= 0 &&
        record.at <= 24 * 3600 &&
        typeof record.t === "number" &&
        Number.isFinite(record.t)
      );
    case "cowatch:stop":
      return true;
    case "embed:event": {
      // Vendor player events relayed up from the embed wrapper. These are
      // informational only (title/episode/display/UI visibility) — never
      // playback control, which the cross-origin boundary forbids. Strictly
      // allowlisted so a hostile player frame cannot smuggle arbitrary data.
      if (record.vendor !== "vidsrc") return false;
      const etype = record.etype;
      if (
        etype !== "PLAYER_TITLE" &&
        etype !== "TV_INFO" &&
        etype !== "TV_STATE" &&
        etype !== "PLAYER_UI" &&
        etype !== "MEDIA_NOT_FOUND" &&
        etype !== "VS_EXPIRED" &&
        etype !== "VS_DEVTOOLS" &&
        etype !== "PLAYER_EVENT"
      ) {
        return false;
      }
      if (
        record.navigationId !== undefined &&
        (typeof record.navigationId !== "string" ||
          !/^[a-f0-9]{24,64}$/.test(record.navigationId))
      ) {
        return false;
      }
      if (record.title !== undefined && typeof record.title !== "string") return false;
      if (
        record.season !== undefined &&
        (typeof record.season !== "number" || !Number.isFinite(record.season))
      ) {
        return false;
      }
      if (
        record.episode !== undefined &&
        (typeof record.episode !== "number" || !Number.isFinite(record.episode))
      ) {
        return false;
      }
      if (record.visible !== undefined && typeof record.visible !== "boolean") {
        return false;
      }
      if (record.etype === "PLAYER_EVENT") {
        // Playback snapshot allowlist: status + numeric progress/duration +
        // content identifiers. Used as a mirror source and display only.
        if (
          record.pstatus !== undefined &&
          record.pstatus !== "playing" &&
          record.pstatus !== "paused" &&
          record.pstatus !== "completed" &&
          record.pstatus !== "seeked"
        ) {
          return false;
        }
        for (const key of ["progress", "duration"] as const) {
          const value = record[key];
          if (
            value !== undefined &&
            (typeof value !== "number" || !Number.isFinite(value) || value < 0)
          ) {
            return false;
          }
        }
        for (const key of ["imdb", "tmdb", "mediaType"] as const) {
          if (record[key] !== undefined && typeof record[key] !== "string") {
            return false;
          }
        }
        if (
          record.mediaType !== undefined &&
          record.mediaType !== "movie" &&
          record.mediaType !== "tv"
        ) {
          return false;
        }
      }
      return true;
    }
    case "embed:cmd": {
      // Outbound player commands. Strictly allowlisted to the vendor's
      // documented control vocabulary; seek/rate values finite-bounded.
      if (record.vendor !== "vidsrc") return false;
      if (typeof record.action !== "string") return false;
      const ok =
        record.action === "play" ||
        record.action === "pause" ||
        record.action === "mute" ||
        record.action === "unmute" ||
        record.action === "rate+" ||
        record.action === "rate-" ||
        /^seek[+-]?\d+(\.\d+)?$/.test(record.action) ||
        /^rate\d+(\.\d+)?$/.test(record.action);
      if (!ok) return false;
      if (
        record.value !== undefined &&
        (typeof record.value !== "number" ||
          !Number.isFinite(record.value) ||
          record.value < 0.25 ||
          record.value > 4)
      ) {
        return false;
      }
      return true;
    }
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
