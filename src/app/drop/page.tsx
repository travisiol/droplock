import type { Metadata } from "next";
import { DropForm } from "@/components/DropForm";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Drop a box — ${site.name}` };

export default function DropPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 md:py-14">
        <div className="mb-8 max-w-[640px]">
          <p className="eyebrow">Drop</p>
          <h1 className="display mt-3 text-[38px] sm:text-[48px]">Seal a box.</h1>
          <p className="muted mt-3 text-[16px]">Choose what goes in and what it takes to open it. The link comes out the other side.</p>
        </div>
        <DropForm />
      </main>
      <Footer />
    </>
  );
}
