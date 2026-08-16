import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--bg)] px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-[var(--fg)]">
      <div className="text-center">
        <p className="font-serif text-3xl">Room not found</p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center text-sm text-[var(--gold)] underline"
        >
          Back to start
        </Link>
      </div>
    </div>
  );
}
