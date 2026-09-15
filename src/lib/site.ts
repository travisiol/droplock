/**
 * Everything named after the project lives here. To rename it, change the
 * three strings at the top; the salts in deploy.ts, the EIP-712 domain in
 * contracts/Droplock.sol ("DROPLOCK") and the env prefix are the only
 * other places the name appears.
 */
export const site = {
  name: "DROPLOCK",
  wordmark: "DROPLOCK",
  slug: "droplock",
  hook: "Send value without sending a wallet address.",
  tagline: "A dead drop for tokens.",
  description:
    "Lock ETH or any token in a box behind a code, a date or an on-chain condition, then share the link. Whoever opens the link — and knows the code — claims it. No wallet address exchanged, nothing custodial, no owner.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://droplock.example").replace(/\/$/, ""),
  x: process.env.NEXT_PUBLIC_X_URL ?? "",
  github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
} as const;

/** The share link for a box. The secret rides in the fragment: it never reaches a server. */
export function boxUrl(id: bigint | number | string, secret?: string): string {
  return `${site.url}/b/${id}${secret ? `#${secret}` : ""}`;
}
