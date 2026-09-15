import { site } from "@/lib/site";

/**
 * The mark: a glass cube seen slightly from above, one token inside. Drawn
 * in currentColor so it sits in the nav as ink and in the footer as a
 * ghost; app/icon.svg is the same drawing with the glacier gradient.
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path d="M16 3 28 9.5v13L16 29 4 22.5v-13L16 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" fillOpacity="0.08" />
      <path d="M4 9.5 16 16l12-6.5M16 16v13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeOpacity="0.55" />
      <path d="M16 3v13" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.25" />
      <circle cx="16" cy="19.5" r="3.1" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display inline-flex items-center gap-2 text-[17px] tracking-[-0.02em] ${className}`}>
      <Mark size={24} />
      <span>{site.wordmark}</span>
    </span>
  );
}
