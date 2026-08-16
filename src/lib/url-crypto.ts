import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret =
    process.env.NAV_ENCRYPTION_KEY ||
    process.env.NAV_SECRET ||
    getMemorySecret();
  return scryptSync(secret, "movietime-nav", 32);
}

function getMemorySecret(): string {
  const g = globalThis as typeof globalThis & { __mtNavSecret?: string };
  if (!g.__mtNavSecret) {
    g.__mtNavSecret = randomBytes(32).toString("hex");
  }
  return g.__mtNavSecret;
}

export function sealUrl(url: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openUrl(token: string): string {
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw new Error("Invalid token");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
