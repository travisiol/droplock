import { concatHex, encodeDeployData, getContractAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { cosignAbi } from "./abi/cosignAbi";
import cosignRecord from "./abi/Cosign.bytecode.json";
import droplockRecord from "./abi/Droplock.bytecode.json";
import holdsTokenRecord from "./abi/HoldsToken.bytecode.json";

/*
  The contracts' addresses are known before they exist.

  All three are created with CREATE2 through Arachnid's deterministic-
  deployment proxy (0x4e59…956C, present on Robinhood Chain and on most EVM
  chains), from the exact creation bytecode hardhat exported next to the
  ABIs. Same bytecode, same salt, same address — whoever sends the
  transaction. So anyone with a wallet can put them on a chain from /deploy,
  the site reads them there, and nobody holds a key for them: they have no
  owner. A recompiled contract is a different address, never a silent swap.
*/

export const DETERMINISTIC_DEPLOYER: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

/** Runtime code of the proxy, as read from Robinhood Chain (69 bytes). Tests install it with hardhat_setCode. */
export const DETERMINISTIC_DEPLOYER_CODE: Hex =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

export type ContractName = "Droplock" | "HoldsToken" | "Cosign";
export const CONTRACT_NAMES: readonly ContractName[] = ["Droplock", "HoldsToken", "Cosign"];

/** Bump a suffix to get a fresh address on purpose. */
export const SALTS: Record<ContractName, Hex> = {
  Droplock: keccak256(stringToHex("droplock:v1")),
  HoldsToken: keccak256(stringToHex("droplock:holds-token:v1")),
  Cosign: keccak256(stringToHex("droplock:cosign:v1")),
};

export const BYTECODE: Record<ContractName, Hex> = {
  Droplock: droplockRecord.bytecode as Hex,
  HoldsToken: holdsTokenRecord.bytecode as Hex,
  Cosign: cosignRecord.bytecode as Hex,
};

/** Creation bytecode with constructor arguments appended. Cosign is bound to the Droplock address. */
export function initCode(name: ContractName): Hex {
  if (name === "Cosign") {
    return encodeDeployData({ abi: cosignAbi, bytecode: BYTECODE.Cosign, args: [predictedAddress("Droplock")] });
  }
  return BYTECODE[name];
}

export function initCodeHash(name: ContractName): Hex {
  return keccak256(initCode(name));
}

/** Where the contract lives (or will live) on any chain that has the proxy. */
export function predictedAddress(name: ContractName): Address {
  return getContractAddress({ opcode: "CREATE2", from: DETERMINISTIC_DEPLOYER, salt: SALTS[name], bytecode: initCode(name) });
}

/** The one transaction that deploys it: `to` the proxy, `data` = salt ‖ init code. */
export function deployTx(name: ContractName): { to: Address; data: Hex } {
  return { to: DETERMINISTIC_DEPLOYER, data: concatHex([SALTS[name], initCode(name)]) };
}

function override(name: string): Address | undefined {
  const v = process.env[name]?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined;
}

/**
 * The addresses the site reads. Overrides (NEXT_PUBLIC_DROPLOCK, …) exist
 * only to point the site at another deployment on purpose.
 */
export const CONTRACTS = {
  droplock: override("NEXT_PUBLIC_DROPLOCK") ?? predictedAddress("Droplock"),
  holdsToken: override("NEXT_PUBLIC_HOLDS_TOKEN") ?? predictedAddress("HoldsToken"),
  cosign: override("NEXT_PUBLIC_COSIGN") ?? predictedAddress("Cosign"),
} as const;
