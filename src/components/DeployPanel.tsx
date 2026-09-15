"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import { chain, explorer } from "@/lib/chain";
import { CONTRACT_NAMES, DETERMINISTIC_DEPLOYER, deployTx, initCodeHash, predictedAddress, SALTS, type ContractName } from "@/lib/deploy";
import { errorMessage, short } from "@/lib/format";
import { useDeployed } from "@/lib/hooks";
import { ConnectButton } from "./ConnectButton";
import { CopyButton } from "./CopyButton";

const ABOUT: Record<ContractName, string> = {
  Droplock: "The boxes. Holds what is dropped, verifies claim signatures, pays out. No owner, no fee.",
  HoldsToken: "Condition: the recipient holds at least N of a token or NFT. Stateless, shared by every box.",
  Cosign: "Condition: a named wallet must release the box first. Bound to this Droplock's address.",
};

/** Three contracts, three known addresses, one button each. Whoever clicks pays the gas and keeps no power. */
export function DeployPanel() {
  const { isConnected } = useAccount();
  const client = usePublicClient();
  const deployed = useDeployed();
  const { sendTransactionAsync } = useSendTransaction();
  const [busy, setBusy] = useState<ContractName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proxy = useProxyPresent();

  const status: Record<ContractName, boolean> = { Droplock: deployed.droplock, HoldsToken: deployed.holdsToken, Cosign: deployed.cosign };

  async function deploy(name: ContractName) {
    if (!client) return;
    setBusy(name);
    setError(null);
    try {
      const tx = deployTx(name);
      const hash = await sendTransactionAsync({ to: tx.to, data: tx.data });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The deployment reverted.");
      const code = await client.getCode({ address: predictedAddress(name) });
      if (!code || code === "0x") throw new Error("No code at the predicted address after the transaction.");
      await deployed.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Deterministic deployer</div>
            <div className="mono mt-1 text-[14px]">{DETERMINISTIC_DEPLOYER}</div>
          </div>
          <span className={`chip ${proxy === null ? "" : proxy ? "chip-ok" : "chip-bad"}`}>
            <span className="dot" />
            {proxy === null ? "Checking…" : proxy ? `Present on ${chain.name}` : `Missing on ${chain.name}`}
          </span>
        </div>
        <p className="muted mt-3 text-[14px]">
          Arachnid&apos;s CREATE2 proxy. Each contract&apos;s address is a pure function of its bytecode and a salt, so it is the same on every chain that has the proxy — and the same whoever sends the transaction. A recompiled contract is a different address, never a swap.
        </p>
      </div>

      {CONTRACT_NAMES.map((name) => {
        const addr = predictedAddress(name);
        const url = explorer.address(addr);
        const done = status[name];
        const blocked = name === "Cosign" && !status.Droplock;
        return (
          <div key={name} className="glass p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="display-md text-[22px]">{name}</h2>
                  <span className={`chip ${deployed.loading ? "" : done ? "chip-ok" : "chip-warn"}`}>
                    <span className="dot" />
                    {deployed.loading ? "Checking…" : done ? "Deployed" : "Not yet"}
                  </span>
                </div>
                <p className="muted mt-2 text-[14px]">{ABOUT[name]}</p>
                <dl className="mono mt-3 text-[12.5px]">
                  <div className="row">
                    <dt className="faint">address</dt>
                    <dd className="flex items-center gap-2">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                          {addr}
                        </a>
                      ) : (
                        addr
                      )}
                      <CopyButton text={addr} label="Copy" className="!h-7 !px-2.5 !text-[12px]" />
                    </dd>
                  </div>
                  <div className="row">
                    <dt className="faint">salt</dt>
                    <dd className="truncate">{short(SALTS[name], 10, 8)}</dd>
                  </div>
                  <div className="row">
                    <dt className="faint">init code hash</dt>
                    <dd className="truncate">{short(initCodeHash(name), 10, 8)}</dd>
                  </div>
                </dl>
              </div>
              <div className="shrink-0">
                {done ? null : !isConnected ? (
                  <ConnectButton />
                ) : (
                  <button type="button" className="btn btn-primary" disabled={busy !== null || proxy === false || blocked} onClick={() => deploy(name)} title={blocked ? "Deploy Droplock first" : undefined}>
                    {busy === name ? "Deploying…" : `Deploy ${name}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {error && <p className="text-[14px] text-bad">{error}</p>}
    </div>
  );
}

function useProxyPresent(): boolean | null {
  const client = usePublicClient();
  const q = useQuery({
    queryKey: ["proxy", client?.chain.id],
    enabled: Boolean(client),
    staleTime: 60_000,
    queryFn: async () => {
      const code = await client!.getCode({ address: DETERMINISTIC_DEPLOYER });
      return Boolean(code && code !== "0x");
    },
  });
  return q.data ?? null;
}
