"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, isAddressEqual, parseAbiItem, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { cosignAbi } from "@/lib/abi/cosignAbi";
import { droplockAbi } from "@/lib/abi/droplockAbi";
import { BoxState, STATE_CHIP, STATE_LABEL, conditionKind, decodeCosign, decodeHolds, isEth } from "@/lib/boxes";
import { chain, explorer } from "@/lib/chain";
import { CONTRACTS } from "@/lib/deploy";
import { amount as fmtAmount, errorMessage, relative, short, when } from "@/lib/format";
import { useBox, useNow, useTokenMeta } from "@/lib/hooks";
import { claimKeyAccount, claimKeyAddress, secretFromHash, signClaim } from "@/lib/keys";
import { ConnectButton } from "./ConnectButton";
import { OpenLink } from "./OpenLink";

const BoxScene = dynamic(() => import("@/components/three/BoxScene").then((m) => m.BoxScene), { ssr: false });

const CLAIMED_EVENT = parseAbiItem("event Claimed(uint256 indexed id, address indexed recipient, address indexed caller)");

type KeyStatus = "no-secret" | "checking" | "match" | "needs-code";

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function BoxView({ id }: { id: bigint }) {
  const { box, state, missing, loading, refetch } = useBox(id);
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const now = useNow();
  const token = useTokenMeta(box?.token);

  // The secret lives after the # and never reaches the server: read it on the client only.
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const secret = useMemo(() => secretFromHash(hash), [hash]);

  // Which key opens this box: the link alone, or the link plus a code. Derived in the browser, compared to box.key.
  const [code, setCode] = useState<string | null>(null);
  const [codeTry, setCodeTry] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const linkOnly = useQuery({
    queryKey: ["claimKey", secret],
    enabled: Boolean(secret),
    staleTime: Infinity,
    queryFn: () => claimKeyAddress(secret!, ""),
  });
  const keyStatus: KeyStatus = !secret
    ? "no-secret"
    : code !== null
      ? "match"
      : !box || linkOnly.isPending
        ? "checking"
        : linkOnly.data && isAddressEqual(linkOnly.data, box.key)
          ? "match"
          : "needs-code";

  async function tryCode(e: FormEvent) {
    e.preventDefault();
    if (!secret || !box) return;
    setCheckingCode(true);
    setCodeError(null);
    try {
      const derived = await claimKeyAddress(secret, codeTry);
      if (isAddressEqual(derived, box.key)) {
        setCode(codeTry);
      } else {
        setCodeError("That is not the code for this box.");
      }
    } finally {
      setCheckingCode(false);
    }
  }

  // Recipient: the connected wallet, or any address typed in.
  const [otherRecipient, setOtherRecipient] = useState(false);
  const [recipientText, setRecipientText] = useState("");
  const recipient: Address | undefined = otherRecipient ? (isAddress(recipientText) ? (recipientText as Address) : undefined) : address;

  // Condition
  const kind = box ? conditionKind(box.condition) : "none";
  const holds = box && kind === "holds" ? decodeHolds(box.conditionArgs) : null;
  const cosign = box && kind === "cosign" ? decodeCosign(box.conditionArgs) : null;
  const holdsMeta = useTokenMeta(holds?.token);
  const conditionMet = useReadContract({
    address: CONTRACTS.droplock,
    abi: droplockAbi,
    functionName: "conditionMet",
    args: [id, recipient ?? "0x0000000000000000000000000000000000000001", "0x"],
    query: { enabled: Boolean(box && kind !== "none" && recipient), refetchInterval: 8_000 },
  });
  const released = useReadContract({
    address: CONTRACTS.cosign,
    abi: cosignAbi,
    functionName: "released",
    args: [id, cosign?.cosigner ?? "0x0000000000000000000000000000000000000001"],
    query: { enabled: Boolean(cosign), refetchInterval: 8_000 },
  });
  const isCosigner = Boolean(cosign && address && isAddressEqual(address, cosign.cosigner));
  const isSender = Boolean(box && address && isAddressEqual(address, box.sender));

  // Who claimed it, from the event — best effort: some public RPCs cap log ranges.
  const claimedBy = useQuery({
    queryKey: ["claimedBy", id.toString(), client?.chain.id],
    enabled: Boolean(client && box && box.status === 1),
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const logs = await client!.getLogs({ address: CONTRACTS.droplock, event: CLAIMED_EVENT, args: { id }, fromBlock: BigInt(process.env.NEXT_PUBLIC_DROPLOCK_BLOCK ?? "0"), toBlock: "latest" });
        const last = logs.at(-1);
        return last ? { recipient: last.args.recipient as Address, tx: last.transactionHash } : null;
      } catch {
        return null;
      }
    },
  });

  // Actions
  const [busy, setBusy] = useState<"claim" | "release" | "reclaim" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ what: "claim" | "reclaim"; tx: Hex; recipient?: Address } | null>(null);

  async function claim() {
    if (!client || !box || !secret || !recipient) return;
    setBusy("claim");
    setError(null);
    try {
      const account = await claimKeyAccount(secret, code ?? "");
      const signature = await signClaim(account, { chainId: chain.id, verifyingContract: CONTRACTS.droplock, boxId: id, recipient });
      const ok = await client.readContract({ address: CONTRACTS.droplock, abi: droplockAbi, functionName: "isClaimSignature", args: [id, recipient, signature] });
      if (!ok) throw new Error("The derived key does not match this box. Check the link and the code.");
      const hash = await writeContractAsync({ address: CONTRACTS.droplock, abi: droplockAbi, functionName: "claim", args: [id, recipient, signature, "0x"] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setDone({ what: "claim", tx: hash, recipient });
      refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function release() {
    if (!client) return;
    setBusy("release");
    setError(null);
    try {
      const hash = await writeContractAsync({ address: CONTRACTS.cosign, abi: cosignAbi, functionName: "release", args: [id] });
      await client.waitForTransactionReceipt({ hash });
      released.refetch();
      conditionMet.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function reclaim() {
    if (!client) return;
    setBusy("reclaim");
    setError(null);
    try {
      const hash = await writeContractAsync({ address: CONTRACTS.droplock, abi: droplockAbi, functionName: "reclaim", args: [id] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setDone({ what: "reclaim", tx: hash });
      refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const sceneKind = useMemo(() => (box ? (isEth(box.token) ? "crystal" : "coin") : "coin"), [box]);

  // ───────────────────────────── render ─────────────────────────────

  if (missing) {
    return (
      <div className="glass mx-auto max-w-xl p-8 text-center">
        <h1 className="display-md text-[28px]">No box #{id.toString()}</h1>
        <p className="muted mt-2">Nothing has been dropped under this number on {chain.name}.</p>
        <OpenLink className="mt-6 text-left" />
      </div>
    );
  }
  if (loading || !box || state === null) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="glass h-[420px] animate-pulse" />
        <div className="glass h-[420px] animate-pulse" />
      </div>
    );
  }

  const st = state as BoxState;
  const opened = box.status === 1 || done?.what === "claim";
  const sym = token.meta?.symbol ?? (isEth(box.token) ? "ETH" : short(box.token));
  const dec = token.meta?.decimals ?? 18;
  const canClaim = st === BoxState.Open && keyStatus === "match" && (kind === "none" || conditionMet.data === true);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* The box */}
      <div className="glass overflow-hidden">
        <BoxScene kind={sceneKind} open={opened} dim={box.status === 2 || st === BoxState.Expired} className="relative h-[360px] sm:h-[440px]" />
        <div className="border-t border-white/70 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[13px] faint">Box #{id.toString()}</span>
            <span className={`chip ${STATE_CHIP[st]}`}>
              <span className="dot" />
              {STATE_LABEL[st]}
            </span>
          </div>
          <div className="display mt-3 text-[40px] sm:text-[48px]">
            {fmtAmount(box.amount, dec)} <span className="text-[0.55em] muted">{sym}</span>
          </div>
          <dl className="mt-4 text-[13.5px]">
            <Row k="From">
              <Addr a={box.sender} />
            </Row>
            <Row k="Sealed">{when(box.createdAt)}</Row>
            <Row k="Key">{code ? "Link + code" : keyStatus === "needs-code" ? "Link + a code" : keyStatus === "match" ? "The link" : `The link${secret ? "" : " (not in this URL)"}`}</Row>
            <Row k="Opens">{box.unlockAt === 0n ? "Immediately" : `${when(box.unlockAt)} · ${relative(box.unlockAt, now)}`}</Row>
            <Row k="Expires">{box.expiresAt === 0n ? "Never" : `${when(box.expiresAt)} · ${relative(box.expiresAt, now)}`}</Row>
            <Row k="Condition">
              {kind === "none" && "None"}
              {kind === "holds" && holds && (
                <>
                  Holds ≥ {holdsMeta.meta ? `${fmtAmount(holds.min, holdsMeta.meta.decimals)} ${holdsMeta.meta.symbol}` : `${holds.min.toString()} of ${short(holds.token)}`}
                </>
              )}
              {kind === "cosign" && cosign && (
                <>
                  Released by <Addr a={cosign.cosigner} /> {released.data ? <span className="text-ok">· released</span> : <span className="text-warn">· not yet</span>}
                </>
              )}
              {kind === "custom" && (
                <>
                  Custom · <Addr a={box.condition} />
                </>
              )}
            </Row>
          </dl>
        </div>
      </div>

      {/* The action */}
      <div className="flex flex-col gap-4">
        {done ? (
          <Done done={done} amount={`${fmtAmount(box.amount, dec)} ${sym}`} />
        ) : st === BoxState.Claimed ? (
          <Panel title="Already opened.">
            <p className="muted">
              This box was claimed{claimedBy.data ? <> by <Addr a={claimedBy.data.recipient} /></> : ""}.
              {claimedBy.data && explorer.tx(claimedBy.data.tx) && (
                <>
                  {" "}
                  <a className="text-glacier underline underline-offset-2" href={explorer.tx(claimedBy.data.tx)} target="_blank" rel="noreferrer">
                    Transaction ↗
                  </a>
                </>
              )}
            </p>
          </Panel>
        ) : st === BoxState.Reclaimed ? (
          <Panel title="Taken back.">
            <p className="muted">The claim window closed and the sender reclaimed the contents.</p>
          </Panel>
        ) : st === BoxState.Expired ? (
          <Panel title="Expired.">
            <p className="muted">The claim window closed {relative(box.expiresAt, now)}. Only the sender can move the tokens now.</p>
            {isSender && (
              <button type="button" className="btn btn-primary mt-4" disabled={busy !== null} onClick={reclaim}>
                {busy === "reclaim" ? "Reclaiming…" : "Reclaim to my wallet"}
              </button>
            )}
            {!isConnected && <ConnectButton />}
            {error && <p className="mt-3 text-[14px] text-bad">{error}</p>}
          </Panel>
        ) : (
          <>
            {st === BoxState.Locked && (
              <Panel title={`Opens ${relative(box.unlockAt, now)}.`}>
                <p className="muted">{when(box.unlockAt)}. Keep the link; come back then.</p>
              </Panel>
            )}

            {keyStatus === "no-secret" && (
              <Panel title="This link has no key.">
                <p className="muted">The part after the # is missing. Ask the sender for the full link, or paste it here.</p>
                <OpenLink className="mt-4" />
              </Panel>
            )}

            {keyStatus === "checking" && (
              <Panel title="Checking the key…">
                <p className="muted">Deriving the claim key from the link in your browser.</p>
              </Panel>
            )}

            {keyStatus === "needs-code" && (
              <Panel title="This box needs a code.">
                <p className="muted">The sender set a code on top of the link. Type it — it is checked here, in your browser, nothing is sent.</p>
                <form onSubmit={tryCode} className="mt-4 flex gap-2">
                  <input className="field field-mono" placeholder="the code" value={codeTry} onChange={(e) => setCodeTry(e.target.value)} autoComplete="off" autoFocus aria-label="Code" />
                  <button type="submit" className="btn btn-primary shrink-0" disabled={checkingCode || !codeTry.trim()}>
                    {checkingCode ? "Checking…" : "Unlock"}
                  </button>
                </form>
                {codeError && <p className="mt-2 text-[13.5px] text-bad">{codeError}</p>}
              </Panel>
            )}

            {keyStatus === "match" && (
              <Panel title={st === BoxState.Open ? "Open it." : "The key fits."}>
                <p className="muted">The contents go to a wallet you choose. {isConnected ? "" : "Connect one, or type an address."}</p>
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] faint">Send to</span>
                    <div className="seg">
                      <button type="button" className="seg-item" aria-pressed={!otherRecipient} onClick={() => setOtherRecipient(false)}>
                        My wallet
                      </button>
                      <button type="button" className="seg-item" aria-pressed={otherRecipient} onClick={() => setOtherRecipient(true)}>
                        Another address
                      </button>
                    </div>
                  </div>
                  {otherRecipient ? (
                    <input className="field field-mono mt-3" placeholder="0x…" value={recipientText} onChange={(e) => setRecipientText(e.target.value.trim())} spellCheck={false} aria-label="Recipient" />
                  ) : (
                    <div className="mono mt-3 text-[14px]">{address ? <Addr a={address} /> : <span className="faint">No wallet connected</span>}</div>
                  )}
                </div>

                {kind !== "none" && recipient && (
                  <p className={`mt-4 text-[13.5px] ${conditionMet.data ? "text-ok" : "text-warn"}`}>
                    {conditionMet.data ? "Condition met for this address." : kind === "cosign" ? "Waiting for the cosigner to release the box." : kind === "holds" ? "This address does not hold enough of the required token." : "The condition is not met for this address."}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {isConnected ? (
                    <button type="button" className="btn btn-primary" disabled={!canClaim || !recipient || busy !== null} onClick={claim}>
                      {busy === "claim" ? "Opening…" : st === BoxState.Locked ? `Opens ${relative(box.unlockAt, now)}` : "Open the box"}
                    </button>
                  ) : (
                    <ConnectButton />
                  )}
                  <span className="faint text-[13px]">Your browser signs with the claim key; your wallet sends the transaction and pays gas.</span>
                </div>
                {error && <p className="mt-3 text-[14px] text-bad">{error}</p>}
              </Panel>
            )}

            {isCosigner && !released.data && (
              <Panel title="You are the cosigner.">
                <p className="muted">This box named your wallet. Releasing it lets the claim go through; it moves nothing to you.</p>
                <button type="button" className="btn btn-primary mt-4" disabled={busy !== null} onClick={release}>
                  {busy === "release" ? "Releasing…" : "Release this box"}
                </button>
                {error && busy === null && <p className="mt-3 text-[14px] text-bad">{error}</p>}
              </Panel>
            )}
          </>
        )}

        <p className="faint px-1 text-[12.5px]">
          Box {id.toString()} on {chain.name} · contract{" "}
          <Addr a={CONTRACTS.droplock} /> · <Link href="/mine" className="underline underline-offset-2">my boxes</Link>
        </p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass p-6">
      <h2 className="display-md text-[24px]">{title}</h2>
      <div className="mt-2 text-[15px]">{children}</div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <dt className="faint shrink-0">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Addr({ a }: { a: Address }) {
  const url = explorer.address(a);
  const inner = <span className="mono">{short(a)}</span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" title={a}>
      {inner}
    </a>
  ) : (
    <span title={a}>{inner}</span>
  );
}

function Done({ done, amount }: { done: { what: "claim" | "reclaim"; tx: Hex; recipient?: Address }; amount: string }) {
  const url = explorer.tx(done.tx);
  return (
    <div className="glass p-6">
      <span className="chip chip-ok">
        <span className="dot" />
        {done.what === "claim" ? "Opened" : "Reclaimed"}
      </span>
      <h2 className="display-md mt-3 text-[28px]">{done.what === "claim" ? `${amount} is yours.` : `${amount} is back.`}</h2>
      <p className="muted mt-2 text-[15px]">
        {done.what === "claim" && done.recipient ? (
          <>
            Sent to <Addr a={done.recipient} />.
          </>
        ) : (
          "Returned to the sender's wallet."
        )}{" "}
        {url && (
          <a className="text-glacier underline underline-offset-2" href={url} target="_blank" rel="noreferrer">
            Transaction ↗
          </a>
        )}
      </p>
      <Link href="/drop" className="btn btn-glass mt-5">
        Drop a box of your own
      </Link>
    </div>
  );
}
