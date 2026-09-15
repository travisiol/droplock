"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { ChainStatus } from "@/components/ChainStatus";
import { OpenLink } from "@/components/OpenLink";
import { site } from "@/lib/site";

const BoxesScene = dynamic(() => import("@/components/three/BoxesScene").then((m) => m.BoxesScene), { ssr: false });

export function Hero() {
  const [pasting, setPasting] = useState(false);
  return (
    <section className="relative overflow-clip" style={{ overflowClipMargin: "40px" }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Wide screens: the boxes take the right half of the hero. Phones: a band of boxes above the text. */}
        <BoxesScene className="pointer-events-none relative -mx-5 h-[280px] md:absolute md:inset-0 md:mx-0 md:h-auto" />
        <div className="relative grid items-center py-8 md:min-h-[calc(100svh-4rem)] md:py-16">
          <div className="max-w-[620px]">
            <p className="eyebrow">{site.tagline}</p>
            <h1 className="display mt-4 text-[44px] sm:text-[60px] md:text-[68px] lg:text-[76px]">{site.hook}</h1>
            <p className="muted mt-6 max-w-[520px] text-[17px] leading-relaxed">
              Lock ETH or any token in a glass box. Protect it with a code, a date or an on-chain condition. Share the link — whoever opens it, claims it. No address exchanged, no one in between.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/drop" className="btn btn-primary">
                Drop a box
              </Link>
              <button type="button" className="btn btn-glass" onClick={() => setPasting((p) => !p)} aria-expanded={pasting}>
                Open a link
              </button>
            </div>
            {pasting && <OpenLink autoFocus className="mt-4 max-w-[520px]" />}
            <div className="mt-8">
              <ChainStatus />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
