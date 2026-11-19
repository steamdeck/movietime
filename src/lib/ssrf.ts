import { lookup } from "dns/promises";
import { isIP } from "net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return (
    (n >= ipv4ToInt("10.0.0.0") && n <= ipv4ToInt("10.255.255.255")) ||
    (n >= ipv4ToInt("127.0.0.0") && n <= ipv4ToInt("127.255.255.255")) ||
    (n >= ipv4ToInt("169.254.0.0") && n <= ipv4ToInt("169.254.255.255")) ||
    (n >= ipv4ToInt("172.16.0.0") && n <= ipv4ToInt("172.31.255.255")) ||
    (n >= ipv4ToInt("192.168.0.0") && n <= ipv4ToInt("192.168.255.255")) ||
    (n >= ipv4ToInt("0.0.0.0") && n <= ipv4ToInt("0.255.255.255"))
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("[") && lower.endsWith("]")) {
    return isPrivateIPv6(lower.slice(1, -1));
  }
  // IPv4-mapped / translated forms (::ffff:127.0.0.1, ::ffff:0:127.0.0.1,
  // 64:ff9b::127.0.0.1, ...) — check any embedded IPv4 tail.
  const embeddedV4 = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embeddedV4 && isIP(embeddedV4[1]) === 4 && isPrivateIPv4(embeddedV4[1])) return true;
  const head = lower.split(":")[0] || "";
  return (
    head === "fe80" ||
    head === "fec0" ||
    head.startsWith("fc") ||
    head.startsWith("fd") ||
    // Documentation / benchmarking / reserved ranges that must never be
    // fetched through the server: discard, TEST-NET, 6to4 relay anycast, ...
    head === "2001" ||
    head === "2002" ||
    lower.startsWith("2001:db8") ||
    lower.startsWith("64:ff9b") ||
    lower.startsWith("100:") ||
    lower.startsWith("ff")
  );
}

const DEFAULT_PORTS = new Set(["", "80", "443"]);

/** Host spellings that dodge naive string checks (0x7f.0.0.1, 0177.0.0.1, ...). */
function normalizeIPv4Host(host: string): string | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!part) return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
    else if (/^[0-9]+$/.test(part)) n = parseInt(part, 10);
    else return null;
    if (!Number.isSafeInteger(n) || n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums.join(".");
}

export function parseHttpUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  return parsed;
}

function blockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  // Single-label / bare names (intranet, router UIs) are never fetchable.
  if (!host.includes(".") && !host.includes(":")) return true;
  return false;
}

export function assertSafeHost(hostname: string, port: string): void {
  if (blockedHost(hostname)) {
    throw new Error("That host cannot be loaded.");
  }
  if (!DEFAULT_PORTS.has(port)) {
    throw new Error("That address cannot be loaded.");
  }
  const direct = normalizeIPv4Host(hostname);
  if (isIP(hostname) === 4 || direct) {
    if (isPrivateIPv4(direct || hostname)) {
      throw new Error("That host cannot be loaded.");
    }
    return;
  }
  if (isIP(hostname) === 6) {
    if (isPrivateIPv6(hostname)) {
      throw new Error("That host cannot be loaded.");
    }
  }
}

async function resolveHost(hostname: string): Promise<string[]> {
  const clean = hostname.replace(/^\[|\]$/g, "");
  if (isIP(clean)) return [clean];
  const direct = normalizeIPv4Host(clean);
  if (direct) return [direct];
  // dns/promises may be unavailable in some runtimes (e.g. Cloudflare
  // Workers): fail closed instead of skipping the check.
  let records: string[];
  try {
    records = await lookup(clean, { all: true }).then((all) => all.map((r) => r.address));
  } catch {
    throw new Error("That host cannot be loaded.");
  }
  if (!records.length) throw new Error("That host cannot be loaded.");
  return records;
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  const parsed = parseHttpUrl(raw);
  if (!parsed) {
    throw new Error("Only http and https URLs are allowed.");
  }
  assertSafeHost(parsed.hostname, parsed.port);
  for (const address of await resolveHost(parsed.hostname)) {
    const version = isIP(address);
    if (version === 4 && isPrivateIPv4(address)) {
      throw new Error("That host cannot be loaded.");
    }
    if (version === 6 && isPrivateIPv6(address)) {
      throw new Error("That host cannot be loaded.");
    }
  }
  return parsed;
}
