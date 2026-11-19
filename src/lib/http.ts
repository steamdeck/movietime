export function corsHeaders(origin: string | null): HeadersInit {
  // Same-origin by default. Extra origins must be opted in explicitly via
  // ALLOWED_VIEW_ORIGINS (comma-separated, exact match). Never reflect an
  // arbitrary Origin: this endpoint mints navigations (server-side fetch),
  // so a reflected origin would let any site drive it with the victim's
  // cookies / ambient authority.
  const allowed = (process.env.ALLOWED_VIEW_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = origin && (origin === "null" || allowed.includes(origin)) ? origin : null;
  return {
    ...(allow ? { "Access-Control-Allow-Origin": allow } : {}),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
  };
}

export function jsonNoStore(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}
