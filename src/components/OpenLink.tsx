"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { secretFromHash } from "@/lib/keys";

/** Parse a share link (or a bare box id) and go to the box, keeping its secret in the fragment. */
export function parseBoxLink(text: string): { id: string; secret: string | null } | null {
  const t = text.trim();
  if (/^\d+$/.test(t)) return { id: t, secret: null };
  const m = /\/b\/(\d+)(?:[?][^#]*)?(?:#(.*))?$/.exec(t);
  if (!m) return null;
  const secret = m[2] ? secretFromHash(m[2]) : null;
  return { id: m[1], secret };
}

export function OpenLink({ autoFocus = false, className = "" }: { autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseBoxLink(value);
    if (!parsed) {
      setError("That does not look like a box link (…/b/17#secret) or a box number.");
      return;
    }
    setError(null);
    router.push(`/b/${parsed.id}${parsed.secret ? `#${parsed.secret}` : ""}`);
  }

  return (
    <form onSubmit={submit} className={className}>
      <div className="flex gap-2">
        <input
          className="field field-mono"
          placeholder="Paste a box link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          aria-label="Box link"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary shrink-0">
          Open
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
    </form>
  );
}
