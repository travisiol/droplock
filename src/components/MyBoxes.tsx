"use client";

import Link from "next/link";
import { useState } from "react";
import { zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { droplockAbi } from "@/lib/abi/droplockAbi";
import { BoxState, STATE_CHIP, STATE_LABEL, conditionKind, isEth, stateOf, type BoxRecord } from "@/lib/boxes";
import { chain } from "@/lib/chain";
import { CONTRACTS } from "@/lib/deploy";
import { erc20Abi } from "@/lib/erc20";
import { amount as fmtAmount, errorMessage, relative, short } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { ConnectButton } from "./ConnectButton";

/** Every box the connected wallet has dropped, with what can still be done about it. */
export function MyBoxes() {
  const { address, isConnected } = useAccount();
  const now = useNow(5_000);
  const ids = useReadContract({
    address: CONTRACTS.droplock,
    abi: droplockAbi,
    functionName: "boxesOf",
    args: [address ?? zeroAddress],
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });
  const list = (ids.data ?? []) as readonly bigint[];
  const boxes = useReadContracts({
    contracts: list.map((id) => ({ address: CONTRACTS.droplock, abi: droplockAbi, functionName: "getBox" as const, args: [id] as const })),
    query: { enabled: list.length > 0, refetchInterval: 10_000 },
  });
  const records = (boxes.data ?? []).map((r) => (r.status === "success" ? (r.result as BoxRecord) : null));
  const tokens = Array.from(new Set(records.filter((r): r is BoxRecord => Boolean(r) && !isEth(r!.token)).map((r) => r.token)));
  const metas = useReadContracts({
    contracts: tokens.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: "symbol" as const },
      { address: t, abi: erc20Abi, functionName: "decimals" as const },
    ]),
    query: { enabled: tokens.length > 0, staleTime: 60_000 },
  });
  const metaOf = (token: `0x${string}`) => {
    if (isEth(token)) return { symbol: "ETH", decimals: 18 };
    const i = tokens.indexOf(token);
    const s = metas.data?.[i * 2];
    const d = metas.data?.[i * 2 + 1];
    return s?.status === "success" && d?.status === "success" ? { symbol: String(s.result), decimals: Number(d.result) } : { symbol: short(token), decimals: 18 };
  };

  if (!isConnected) {
    return (
      <div className="glass mx-auto max-w-xl p-8 text-center">
        <h2 className="display-md text-[24px]">Connect the wallet you dropped from.</h2>
        <p className="muted mt-2">Boxes are listed by sender. The links and codes are not here — they never were.</p>
        <div className="mt-5 flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }
  if (ids.isPending || (list.length > 0 && boxes.isPending)) return <div className="glass h-40 animate-pulse" />;
  if (list.length === 0) {
    return (
      <div className="glass mx-auto max-w-xl p-8 text-center">
        <h2 className="display-md text-[24px]">No boxes from this wallet.</h2>
        <p className="muted mt-2">On {chain.name}, under {short(address!)}.</p>
        <Link href="/drop" className="btn btn-primary mt-5">
          Drop one
        </Link>
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead>
            <tr className="faint text-left text-[12px] uppercase tracking-wider">
              <th className="px-5 py-3 font-semibold">Box</th>
              <th className="px-5 py-3 font-semibold">Contents</th>
              <th className="px-5 py-3 font-semibold">Locks</th>
              <th className="px-5 py-3 font-semibold">State</th>
              <th className="px-5 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((id, i) => {
              const b = records[i];
              if (!b) return null;
              const st = stateOf(b, now);
              const m = metaOf(b.token);
              const locks = [b.unlockAt !== 0n ? `opens ${relative(b.unlockAt, now)}` : null, b.expiresAt !== 0n ? `expires ${relative(b.expiresAt, now)}` : "no expiry", conditionKind(b.condition) !== "none" ? conditionKind(b.condition) : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={id.toString()} className="border-t border-white/70">
                  <td className="mono px-5 py-3">#{id.toString()}</td>
                  <td className="mono px-5 py-3">
                    {fmtAmount(b.amount, m.decimals)} {m.symbol}
                  </td>
                  <td className="muted px-5 py-3">{locks}</td>
                  <td className="px-5 py-3">
                    <span className={`chip ${STATE_CHIP[st]}`}>
                      <span className="dot" />
                      {STATE_LABEL[st]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/b/${id}`} className="btn btn-ghost btn-sm">
                        Page
                      </Link>
                      {st === BoxState.Expired && <ReclaimButton id={id} onDone={() => boxes.refetch()} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="faint border-t border-white/70 px-5 py-3 text-[12.5px]">The page link of a box does not carry its secret. Only the link you were given when sealing it opens it.</p>
    </div>
  );
}

function ReclaimButton({ id, onDone }: { id: bigint; onDone: () => void }) {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function reclaim() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({ address: CONTRACTS.droplock, abi: droplockAbi, functionName: "reclaim", args: [id] });
      await client.waitForTransactionReceipt({ hash });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={reclaim}>
        {busy ? "Reclaiming…" : "Reclaim"}
      </button>
      {error && <span className="mt-1 text-[12px] text-bad">{error}</span>}
    </span>
  );
}
