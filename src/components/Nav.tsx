"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "./ConnectButton";
import { Wordmark } from "./Mark";

const LINKS = [
  { href: "/drop", label: "Drop" },
  { href: "/mine", label: "My boxes" },
  { href: "/#how", label: "How it works" },
  { href: "/deploy", label: "Deploy" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="glass-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href !== "/#how" && pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`btn btn-ghost btn-sm ${active ? "!text-ink !bg-white/60" : ""}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ConnectButton size="sm" />
          <button type="button" className="btn btn-ghost btn-sm md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t border-white/70 px-5 py-3 md:hidden" aria-label="Main (mobile)">
          <div className="flex flex-col">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2.5 font-semibold">
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
