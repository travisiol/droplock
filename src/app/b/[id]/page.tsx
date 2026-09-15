import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoxView } from "@/components/BoxView";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Box #${id} — ${site.name}`, description: "A box, sealed on the chain. Open it with the link." };
}

export default async function BoxPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) notFound();
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 md:py-14">
        <BoxView id={BigInt(id)} />
      </main>
      <Footer />
    </>
  );
}
