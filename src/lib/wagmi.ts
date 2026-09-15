import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http, injected } from "wagmi";
import { chain } from "@/lib/chain";
import { site } from "@/lib/site";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

/**
 * With a WalletConnect project id RainbowKit offers its full wallet list;
 * without one only injected wallets (MetaMask, Rabby, Coinbase extension…)
 * are shown — no key is invented.
 */
export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: site.name,
      projectId,
      chains: [chain],
      transports: { [chain.id]: http() },
      ssr: true,
    })
  : createConfig({
      chains: [chain],
      connectors: [injected()],
      transports: { [chain.id]: http() },
      ssr: true,
    });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
