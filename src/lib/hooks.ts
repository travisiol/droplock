"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { droplockAbi } from "./abi/droplockAbi";
import { isEth, type BoxRecord } from "./boxes";
import { CONTRACTS } from "./deploy";
import { erc20Abi } from "./erc20";

/** Which of the three contracts have code at their deterministic address on the configured chain. */
export function useDeployed() {
  const client = usePublicClient();
  const query = useQuery({
    queryKey: ["deployed", client?.chain.id],
    enabled: Boolean(client),
    staleTime: 30_000,
    queryFn: async () => {
      const [d, h, c] = await Promise.all([
        client!.getCode({ address: CONTRACTS.droplock }),
        client!.getCode({ address: CONTRACTS.holdsToken }),
        client!.getCode({ address: CONTRACTS.cosign }),
      ]);
      return { droplock: Boolean(d && d !== "0x"), holdsToken: Boolean(h && h !== "0x"), cosign: Boolean(c && c !== "0x") };
    },
  });
  return { ...(query.data ?? { droplock: false, holdsToken: false, cosign: false }), loading: query.isPending, refetch: query.refetch };
}

export function useBox(id: bigint | null) {
  const enabled = id !== null;
  const read = useReadContracts({
    contracts: enabled
      ? [
          { address: CONTRACTS.droplock, abi: droplockAbi, functionName: "getBox", args: [id] },
          { address: CONTRACTS.droplock, abi: droplockAbi, functionName: "stateOf", args: [id] },
        ]
      : [],
    query: { enabled, refetchInterval: 8_000 },
  });
  const box = (read.data?.[0]?.result as BoxRecord | undefined) ?? null;
  const state = read.data?.[1]?.result as number | undefined;
  const missing = Boolean(read.data?.[0] && read.data[0].status === "failure");
  return { box, state: state ?? null, missing, loading: read.isPending && enabled, error: read.error, refetch: read.refetch };
}

export type TokenMeta = { address: Address; symbol: string; name: string; decimals: number; isEth: boolean; hasDecimals: boolean };

export const ETH_META: TokenMeta = { address: "0x0000000000000000000000000000000000000000", symbol: "ETH", name: "Ether", decimals: 18, isEth: true, hasDecimals: true };

/**
 * Symbol / name / decimals of a token, or ETH for the zero address. An
 * ERC-721 has a symbol but no decimals: it is reported with 0 decimals and
 * hasDecimals false, which is what a HoldsToken condition on an NFT needs.
 */
export function useTokenMeta(address: string | undefined) {
  const valid = Boolean(address && isAddress(address));
  const eth = valid && isEth(address as Address);
  const read = useReadContracts({
    contracts:
      valid && !eth
        ? [
            { address: address as Address, abi: erc20Abi, functionName: "symbol" },
            { address: address as Address, abi: erc20Abi, functionName: "name" },
            { address: address as Address, abi: erc20Abi, functionName: "decimals" },
          ]
        : [],
    query: { enabled: valid && !eth, staleTime: 60_000 },
  });
  if (eth) return { meta: ETH_META, loading: false, invalid: false };
  const results = read.data;
  const ok = Boolean(results && results.length === 3 && results[0]?.status === "success");
  const hasDecimals = Boolean(results && results[2]?.status === "success");
  const meta: TokenMeta | null =
    ok && results
      ? {
          address: address as Address,
          symbol: String(results[0]?.result),
          name: results[1]?.status === "success" ? String(results[1].result) : "",
          decimals: hasDecimals ? Number(results[2]?.result) : 0,
          isEth: false,
          hasDecimals,
        }
      : null;
  return { meta, loading: valid && !eth && read.isPending, invalid: valid && !eth && Boolean(read.data) && !ok };
}

export function useBalance(token: TokenMeta | null, owner: Address | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["balance", token?.address, owner, client?.chain.id],
    enabled: Boolean(client && token && owner),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (token!.isEth) return client!.getBalance({ address: owner! });
      return client!.readContract({ address: token!.address, abi: erc20Abi, functionName: "balanceOf", args: [owner!] });
    },
  });
}

/** Seconds since the epoch, ticking — for countdowns and "opens in …". */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
