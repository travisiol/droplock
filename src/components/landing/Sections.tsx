import Link from "next/link";
import { chain } from "@/lib/chain";
import { KDF_ITERATIONS } from "@/lib/keys";
import { site } from "@/lib/site";

function Section({ id, eyebrow, title, lede, children }: { id: string; eyebrow: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 md:py-24">
      <div className="max-w-[640px]">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display-md mt-3 text-[32px] sm:text-[40px]">{title}</h2>
        {lede && <p className="muted mt-4 text-[16px] leading-relaxed">{lede}</p>}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Drop",
      body: "Pick the asset and the amount. Add a code, a date, a condition — or none of them. One transaction seals the box.",
    },
    {
      n: "02",
      title: "Share",
      body: "The link carries the box's secret after the #, generated in your browser and stored nowhere. If you set a code, say it in person, by voice — anywhere but the link.",
    },
    {
      n: "03",
      title: "Open",
      body: "The recipient opens the link, types the code if there is one, and picks any wallet to receive. Their browser signs, the box sends. Nobody needed their address before.",
    },
  ];
  return (
    <Section id="how" eyebrow="How it works" title="Three steps, one transaction each side." lede="A dead drop: you leave something in a place, you tell someone where. Here the place is a contract and the key is a link.">
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="glass p-6">
            <div className="mono text-[13px] text-glacier">{s.n}</div>
            <h3 className="display-md mt-3 text-[24px]">{s.title}</h3>
            <p className="muted mt-3 text-[15px] leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Locks() {
  const locks = [
    {
      title: "A code",
      icon: <CodeIcon />,
      body: `A passphrase the chain never sees. It is folded into the claim key with the link's secret through ${KDF_ITERATIONS.toLocaleString("en-US").replace(/,/g, " ")} rounds of PBKDF2 — guessing it offline needs the link and a lot of patience.`,
    },
    {
      title: "A date",
      icon: <DateIcon />,
      body: "Opens at a moment you choose — a birthday, a vesting date, Monday 9 am. Expires at another: after that nobody can claim it, and you take it back.",
    },
    {
      title: "A condition",
      icon: <RuleIcon />,
      body: "An on-chain rule checked at claim time. Built in: the recipient holds a token (or an NFT), or a cosigner you name has released it. Or plug in your own ICondition.",
    },
  ];
  return (
    <Section id="locks" eyebrow="Three locks" title="Code, date, condition. Any of them, all of them." lede="Every lock is optional and they combine: a birthday gift that opens on the day, needs a code, and only for the wallet holding the family NFT.">
      <div className="grid gap-4 md:grid-cols-3">
        {locks.map((l) => (
          <div key={l.title} className="glass p-6">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-glacier/10 text-glacier">{l.icon}</div>
            <h3 className="display-md mt-4 text-[24px]">{l.title}</h3>
            <p className="muted mt-3 text-[15px] leading-relaxed">{l.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function WhatTheChainSees() {
  return (
    <Section id="chain" eyebrow="What the chain sees" title="A box is a public record. The key to it is not." lede={`Every box is readable by anyone on ${chain.name}. What opens it never touches the chain until the moment it opens.`}>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="glass p-6">
          <div className="flex items-center justify-between">
            <span className="eyebrow">On-chain</span>
            <span className="mono text-[12px] faint">Droplock.getBox(id)</span>
          </div>
          <dl className="mono mt-4 text-[13.5px]">
            {[
              ["sender", "who dropped it"],
              ["token · amount", "what is inside — what actually arrived"],
              ["key", "an address: the claim key's, derived from link + code"],
              ["unlockAt · expiresAt", "the window"],
              ["condition · args", "the rule, if any, and what it needs"],
              ["status", "sealed · claimed · reclaimed"],
            ].map(([k, v]) => (
              <div key={k} className="row">
                <dt className="text-ink">{k}</dt>
                <dd className="muted text-right font-sans">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="glass p-6">
          <span className="eyebrow">Never on-chain</span>
          <ul className="mt-4 space-y-3 text-[15px]">
            {[
              ["The secret", "16 random bytes, born in your browser, living only after the # of the link."],
              ["The code", "Typed by two people, hashed by two browsers, never sent anywhere."],
              ["The recipient", "Chosen at the moment of claiming, by the one claiming. The signature names them; a copied transaction cannot."],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-3">
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-glacier" />
                <span>
                  <span className="font-semibold">{k}.</span> <span className="muted">{v}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="code-block mt-5">
            <span className="c">{"// contracts/conditions/ICondition.sol"}</span>
            {"\n"}
            <span className="k">interface</span> ICondition {"{"}
            {"\n"}
            {"  "}
            <span className="k">function</span> validate(<span className="k">bytes</span> args) <span className="k">view returns</span> (<span className="k">bool</span>);{"\n"}
            {"  "}
            <span className="k">function</span> check(<span className="k">uint256</span> boxId, <span className="k">address</span> recipient,{"\n"}
            {"                 "}
            <span className="k">bytes</span> args, <span className="k">bytes</span> proof) <span className="k">view returns</span> (<span className="k">bool</span>);{"\n"}
            {"}"}
          </div>
        </div>
      </div>
    </Section>
  );
}

export function Faq() {
  const items: Array<[string, React.ReactNode]> = [
    [
      "Is this custodial?",
      <>
        No. The contract has no owner, no admin function and no fee. It can only pay the address a valid claim signature names, or return a box to its sender after expiry. Its address is the same on every chain that has the CREATE2 proxy, and anyone can put it there from{" "}
        <Link href="/deploy" className="text-glacier underline underline-offset-2">
          /deploy
        </Link>
        .
      </>,
    ],
    [
      "What if the link leaks?",
      "A link is a bearer instrument: whoever has it can claim, exactly like cash in an envelope. For anything that matters, add a code (told separately) and an expiry. A leaked link with a code still needs the code.",
    ],
    [
      "Can I cancel a drop?",
      "Not before it expires — that is what lets a recipient trust a box. Set the expiry you can live with; 30 days is the default. After it, Reclaim returns the tokens to you. A box with no expiry that nobody opens stays sealed forever.",
    ],
    [
      "Can a bot front-run a claim?",
      "No. The claim signature names the recipient; a transaction copied from the mempool towards another address is refused. The transaction can even be sent by someone else on the recipient's behalf — a relayer paying gas.",
    ],
    ["What does it cost?", "Gas. The contract takes nothing, and there is no account to create."],
    [
      "I lost the link.",
      "The secret exists only in the link. Nobody — including this site — can regenerate it. The box waits until its expiry, then you reclaim it. No expiry means no way back; the form says so before you drop.",
    ],
    ["Which tokens?", "ETH and any ERC-20. Fee-on-transfer tokens work: the box records what actually arrived, and pays out exactly that."],
    [
      "Why this name?",
      `A working title. "Dropbox" belongs to Dropbox, Inc., so the project ships as ${site.name}; the name lives in one file and changes in a minute.`,
    ],
  ];
  return (
    <Section id="faq" eyebrow="Questions" title="The parts worth asking about.">
      <div className="grid gap-3 md:grid-cols-2">
        {items.map(([q, a]) => (
          <details key={q} className="glass group p-5">
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
              {q}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-glacier/10 text-glacier transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="muted mt-3 text-[15px] leading-relaxed">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function CodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="8" width="18" height="10" rx="3" />
      <path d="M7 13h.01M11 13h.01M15 13h.01M19 13h.01" />
    </svg>
  );
}
function DateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function RuleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M4 12h10M4 17h6" />
      <path d="m17 15 2 2 3-4" />
    </svg>
  );
}
