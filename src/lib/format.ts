import { formatUnits } from "viem";

export function short(address: string, head = 6, tail = 4): string {
  if (!address) return "";
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** 1.25, 0.0004, 1 000 000 — never scientific notation, no trailing zeros. */
export function amount(value: bigint, decimals: number, maxFraction = 6): string {
  const s = formatUnits(value, decimals);
  const [int, frac = ""] = s.split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  let f = frac.slice(0, maxFraction).replace(/0+$/, "");
  if (!f && value > 0n && frac.replace(/0+$/, "").length > 0) f = frac.slice(0, Math.min(frac.replace(/0+$/, "").length, 8)).replace(/0+$/, "");
  return f ? `${intFmt}.${f}` : intFmt;
}

export function when(ts: bigint | number): string {
  const n = Number(ts);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function dateOnly(ts: bigint | number): string {
  const n = Number(ts);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** "in 2 days", "in 3 hours", "4 minutes ago". */
export function relative(ts: bigint | number, now = Date.now() / 1000): string {
  const n = Number(ts);
  if (!n) return "";
  const diff = n - now;
  const abs = Math.abs(diff);
  const unit = abs < 90 ? [Math.round(abs), "second"] : abs < 5400 ? [Math.round(abs / 60), "minute"] : abs < 172800 ? [Math.round(abs / 3600), "hour"] : [Math.round(abs / 86400), "day"];
  const [v, u] = unit as [number, string];
  const label = `${v} ${u}${v === 1 ? "" : "s"}`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

/** For <input type="datetime-local">: local time without seconds. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/** viem / wallet errors are long; the first meaningful line is what a person needs. */
export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong.";
  const err = e as { shortMessage?: string; message?: string; cause?: { shortMessage?: string; message?: string } };
  const msg = err.shortMessage ?? err.cause?.shortMessage ?? err.message ?? err.cause?.message ?? String(e);
  const custom = /reverted with custom error '?([A-Za-z]+)\(/.exec(msg)?.[1] ?? /Error: ([A-Za-z]+)\(\)/.exec(msg)?.[1];
  if (custom && REVERTS[custom]) return REVERTS[custom];
  if (/user rejected|denied/i.test(msg)) return "You rejected the request in your wallet.";
  return msg.split("\n")[0].slice(0, 200);
}

const REVERTS: Record<string, string> = {
  BadSignature: "That key does not open this box. Check the link and the code.",
  NotYet: "This box is not open yet.",
  WindowClosed: "This box has expired; only the sender can reclaim it now.",
  NotSealed: "This box has already been opened.",
  ConditionFailed: "The box's condition is not met for this recipient.",
  NotExpired: "This box has not expired yet.",
  NotSender: "Only the sender can reclaim a box.",
  NoSuchBox: "There is no box with this id.",
  BadWindow: "The expiry must be in the future, after the unlock date.",
  BadCondition: "The condition refused these arguments.",
  BadValue: "Amount and value do not match.",
  ZeroAmount: "Nothing arrived in the box.",
  NativeSendFailed: "The recipient refused the ETH transfer.",
};
