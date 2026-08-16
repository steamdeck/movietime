"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/hooks/useRoomJoin";

export function Landing() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      router.push(`/room/${room.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a room.");
      setBusy(false);
    }
  }

  function onJoin(event: FormEvent) {
    event.preventDefault();
    const id = joinId.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(id)) {
      setError("Enter the full room id from the invite link.");
      return;
    }
    router.push(`/room/${id}`);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-24 top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(201,154,74,0.18),transparent_64%)]" />
        <div className="absolute bottom-[-10rem] right-[-6rem] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(180,64,48,0.14),transparent_64%)]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">Movetime</p>
          <p className="text-sm text-[var(--muted)]">Two people · private URLs · shared pages</p>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-12 py-16 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h1 className="font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
              Watch a page together.
              <span className="block text-[var(--gold)]">Keep the address to yourself.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--muted)]">
              A private room for two. You each get a URL bar the other person cannot see.
              Opening a page shows them the result, not the path you typed.
            </p>
          </div>

          <div className="w-full max-w-sm border border-[var(--line)] bg-[var(--panel)] p-5">
            <button type="button" onClick={onCreate} disabled={busy} className="open-btn w-full py-3">
              {busy ? "Creating room…" : "Create a private room"}
            </button>
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--line)]" />
              or join
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <form onSubmit={onJoin} className="flex gap-2">
              <input
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Room id"
                className="url-input"
                spellCheck={false}
              />
              <button type="submit" className="bar-btn">
                Join
              </button>
            </form>
            {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
          </div>
        </section>

        <section className="grid gap-4 border-t border-[var(--line)] pt-8 text-sm text-[var(--muted)] sm:grid-cols-3">
          <p>
            <strong className="block font-normal text-[var(--fg)]">No URL leakage</strong>
            Sync messages carry opaque ids only. The other browser never receives your address.
          </p>
          <p>
            <strong className="block font-normal text-[var(--fg)]">Server fetch, then fallback</strong>
            This app may fetch a page on the server to render it. Sites that refuse still use
            explicit screen sharing.
          </p>
          <p>
            <strong className="block font-normal text-[var(--fg)]">Consent only</strong>
            Two people must join. Screen sharing and remote control require an explicit yes, and
            can be revoked.
          </p>
        </section>
      </div>
    </main>
  );
}
