"use client";

import { ConnectButton as RainbowConnect } from "@rainbow-me/rainbowkit";
import { short } from "@/lib/format";

/** The wallet button in the site's own pill; RainbowKit provides the modal. */
export function ConnectButton({ size = "md" }: { size?: "sm" | "md" }) {
  const sm = size === "sm" ? "btn-sm" : "";
  return (
    <RainbowConnect.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        if (!ready) return <span className={`btn btn-glass ${sm} invisible`}>Connect</span>;
        if (!connected) {
          return (
            <button type="button" onClick={openConnectModal} className={`btn btn-glass ${sm}`}>
              Connect wallet
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={`btn btn-danger ${sm}`}>
              Wrong network
            </button>
          );
        }
        return (
          <button type="button" onClick={openAccountModal} className={`btn btn-glass ${sm} mono`} title={account.address}>
            <span className="dot text-ok" />
            {account.ensName ?? short(account.address)}
          </button>
        );
      }}
    </RainbowConnect.Custom>
  );
}
