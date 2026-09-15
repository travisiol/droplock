"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { isAddress, parseEventLogs, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { english } from "viem/accounts";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { droplockAbi } from "@/lib/abi/droplockAbi";
import { encodeCosign, encodeHolds } from "@/lib/boxes";
import { chain, explorer } from "@/lib/chain";
import { CONTRACTS } from "@/lib/deploy";
import { erc20Abi } from "@/lib/erc20";
import { amount as fmtAmount, errorMessage, fromLocalInput, short, toLocalInput, when } from "@/lib/format";
import { ETH_META, useBalance, useDeployed, useNow, useTokenMeta, type TokenMeta } from "@/lib/hooks";
import { claimKeyAddress, newSecret, suggestCode } from "@/lib/keys";
import { ConnectButton } from "./ConnectButton";
import { CopyButton } from "./CopyButton";

const BoxScene = dynamic(() => import("@/components/three/BoxScene").then((m) => m.BoxScene), { ssr: false });

type Expiry = "7d" | "30d" | "90d" | "never" | "custom";
const EXPIRY_DAYS: Record<Exclude<Expiry, "never" | "custom">, number> = { "7d": 7, "30d": 30, "90d": 90 };

type Result = { id: bigint; secret: string; code: string; txHash: Hex; amountText: string; symbol: string };

