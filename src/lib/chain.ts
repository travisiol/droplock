import { defineChain } from "viem";

/**
 * Robinhood Chain (Arbitrum Orbit), chain id 4663, by default. The
 * contracts do not depend on anything chain-specific beyond the CREATE2
 * proxy, so pointing the site at another EVM chain is these three
 * variables — and NEXT_PUBLIC_CHAIN_ID=31337 + a local RPC for rehearsals.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
export const IS_LOCAL_CHAIN = CHAIN_ID === 31337;

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? (IS_LOCAL_CHAIN ? "http://127.0.0.1:8560" : "https://rpc.mainnet.chain.robinhood.com");

export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL ?? (IS_LOCAL_CHAIN ? "" : "https://robinhoodchain.blockscout.com")).replace(/\/$/, "");

export const chain = defineChain({
  id: CHAIN_ID,
  name: IS_LOCAL_CHAIN ? "Local node" : (process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Robinhood Chain"),
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  ...(EXPLORER_URL ? { blockExplorers: { default: { name: "Explorer", url: EXPLORER_URL } } } : {}),
  testnet: IS_LOCAL_CHAIN,
});

export const explorer = {
  address: (a: string) => (EXPLORER_URL ? `${EXPLORER_URL}/address/${a}` : undefined),
  tx: (h: string) => (EXPLORER_URL ? `${EXPLORER_URL}/tx/${h}` : undefined),
  token: (a: string) => (EXPLORER_URL ? `${EXPLORER_URL}/token/${a}` : undefined),
};
