import Link from "next/link";
import { chain, explorer } from "@/lib/chain";
import { CONTRACTS } from "@/lib/deploy";
import { short } from "@/lib/format";
import { site } from "@/lib/site";
import { Mark } from "./Mark";

export function Footer() {
  const addr = explorer.address(CONTRACTS.droplock);
  return (
    <footer className="mt-24 border-t border-white/70 bg-white/25">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="display inline-flex items-center gap-2 text-[17px]">
            <Mark size={24} />
            {site.wordmark}
          </div>
          <p className="muted mt-3 max-w-sm text-[14px]">{site.tagline} No owner, no fee, no account. The contract holds what you drop until a signature — or the expiry — lets it go.</p>
          <p className="faint mt-4 text-[12.5px]">
            Not a custodian. Nothing here is financial advice. The name is a working title (see README). Not affiliated with Dropbox, Inc.
          </p>
        </div>
        <div className="text-[14px]">
          <div className="eyebrow mb-3">Site</div>
          <ul className="space-y-2">
            <li>
              <Link href="/drop" className="hover:text-glacier">
                Drop a box
              </Link>
            </li>
            <li>
              <Link href="/mine" className="hover:text-glacier">
                My boxes
              </Link>
            </li>
            <li>
              <Link href="/#faq" className="hover:text-glacier">
                Questions
              </Link>
            </li>
            <li>
              <Link href="/deploy" className="hover:text-glacier">
                Deploy the contracts
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-[14px]">
          <div className="eyebrow mb-3">Chain</div>
          <ul className="space-y-2">
            <li className="muted">
              {chain.name} · id {chain.id}
            </li>
            <li>
              {addr ? (
                <a href={addr} target="_blank" rel="noreferrer" className="mono hover:text-glacier">
                  Droplock {short(CONTRACTS.droplock)}
                </a>
              ) : (
                <span className="mono muted">Droplock {short(CONTRACTS.droplock)}</span>
              )}
            </li>
            {site.github && (
              <li>
                <a href={site.github} target="_blank" rel="noreferrer" className="hover:text-glacier">
                  Source
                </a>
              </li>
            )}
            {site.x && (
              <li>
                <a href={site.x} target="_blank" rel="noreferrer" className="hover:text-glacier">
                  X
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </footer>
  );
}
