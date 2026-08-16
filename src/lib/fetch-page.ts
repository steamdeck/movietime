import { assertSafeUrl } from "./ssrf";

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_ASSET_BYTES = 12_000_000;

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
  const url = await assertSafeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: init?.accept || "*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const finalUrl = response.url || url.href;
    await assertSafeUrl(finalUrl);

    const chunks: Buffer[] = [];
    let total = 0;
    const limit = init?.maxBytes ?? MAX_ASSET_BYTES;
    const reader = response.body?.getReader();
    if (!reader) {
      const fallback = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        body: fallback,
        finalUrl,
      };
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        reader.cancel();
        throw new Error("Resource too large");
      }
      chunks.push(Buffer.from(value));
    }

    return {
      status: response.status,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      body: Buffer.concat(chunks),
      finalUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtml(rawUrl: string): Promise<FetchedResource> {
  return fetchResource(rawUrl, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    maxBytes: MAX_HTML_BYTES,
  });
}
