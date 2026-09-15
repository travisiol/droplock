import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { Faq, HowItWorks, Locks, WhatTheChainSees } from "@/components/landing/Sections";
import { Nav } from "@/components/Nav";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Locks />
        <WhatTheChainSees />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
