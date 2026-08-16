import { randomBytes } from "crypto";

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function isRoomId(value: string): boolean {
  return /^[a-f0-9]{32}$/.test(value);
}

export function isOpaqueId(value: string): boolean {
  return /^[a-f0-9]{24,64}$/.test(value);
}
