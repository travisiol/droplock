import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { MyBoxes } from "@/components/MyBoxes";
import { Nav } from "@/components/Nav";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `My boxes — ${site.name}` };

export default function MinePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 md:py-14">
        <div className="mb-8 max-w-[640px]">
          <p className="eyebrow">My boxes</p>
          <h1 className="display mt-3 text-[38px] sm:text-[48px]">What you dropped.</h1>
          <p className="muted mt-3 text-[16px]">Sealed, opened, expired — and the ones you can take back.</p>
        </div>
        <MyBoxes />
      </main>
      <Footer />
    </>
  );
}
