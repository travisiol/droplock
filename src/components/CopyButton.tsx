"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard blocked: the text is selectable next to the button */
    }
  }
  return (
    <button type="button" className={`btn btn-glass btn-sm shrink-0 ${className}`} onClick={copy} aria-live="polite">
      {done ? "Copied" : label}
    </button>
  );
}
