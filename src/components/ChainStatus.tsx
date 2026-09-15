"use client";

import Link from "next/link";
import { chain, explorer } from "@/lib/chain";
import { CONTRACTS } from "@/lib/deploy";
import { short } from "@/lib/format";
import { useDeployed } from "@/lib/hooks";

/** One honest line: is the contract on this chain or not. */
export function ChainStatus({ className = "" }: { className?: string }) {
  const d = useDeployed();
  const addr = explorer.address(CONTRACTS.droplock);
  if (d.loading) return <span className={`chip ${className}`}>Checking {chain.name}…</span>;
  if (d.droplock) {
    return (
      <span className={`chip chip-ok ${className}`}>
        <span className="dot" />
        Live on {chain.name}
        {addr ? (
          <a href={addr} target="_blank" rel="noreferrer" className="mono font-medium underline-offset-2 hover:underline">
            {short(CONTRACTS.droplock)}
          </a>
        ) : (
          <span className="mono font-medium">{short(CONTRACTS.droplock)}</span>
        )}
      </span>
    );
  }
  return (
    <span className={`chip chip-warn ${className}`}>
      <span className="dot" />
      Not on {chain.name} yet ·{" "}
      <Link href="/deploy" className="underline underline-offset-2">
        deploy it
      </Link>
    </span>
  );
}
