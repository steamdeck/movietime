import { randomBytes } from "crypto";

const ROOM_LETTERS = "abcdefghjkmnpqrstuvwxyz";
const ROOM_DIGITS = "123456789";

function pickChar(alphabet: string): string {
  const limit = 256 - (256 % alphabet.length);
  let byte = randomBytes(1)[0];
  while (byte >= limit) {
    byte = randomBytes(1)[0];
  }
  return alphabet[byte % alphabet.length];
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function randomRoomId(): string {
  let id = "";
  for (let i = 0; i < 4; i++) id += pickChar(ROOM_LETTERS);
  for (let i = 0; i < 2; i++) id += pickChar(ROOM_DIGITS);
  return id;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function isRoomId(value: string): boolean {
  return /^[abcdefghjkmnpqrstuvwxyz]{4}[1-9]{2}$/.test(value.toLowerCase());
}

export function isOpaqueId(value: string): boolean {
  return /^[a-f0-9]{24,64}$/.test(value);
}
