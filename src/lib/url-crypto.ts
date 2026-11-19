import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
// Asset tokens should be short-lived: an absolute URL is bearer access to
// fetch through the server, so 12h bounds the window of a leaked token / page.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret =
    process.env.NAV_ENCRYPTION_KEY ||
    process.env.NAV_SECRET ||
    getMemorySecret();
  cachedKey = scryptSync(secret, "movietime-nav", 32);
  return cachedKey;
}

function getMemorySecret(): string {
  const g = globalThis as typeof globalThis & { __mtNavSecret?: string };
  if (!g.__mtNavSecret) {
    g.__mtNavSecret = randomBytes(32).toString("hex");
  }
  return g.__mtNavSecret;
}

export function sealUrl(url: string): string {
  return sealUrlWithExpiry(url, Date.now() + TOKEN_TTL_MS);
}

export function sealUrlWithExpiry(url: string, expiresAt: number): string {
  const payload = JSON.stringify({ u: url, exp: expiresAt });
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // version byte 1 | iv | tag | ciphertext
  return Buffer.concat([Buffer.from([1]), iv, tag, encrypted]).toString("base64url");
}

export function openUrl(token: string): string {
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 30) throw new Error("Invalid token");
  const version = buf[0];
  if (version !== 1) throw new Error("Invalid token");
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const encrypted = buf.subarray(29);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const payload = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  let parsed: { u?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Invalid token");
  }
  if (typeof parsed.u !== "string" || typeof parsed.exp !== "number") {
    throw new Error("Invalid token");
  }
  if (!Number.isFinite(parsed.exp) || parsed.exp < Date.now()) {
    throw new Error("Token expired");
  }
  return parsed.u;
}
