import { decodeAbiParameters, encodeAbiParameters, isAddressEqual, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS } from "./deploy";

/** Droplock.getBox as viem returns it. */
export type BoxRecord = {
  sender: Address;
  token: Address;
  amount: bigint;
  key: Address;
  unlockAt: bigint;
  expiresAt: bigint;
  createdAt: bigint;
  status: number;
  condition: Address;
  conditionArgs: Hex;
};

export enum BoxState {
  Locked = 0,
  Open = 1,
  Claimed = 2,
  Expired = 3,
  Reclaimed = 4,
}

export const STATE_LABEL: Record<BoxState, string> = {
  [BoxState.Locked]: "Locked",
  [BoxState.Open]: "Open",
  [BoxState.Claimed]: "Claimed",
  [BoxState.Expired]: "Expired",
  [BoxState.Reclaimed]: "Reclaimed",
};

export const STATE_CHIP: Record<BoxState, string> = {
  [BoxState.Locked]: "chip-warn",
  [BoxState.Open]: "chip-ok",
  [BoxState.Claimed]: "chip",
  [BoxState.Expired]: "chip-bad",
  [BoxState.Reclaimed]: "chip",
};

/** The state as the contract computes it, from the record and the clock — for lists, without one call per box. */
export function stateOf(box: BoxRecord, now = Math.floor(Date.now() / 1000)): BoxState {
  if (box.status === 1) return BoxState.Claimed;
  if (box.status === 2) return BoxState.Reclaimed;
  if (box.expiresAt !== 0n && BigInt(now) >= box.expiresAt) return BoxState.Expired;
  if (BigInt(now) < box.unlockAt) return BoxState.Locked;
  return BoxState.Open;
}

export const isEth = (token: Address) => isAddressEqual(token, zeroAddress);

// ───────────────────────────── conditions ─────────────────────────────

export type ConditionKind = "none" | "holds" | "cosign" | "custom";

export function conditionKind(condition: Address): ConditionKind {
  if (isAddressEqual(condition, zeroAddress)) return "none";
  if (isAddressEqual(condition, CONTRACTS.holdsToken)) return "holds";
  if (isAddressEqual(condition, CONTRACTS.cosign)) return "cosign";
  return "custom";
}

export function encodeHolds(token: Address, min: bigint): Hex {
  return encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [token, min]);
}

export function decodeHolds(args: Hex): { token: Address; min: bigint } | null {
  try {
    const [token, min] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], args);
    return { token, min };
  } catch {
    return null;
  }
}

export function encodeCosign(cosigner: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [cosigner]);
}

export function decodeCosign(args: Hex): { cosigner: Address } | null {
  try {
    const [cosigner] = decodeAbiParameters([{ type: "address" }], args);
    return { cosigner };
  } catch {
    return null;
  }
}
