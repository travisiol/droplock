import { concat, keccak256, toBytes, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/*
  The claim key.

  A box is opened by a signature, not by a wallet address. The sender's
  browser draws 16 random bytes (the *secret*, carried in the link's
  fragment) and, optionally, a *code* the sender tells the recipient some
  other way. Both go through PBKDF2 into a throwaway secp256k1 private key;
  the box stores that key's address. To claim, the recipient's browser
  re-derives the key from the link (+ code) and signs Claim(boxId,
  recipient) — the signature is what the chain sees. The secret and the code
  never leave the two browsers.

  Why a KDF: the key address is public, so a code could be brute-forced
  offline by anyone who also has the link. 300 000 rounds of PBKDF2 makes
  each guess cost ~a third of a second on a laptop; with the 128-bit secret
  mixed in as salt, the link alone is the first factor and the code the
  second. Both browsers must agree on every parameter here, so this module is
  shared by the site and by the contract tests.
*/

export const KEY_VERSION = "droplock/v1";
export const KDF_ITERATIONS = 300_000;
export const SECRET_BYTES = 16;

/** EIP-712 domain the contract was constructed with (EIP712("DROPLOCK", "1")). */
export const CLAIM_DOMAIN_NAME = "DROPLOCK";
export const CLAIM_DOMAIN_VERSION = "1";

export const claimTypes = {
  Claim: [
    { name: "boxId", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
} as const;

const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");

// ───────────────────────────── secret ─────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url without padding: 16 bytes → 22 characters, safe in a URL fragment. */
export function encodeSecret(bytes: Uint8Array): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) >>> 0;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[(acc >>> bits) & 63];
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (6 - bits)) & 63];
  return out;
}

export function decodeSecret(text: string): Uint8Array | null {
  const s = text.trim();
  if (s.length !== Math.ceil((SECRET_BYTES * 8) / 6)) return null;
  const out = new Uint8Array(SECRET_BYTES);
  let acc = 0;
  let bits = 0;
  let i = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = ((acc << 6) | v) >>> 0;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (i < SECRET_BYTES) out[i++] = (acc >>> bits) & 255;
    }
  }
  return i === SECRET_BYTES ? out : null;
}

export function newSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return encodeSecret(bytes);
}

/** The secret as it arrives in `location.hash`, or null when the link carries none. */
export function secretFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  return decodeSecret(raw) ? raw : null;
}

// ───────────────────────────── code ─────────────────────────────

/** Codes are compared case-insensitively, with surrounding and repeated whitespace ignored. */
export function normalizeCode(code: string): string {
  return code.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// ───────────────────────────── derivation ─────────────────────────────

/** PBKDF2-SHA256(password = "droplock:" + code, salt = version ‖ secret) → a valid secp256k1 private key. */
export async function deriveClaimKey(secret: string, code: string): Promise<Hex> {
  const secretBytes = decodeSecret(secret);
  if (!secretBytes) throw new Error("malformed secret");
  const enc = new TextEncoder();
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey("raw", enc.encode(`droplock:${normalizeCode(code)}`), "PBKDF2", false, ["deriveBits"]);
  const salt = concat([toHex(enc.encode(KEY_VERSION)), toHex(secretBytes)]);
  const saltBytes = new Uint8Array(toBytes(salt));
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: KDF_ITERATIONS }, material, 256);
  let key = toHex(new Uint8Array(bits));
  // Astronomically unlikely, but a private key must be in [1, n-1].
  while (BigInt(key) === BigInt(0) || BigInt(key) >= SECP256K1_N) key = keccak256(key);
  return key;
}

export async function claimKeyAccount(secret: string, code: string): Promise<PrivateKeyAccount> {
  return privateKeyToAccount(await deriveClaimKey(secret, code));
}

/** What the box stores: the claim key's address. */
export async function claimKeyAddress(secret: string, code: string): Promise<Address> {
  return (await claimKeyAccount(secret, code)).address;
}

// ───────────────────────────── signing ─────────────────────────────

export type ClaimInput = {
  chainId: number;
  verifyingContract: Address;
  boxId: bigint;
  recipient: Address;
};

export function claimDomain(chainId: number, verifyingContract: Address) {
  return { name: CLAIM_DOMAIN_NAME, version: CLAIM_DOMAIN_VERSION, chainId, verifyingContract } as const;
}

/** The claim key's EIP-712 signature over Claim(boxId, recipient) — what `Droplock.claim` verifies. */
export async function signClaim(account: PrivateKeyAccount, input: ClaimInput): Promise<Hex> {
  return account.signTypedData({
    domain: claimDomain(input.chainId, input.verifyingContract),
    types: claimTypes,
    primaryType: "Claim",
    message: { boxId: input.boxId, recipient: input.recipient },
  });
}

/** Four words from the BIP-39 list, e.g. "glacier honey ritual twelve" — 44 bits, on top of the 128-bit link secret. */
export function suggestCode(words: readonly string[], count = 4): string {
  const picks: string[] = [];
  const buf = new Uint32Array(count);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < count; i++) picks.push(words[buf[i] % words.length]);
  return picks.join(" ");
}
