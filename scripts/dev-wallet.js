/*
  A stand-in window.ethereum for local rehearsals — paste into the browser
  console on the running site (or inject it from a devtools driver):

    window.__DEV_WALLET_ACCOUNT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // any unlocked hardhat account
    <contents of this file>
    await window.__droplockWallet.connect();

  Every request is forwarded to the local node; eth_sendTransaction goes to
  a hardhat-unlocked account, so nothing needs a signature. It announces
  itself through EIP-6963 as "Dev Wallet", and as window.ethereum for the
  plain injected connector. Never served by the site.
*/
(() => {
  const RPC = window.__DEV_WALLET_RPC || "http://127.0.0.1:8560";
  const account = () => window.__DEV_WALLET_ACCOUNT || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  let id = 1;
  const listeners = {};
  async function rpc(method, params) {
    const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }) });
    const json = await res.json();
    if (json.error) {
      const e = new Error(json.error.message);
      e.code = json.error.code;
      e.data = json.error.data;
      throw e;
    }
    return json.result;
  }
  const provider = {
    isMetaMask: true,
    isDevWallet: true,
    async request({ method, params = [] }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account()];
        case "eth_chainId":
          return rpc("eth_chainId", []);
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
        case "wallet_requestPermissions":
          return null;
        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "eth_sendTransaction": {
          const tx = { ...params[0], from: account() };
          return rpc("eth_sendTransaction", [tx]);
        }
        case "personal_sign":
        case "eth_signTypedData_v4":
          throw Object.assign(new Error("Dev wallet does not sign messages"), { code: 4001 });
        default:
          return rpc(method, params);
      }
    },
    on(event, cb) {
      (listeners[event] ||= []).push(cb);
      return provider;
    },
    removeListener(event, cb) {
      listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
      return provider;
    },
    emit(event, ...args) {
      for (const f of listeners[event] || []) f(...args);
    },
  };
  window.ethereum = provider;
  const info = { uuid: "a6f1d2a0-dev0-4b6e-9f4e-droplock0001", name: "Dev Wallet", icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231f7ae0'/%3E%3C/svg%3E", rdns: "local.droplock.devwallet" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  window.__devWallet = { provider, setAccount: (a) => { window.__DEV_WALLET_ACCOUNT = a; provider.emit("accountsChanged", [a]); } };
  console.log("dev wallet ready as", account());
})();
