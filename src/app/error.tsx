"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl items-center px-5 py-16 sm:px-8">
      <div className="glass mx-auto max-w-lg p-8 text-center">
        <p className="eyebrow">Error</p>
        <h1 className="display-md mt-3 text-[28px]">Something cracked.</h1>
        <p className="muted mono mt-2 text-[13px]">{error.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-glass">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
