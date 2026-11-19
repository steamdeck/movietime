import { assertSafeHost, assertSafeUrl } from "./ssrf";

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_ASSET_BYTES = 12_000_000;
const MAX_REDIRECTS = 5;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type FetchedResource = {
  status: number;
  contentType: string;
  body: Buffer;
  finalUrl: string;
};

export async function fetchResource(
  rawUrl: string,
  init?: { accept?: string; maxBytes?: number }
): Promise<FetchedResource> {
  const limit = init?.maxBytes ?? MAX_ASSET_BYTES;
  let current = (await assertSafeUrl(rawUrl)).href;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        // Manual redirects: validate every hop (DNS TOCTOU + internal
        // redirect targets) instead of letting undici follow blindly.
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: init?.accept || "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new Error("Redirect without location");
        if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new Error("Invalid redirect");
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          throw new Error("That address cannot be loaded.");
        }
        if (next.username || next.password) {
          throw new Error("That address cannot be loaded.");
        }
        assertSafeHost(next.hostname, next.port);
        current = next.href;
        continue;
      }

      const finalUrl = current;
      const body = await readBoundedBody(response, limit);
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        body,
        finalUrl,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}

async function readBoundedBody(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    // No streaming body (e.g. mocked Response): still enforce the cap by
    // reading in slices instead of one unbounded arrayBuffer().
    const chunks: Buffer[] = [];
    let total = 0;
    const buf = Buffer.from(await response.arrayBuffer());
    for (let offset = 0; offset < buf.length; offset += 64 * 1024) {
      const slice = buf.subarray(offset, offset + 64 * 1024);
      total += slice.length;
      if (total > limit) throw new Error("Resource too large");
      chunks.push(Buffer.from(slice));
    }
    return Buffer.concat(chunks);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Resource too large");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function fetchHtml(rawUrl: string): Promise<FetchedResource> {
  return fetchResource(rawUrl, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    maxBytes: MAX_HTML_BYTES,
  });
}
