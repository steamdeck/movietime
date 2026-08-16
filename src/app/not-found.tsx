import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--bg)] text-[var(--fg)]">
      <div className="text-center">
        <p className="font-serif text-3xl">Room not found</p>
        <Link href="/" className="mt-4 inline-block text-sm text-[var(--gold)] underline">
          Back to start
        </Link>
      </div>
    </div>
  );
}