export function DropForm() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const deployed = useDeployed();
  const { writeContractAsync } = useWriteContract();

  const [assetMode, setAssetMode] = useState<"eth" | "token">("eth");
  const [tokenAddress, setTokenAddress] = useState("");
  const [amountText, setAmountText] = useState("");

  const [codeOn, setCodeOn] = useState(false);
  const [code, setCode] = useState("");
  const [dateOn, setDateOn] = useState(false);
  const [unlockText, setUnlockText] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 86400));
  const [expiry, setExpiry] = useState<Expiry>("30d");
  const [expiresText, setExpiresText] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 30 * 86400));
  const [condOn, setCondOn] = useState(false);
  const [condKind, setCondKind] = useState<"holds" | "cosign">("holds");
  const [holdsToken, setHoldsToken] = useState("");
  const [holdsMin, setHoldsMin] = useState("1");
  const [cosigner, setCosigner] = useState("");

  const [phase, setPhase] = useState<"form" | "deriving" | "approving" | "dropping">("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const token = useTokenMeta(assetMode === "eth" ? zeroAddress : tokenAddress);
  const meta: TokenMeta | null = assetMode === "eth" ? ETH_META : token.meta;
  const balance = useBalance(meta, address);
  const holdsMeta = useTokenMeta(condOn && condKind === "holds" ? holdsToken : undefined);

  // ───────── derived values ─────────
  const amountWei = useMemo(() => {
    if (!meta || !amountText.trim()) return null;
    try {
      const v = parseUnits(amountText.trim(), meta.decimals);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amountText, meta]);

  const now = useNow(15_000);
  const unlockAt = dateOn ? fromLocalInput(unlockText) : 0;
  const expiresAt = expiry === "never" ? 0 : expiry === "custom" ? fromLocalInput(expiresText) : (dateOn && unlockAt > now ? unlockAt : now) + EXPIRY_DAYS[expiry] * 86400;

  const holdsMinWei = useMemo(() => {
    if (!holdsMeta.meta) return null;
    try {
      const v = parseUnits(holdsMin.trim() || "0", holdsMeta.meta.decimals);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [holdsMin, holdsMeta.meta]);

  const problems: string[] = [];
  if (assetMode === "token" && !isAddress(tokenAddress)) problems.push("Enter the token's contract address.");
  if (assetMode === "token" && token.invalid) problems.push("That address does not answer like an ERC-20.");
  if (assetMode === "token" && token.meta && !token.meta.hasDecimals) problems.push("That token has no decimals — an NFT cannot go in a box, but it can be a condition.");
  if (meta && !amountWei) problems.push("Enter an amount.");
  if (meta && amountWei && balance.data !== undefined && amountWei > balance.data) problems.push(`That is more ${meta.symbol} than this wallet holds.`);
  if (codeOn && !code.trim()) problems.push("Type a code, or turn the code off.");
  if (expiresAt !== 0 && expiresAt <= now) problems.push("The expiry is in the past.");
  if (expiresAt !== 0 && expiresAt <= unlockAt) problems.push("The expiry must come after the unlock date.");
  if (condOn && condKind === "holds" && !isAddress(holdsToken)) problems.push("Enter the token the recipient must hold.");
  if (condOn && condKind === "holds" && holdsMeta.invalid) problems.push("That address does not answer like a token.");
  if (condOn && condKind === "holds" && holdsMeta.meta && !holdsMinWei) problems.push("The minimum balance must be more than zero.");
  if (condOn && condKind === "cosign" && !isAddress(cosigner)) problems.push("Enter the cosigner's address.");
  if (condOn && condKind === "holds" && !deployed.holdsToken && !deployed.loading) problems.push("The HoldsToken condition is not deployed on this chain yet.");
  if (condOn && condKind === "cosign" && !deployed.cosign && !deployed.loading) problems.push("The Cosign condition is not deployed on this chain yet.");
  const ready = problems.length === 0 && Boolean(meta && amountWei) && deployed.droplock && isConnected;

  // ───────── the transaction ─────────
  async function submit() {
    if (!client || !address || !meta || !amountWei || !ready) return;
    setError(null);
    try {
      setPhase("deriving");
      const secret = newSecret();
      const theCode = codeOn ? code : "";
      const key = await claimKeyAddress(secret, theCode);

      let condition: Address = zeroAddress;
      let args: Hex = "0x";
      if (condOn && condKind === "holds" && holdsMinWei) {
        condition = CONTRACTS.holdsToken;
        args = encodeHolds(holdsToken as Address, holdsMinWei);
      } else if (condOn && condKind === "cosign") {
        condition = CONTRACTS.cosign;
        args = encodeCosign(cosigner as Address);
      }

      if (!meta.isEth) {
        const allowance = await client.readContract({ address: meta.address, abi: erc20Abi, functionName: "allowance", args: [address, CONTRACTS.droplock] });
        if (allowance < amountWei) {
          setPhase("approving");
          const hash = await writeContractAsync({ address: meta.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.droplock, amountWei] });
          await client.waitForTransactionReceipt({ hash });
        }
      }

      setPhase("dropping");
      const hash = await writeContractAsync({
        address: CONTRACTS.droplock,
        abi: droplockAbi,
        functionName: "drop",
        args: [meta.isEth ? zeroAddress : meta.address, amountWei, key, BigInt(unlockAt), BigInt(expiresAt), condition, args],
        value: meta.isEth ? amountWei : 0n,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      const [dropped] = parseEventLogs({ abi: droplockAbi, logs: receipt.logs, eventName: "Dropped" });
      if (!dropped) throw new Error("No Dropped event in the receipt.");
      setResult({ id: dropped.args.id, secret, code: theCode, txHash: hash, amountText: fmtAmount(dropped.args.amount, meta.decimals), symbol: meta.symbol });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPhase("form");
    }
  }

  if (result) return <Sealed result={result} onAgain={() => setResult(null)} />;

  const previewKind = meta?.isEth ? "crystal" : "coin";
  const busy = phase !== "form";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="glass p-6 sm:p-8">
        {/* Asset */}
        <Block title="What goes in" hint="ETH or any ERC-20 on this chain.">
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg" role="group" aria-label="Asset">
              <button type="button" className="seg-item" aria-pressed={assetMode === "eth"} onClick={() => setAssetMode("eth")}>
                ETH
              </button>
              <button type="button" className="seg-item" aria-pressed={assetMode === "token"} onClick={() => setAssetMode("token")}>
                Token
              </button>
            </div>
            {meta && balance.data !== undefined && (
              <span className="faint text-[13px]">
                Balance {fmtAmount(balance.data, meta.decimals)} {meta.symbol}
                {balance.data > 0n && (
                  <button type="button" className="ml-2 text-glacier underline-offset-2 hover:underline" onClick={() => setAmountText(fmtAmount(balance.data!, meta.decimals, 18))}>
                    max
                  </button>
                )}
              </span>
            )}
          </div>
          {assetMode === "token" && (
            <div className="mt-3">
              <input className="field field-mono" placeholder="0x… token contract" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value.trim())} spellCheck={false} aria-label="Token address" />
              {token.meta && (
                <p className="mt-2 text-[13px] muted">
                  {token.meta.name} · {token.meta.symbol} · {token.meta.decimals} decimals
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              className="field mono text-[20px]"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
              aria-label="Amount"
            />
            <span className="mono shrink-0 text-[15px] font-medium muted">{meta?.symbol ?? "—"}</span>
          </div>
        </Block>

        {/* Locks */}
        <Block title="Locks" hint="All optional, all combinable.">
          <div className="grid gap-3">
            <LockCard on={codeOn} onToggle={setCodeOn} title="Code" description="A passphrase you tell the recipient some other way. The chain never sees it.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="field field-mono" placeholder="four words, a phrase, anything" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code" autoComplete="off" />
                <button type="button" className="btn btn-glass btn-sm shrink-0" onClick={() => setCode(suggestCode(english))}>
                  Suggest four words
                </button>
              </div>
              <p className="faint mt-2 text-[12.5px]">Case does not matter; spacing does not matter. Anything under four words is guessable given the link.</p>
            </LockCard>

            <LockCard on={dateOn} onToggle={setDateOn} title="Date" description="Nothing opens before this moment.">
              <label className="block text-[13px] muted">
                Opens at
                <input type="datetime-local" className="field mt-1" value={unlockText} min={toLocalInput(now)} onChange={(e) => setUnlockText(e.target.value)} />
              </label>
              {dateOn && unlockAt <= now && <p className="mt-2 text-[12.5px] text-warn">That is in the past — the box would open immediately.</p>}
            </LockCard>

            <LockCard on={condOn} onToggle={setCondOn} title="Condition" description="An on-chain rule, checked when someone claims.">
              <div className="seg mb-3" role="group" aria-label="Condition">
                <button type="button" className="seg-item" aria-pressed={condKind === "holds"} onClick={() => setCondKind("holds")}>
                  Holds a token
                </button>
                <button type="button" className="seg-item" aria-pressed={condKind === "cosign"} onClick={() => setCondKind("cosign")}>
                  Cosigner releases
                </button>
              </div>
              {condKind === "holds" ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                  <input className="field field-mono" placeholder="0x… token or NFT contract" value={holdsToken} onChange={(e) => setHoldsToken(e.target.value.trim())} spellCheck={false} aria-label="Token to hold" />
                  <input className="field mono" inputMode="decimal" placeholder="min" value={holdsMin} onChange={(e) => setHoldsMin(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Minimum balance" />
                  <p className="faint text-[12.5px] sm:col-span-2">
                    {holdsMeta.meta
                      ? `The recipient must hold at least ${holdsMin || "0"} ${holdsMeta.meta.symbol}${holdsMeta.meta.hasDecimals ? "" : " (an NFT: whole units)"}.`
                      : "The recipient's wallet must hold at least this much of it. For an NFT, 1 means one of them."}
                  </p>
                </div>
              ) : (
                <div>
                  <input className="field field-mono" placeholder="0x… the cosigner's wallet" value={cosigner} onChange={(e) => setCosigner(e.target.value.trim())} spellCheck={false} aria-label="Cosigner" />
                  <p className="faint mt-2 text-[12.5px]">This wallet must press Release on the box page before anyone can claim. It can only say yes — it never holds the tokens.</p>
                </div>
              )}
            </LockCard>
          </div>
        </Block>

        {/* Expiry */}
        <Block title="Expiry" hint="After it, nobody can claim and you can reclaim.">
          <div className="seg flex-wrap" role="group" aria-label="Expiry">
            {(["7d", "30d", "90d", "custom", "never"] as Expiry[]).map((e) => (
              <button key={e} type="button" className="seg-item" aria-pressed={expiry === e} onClick={() => setExpiry(e)}>
                {e === "custom" ? "Pick a date" : e === "never" ? "Never" : `${EXPIRY_DAYS[e]} days`}
              </button>
            ))}
          </div>
          {expiry === "custom" && <input type="datetime-local" className="field mt-3" value={expiresText} min={toLocalInput(now)} onChange={(e) => setExpiresText(e.target.value)} aria-label="Expires at" />}
          {expiry === "never" ? (
            <p className="mt-3 text-[13px] text-warn">No way back: if the link is lost or nobody opens the box, the tokens stay sealed forever.</p>
          ) : (
            <p className="faint mt-3 text-[13px]">Expires {when(expiresAt)} — if nobody has opened it by then, you take it back.</p>
          )}
        </Block>

        {/* Submit */}
        <div className="mt-8 border-t border-rule pt-6">
          {!deployed.loading && !deployed.droplock && (
            <p className="mb-4 text-[14px] text-warn">
              Droplock is not on {chain.name} yet.{" "}
              <Link href="/deploy" className="underline underline-offset-2">
                Deploy it
              </Link>{" "}
              first — anyone can.
            </p>
          )}
          {problems.length > 0 && isConnected && (
            <ul className="mb-4 space-y-1 text-[13.5px] text-bad">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {error && <p className="mb-4 text-[14px] text-bad">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {isConnected ? (
              <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={submit}>
                {phase === "deriving" ? "Deriving the key…" : phase === "approving" ? "Approve in your wallet…" : phase === "dropping" ? "Sealing the box…" : "Seal the box"}
              </button>
            ) : (
              <ConnectButton />
            )}
            <span className="faint text-[13px]">One transaction{assetMode === "token" ? " (two, the first time a token is approved)" : ""}. The link appears after it confirms.</span>
          </div>
        </div>
      </div>

      {/* Preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="glass overflow-hidden">
          <BoxScene kind={previewKind} className="relative h-[260px]" />
          <div className="border-t border-white/70 p-5">
            <div className="display-md text-[24px]">
              {amountWei && meta ? `${fmtAmount(amountWei, meta.decimals)} ${meta.symbol}` : meta ? `— ${meta.symbol}` : "—"}
            </div>
            <ul className="mt-3 space-y-1.5 text-[13.5px] muted">
              <li>{codeOn ? "Needs a code" : "No code — the link is the key"}</li>
              <li>{dateOn ? `Opens ${when(unlockAt)}` : "Opens as soon as it is sealed"}</li>
              <li>{expiresAt ? `Expires ${when(expiresAt)}` : "Never expires"}</li>
              <li>
                {!condOn
                  ? "No condition"
                  : condKind === "holds"
                    ? `Only for holders of ${holdsMeta.meta ? holdsMeta.meta.symbol : isAddress(holdsToken) ? short(holdsToken) : "…"}`
                    : `Released by ${isAddress(cosigner) ? short(cosigner) : "…"}`}
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="display-md text-[20px]">{title}</h2>
        {hint && <span className="faint text-[13px]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function LockCard({ on, onToggle, title, description, children }: { on: boolean; onToggle: (v: boolean) => void; title: string; description: string; children: ReactNode }) {
  return (
    <div className="lock-card p-4" data-on={on}>
      <button type="button" className="flex w-full items-center justify-between gap-4 text-left" onClick={() => onToggle(!on)} aria-pressed={on}>
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="muted block text-[13px]">{description}</span>
        </span>
        <span className="switch" aria-checked={on} role="switch" />
      </button>
      {on && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** After the transaction: the link, the code, and the warning that neither exists anywhere else. */
function Sealed({ result, onAgain }: { result: Result; onAgain: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/b/${result.id}#${result.secret}`;
  const tx = explorer.tx(result.txHash);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="glass p-6 sm:p-8">
        <span className="chip chip-ok">
          <span className="dot" />
          Sealed
        </span>
        <h2 className="display-md mt-4 text-[32px]">
          Box #{result.id.toString()} holds {result.amountText} {result.symbol}.
        </h2>
        <p className="muted mt-3 text-[15px]">Share this link. Whoever opens it{result.code ? " and knows the code" : ""} can claim the box into any wallet they choose.</p>

        <div className="mt-6">
          <div className="eyebrow mb-2">The link</div>
          <div className="glass-2 flex items-center gap-2 p-2 pl-4">
            <code className="mono min-w-0 flex-1 truncate text-[13.5px]">{link}</code>
            <CopyButton text={link} label="Copy link" />
          </div>
        </div>

        {result.code && (
          <div className="mt-5">
            <div className="eyebrow mb-2">The code — not in the link</div>
            <div className="glass-2 flex items-center gap-2 p-2 pl-4">
              <code className="mono min-w-0 flex-1 truncate text-[15px]">{result.code}</code>
              <CopyButton text={result.code} label="Copy code" />
            </div>
            <p className="faint mt-2 text-[13px]">Send it another way than the link: a message on another app, a call, a note.</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-[13.5px]">
          <strong>This is the only copy.</strong> The part after the # was generated in your browser and is stored nowhere — not on this site, not on the chain. If you close this page without keeping the link, the box stays sealed until it expires.
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/b/${result.id}#${result.secret}`} className="btn btn-primary">
            Open the box page
          </Link>
          <button type="button" className="btn btn-glass" onClick={onAgain}>
            Drop another
          </button>
          {tx && (
            <a href={tx} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Transaction ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
