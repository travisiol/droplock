/**
 * Screenshots of the running site with headless Chrome, driven over the
 * DevTools protocol (Node's built-in WebSocket, no dependency):
 *
 *   node scripts/capture.mjs [base=http://localhost:3860] [outDir=docs/captures]
 *   ONLY=hero,landing-full node scripts/capture.mjs      # a subset
 *   EXTRA='[{"name":"box-1","path":"/b/1#…","w":1440,"h":900}]' …   # more shots
 *
 * SwiftShader renders WebGL without a GPU, so the glass boxes appear.
 * Device metrics are emulated per shot (Chrome refuses windows narrower
 * than ~500 px, so phone widths need the emulation), and each shot waits a
 * real few seconds for fonts, the scenes and the chain reads.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const base = process.argv[2] ?? "http://localhost:3860";
const out = resolve(process.argv[3] ?? "docs/captures");
mkdirSync(out, { recursive: true });
const only = process.env.ONLY?.split(",");
const extra = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : [];

const CANDIDATES = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("no Chrome found");

const shots = [
  { name: "hero", path: "/", w: 1440, h: 900 },
  { name: "landing-full", path: "/", w: 1440, h: 900, full: true },
  { name: "drop", path: "/drop", w: 1440, h: 1100 },
  { name: "deploy", path: "/deploy", w: 1440, h: 1100 },
  { name: "mobile-hero", path: "/", w: 400, h: 860, mobile: true },
  { name: "mobile-landing-full", path: "/", w: 400, h: 860, mobile: true, full: true },
  ...extra,
].filter((s) => !only || only.includes(s.name));

const PORT = 9337;
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${resolve(tmpdir(), "droplock-capture")}`,
    `--remote-debugging-port=${PORT}`,
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function connect() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  return { cdp: new Cdp(ws), ws, targetId: target.id };
}

try {
  await waitForChrome();
  for (const s of shots) {
    // One retry per shot: a dev server compiling a route on demand can make the first attempt time out.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { cdp, ws, targetId } = await connect();
      try {
        await cdp.send("Page.enable");
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: Boolean(s.mobile) });
        await cdp.send("Page.navigate", { url: base + s.path });
        await sleep(s.wait ?? 7000);
        let clip;
        if (s.full) {
          // Keep the viewport as it is (the hero is sized from 100svh) and capture beyond it.
          const { cssContentSize, contentSize } = await cdp.send("Page.getLayoutMetrics");
          const height = Math.min(Math.ceil((cssContentSize ?? contentSize).height), 8000);
          clip = { x: 0, y: 0, width: s.w, height, scale: 1 };
        }
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(s.full), ...(clip ? { clip } : {}) });
        writeFileSync(resolve(out, `${s.name}.png`), Buffer.from(data, "base64"));
        console.log(`${s.name}.png`);
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        console.warn(`${s.name}: ${e.message} — retrying`);
      } finally {
        ws.close();
        await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`).catch(() => {});
      }
    }
  }
} finally {
  proc.kill();
}
