import type { Metadata } from "next";
import { DeployPanel } from "@/components/DeployPanel";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { chain } from "@/lib/chain";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Deploy — ${site.name}` };

export default function DeployPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 md:py-14">
        <div className="mb-8 max-w-[640px]">
          <p className="eyebrow">Deploy</p>
          <h1 className="display mt-3 text-[38px] sm:text-[48px]">Put it on the chain.</h1>
          <p className="muted mt-3 text-[16px]">
            {site.name} has no owner, so it has no deployer either: the addresses are known in advance and any wallet can create the contracts on {chain.name}. Whoever clicks first pays the gas; everyone uses the same contracts.
          </p>
        </div>
        <DeployPanel />
      </main>
      <Footer />
    </>
  );
}
