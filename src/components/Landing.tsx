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
    if (!/^[abcdefghjkmnpqrstuvwxyz]{4}[1-9]{2}$/.test(id)) {
      setError("Enter the 6-character room id from the invite.");
      return;
    }
    router.push(`/room/${id}`);
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[var(--bg)] text-[var(--fg)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-24 top-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(201,154,74,0.18),transparent_64%)] sm:h-[28rem] sm:w-[28rem]" />
        <div className="absolute bottom-[-10rem] right-[-6rem] h-[20rem] w-[20rem] rounded-full bg-[radial-gradient(circle,rgba(180,64,48,0.14),transparent_64%)] sm:h-[26rem] sm:w-[26rem]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-8">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">Movetime</p>
          <p className="text-sm text-[var(--muted)]">Two people · private URLs · shared pages</p>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-8 py-10 sm:gap-12 sm:py-16 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h1 className="font-serif text-[2.15rem] leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Watch a page together.
              <span className="block text-[var(--gold)]">Keep the address to yourself.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--muted)] sm:mt-6 sm:text-base">
              A private room for two. You each get a URL bar the other person cannot see.
              Opening a page shows them the result, not the path you typed.
            </p>
          </div>

          <div className="w-full max-w-sm border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
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
                placeholder="abcd12"
                maxLength={6}
                className="url-input"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                enterKeyHint="go"
                aria-label="Room id"
              />
              <button type="submit" className="open-btn px-5">
                Join
              </button>
            </form>
            {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
          </div>
        </section>

        <section className="grid gap-5 border-t border-[var(--line)] pt-6 text-sm text-[var(--muted)] sm:grid-cols-3 sm:gap-4 sm:pt-8">
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
