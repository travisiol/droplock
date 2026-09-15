import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8">
        <div className="glass mx-auto max-w-lg p-8 text-center">
          <p className="eyebrow">404</p>
          <h1 className="display-md mt-3 text-[28px]">Nothing dropped here.</h1>
          <p className="muted mt-2">A box link looks like /b/17#… — check the number, then the rest.</p>
          <Link href="/" className="btn btn-primary mt-6">
            Home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
