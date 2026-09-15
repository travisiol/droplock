# DROPLOCK

**Send value without sending a wallet address.**

A dead drop for tokens. You lock ETH or any ERC-20 in a box, protect it with a code, a date and/or an on-chain condition, and share a link. Whoever opens the link — and knows the code, and meets the condition, after the date — claims the box into any wallet they choose. No address exchanged beforehand, no custodian, no owner, no fee.

> The name is a working title. "Dropbox" belongs to Dropbox, Inc.; the project ships as DROPLOCK. Renaming it is `src/lib/site.ts` (three strings), the salts in `src/lib/deploy.ts`, the EIP-712 domain in `contracts/contracts/Droplock.sol`, and this file.

## How it works

1. **Drop.** The sender's browser draws a 16-byte secret and, optionally, takes a code. Both go through PBKDF2 (300 000 rounds, SHA-256) into a throwaway secp256k1 key; the box stores only that key's **address**. One transaction seals the box with the asset, the unlock date, the expiry and the condition.
2. **Share.** The link is `https://…/b/<id>#<secret>`. The secret rides in the fragment, so it never reaches a server — not this site's, not anyone's. The code, if any, is told separately.
3. **Open.** The recipient's browser re-derives the key from link (+ code), signs `Claim(boxId, recipient)` (EIP-712), and sends `claim()` from any wallet. The signature names the recipient, so a transaction copied from the mempool cannot be redirected. The transaction may be sent by a relayer on the recipient's behalf.

Three locks, all optional, all combinable:

| Lock | On-chain | Notes |
| --- | --- | --- |
| **Code** | the claim key's address | brute-forcing a code offline needs the link *and* ~0.3 s per guess |
| **Date** | `unlockAt`, `expiresAt` | nothing opens before `unlockAt`; after `expiresAt` nobody can claim and the sender reclaims |
| **Condition** | an `ICondition` contract + args | built in: `HoldsToken` (recipient holds ≥ N of a token or NFT), `Cosign` (a named wallet must `release(boxId)` first) |

What the chain never sees: the secret, the code, and the recipient before the moment of claiming.

## Contracts (`contracts/`)

Hardhat 2.29, Solidity 0.8.28, OpenZeppelin 5.

- `Droplock.sol` — the boxes. `drop`, `claim`, `reclaim`; views `getBox`, `boxesOf`, `stateOf`, `claimDigest`, `isClaimSignature`, `conditionMet`. EIP712("DROPLOCK", "1"). No owner, no admin, no fee. Fee-on-transfer tokens work: the box records what arrived.
- `conditions/ICondition.sol` — `validate(args)` at drop time, `check(boxId, recipient, args, proof)` at claim time. Both views.
- `conditions/HoldsToken.sol` — stateless, `args = abi.encode(token, minBalance)`.
- `conditions/Cosign.sol` — `args = abi.encode(cosigner)`; the cosigner calls `release(boxId)`; bound to one Droplock.

```bash
cd contracts
npm ci
npm test          # 16 tests, including the site's own key derivation + signing against the contract
```

### Deterministic addresses

All three contracts are created with CREATE2 through Arachnid's deterministic-deployment proxy (`0x4e59b44847b379578588920cA78FbF26c0B4956C`, present on Robinhood Chain and most EVM chains), from the creation bytecode `hardhat compile` exports to `src/lib/abi/`. The addresses are therefore known before the contracts exist and are the same whoever deploys them:

| Contract | Address |
| --- | --- |
| Droplock | `0xF4C1A0303661D31F3D73591E0b2B04E9bEAC0e73` |
| HoldsToken | `0xE6375005DcD26782751C110880714B3D8a32A727` |
| Cosign | `0x2CC7D8Bf0F9ea32007a27a5aBde5080eF984Df1C` |

Anyone can put them on the chain from the site's `/deploy` page with any wallet, or with a key:

```bash
cd contracts
cp .env.example .env    # DEPLOYER_PRIVATE_KEY — pays gas once, keeps no power
npm run deploy:robinhood
```

Any change to the Solidity source (or the compiler settings) changes the bytecode and therefore the addresses; the site and the scripts both read the exported bytecode, so they cannot drift from each other — but a recompiled contract is a different address, never a swap.

## Site (root)

Next 16 (App Router) · Tailwind 4 · wagmi 2 / viem / RainbowKit · three.js.

```bash
npm ci
cp .env.example .env.local   # optional: WalletConnect id, site URL
npm run dev                  # http://localhost:3000
npm run build
```

Routes: `/` landing · `/drop` seal a box · `/b/<id>#<secret>` the box page (claim, cosigner release, reclaim) · `/mine` boxes dropped by the connected wallet · `/deploy` deterministic deployment.

The chain is Robinhood Chain (id 4663) by default; `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` / `NEXT_PUBLIC_EXPLORER_URL` point it elsewhere. The contract addresses need no configuration.

Deploying the site: import the repo in Vercel from the root — the Next app is at the root and `contracts/` is ignored by the build.

### Local rehearsal

```bash
cd contracts && npm run node          # hardhat node on :8560
cd contracts && npm run seed:local    # proxy + contracts at their real addresses, mock USDC/NFT, 8 boxes in every state
                                      # links + codes land in contracts/deployments/local-seed.json (gitignored)
# root .env.local: NEXT_PUBLIC_CHAIN_ID=31337  NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8560
npm run dev
```

`scripts/dev-wallet.js` is a `window.ethereum` stub that forwards to the node (paste it in the console); `scripts/capture.mjs` screenshots the site with headless Chrome (SwiftShader renders the WebGL). `docs/captures/` holds the screens from such a rehearsal.

## Security notes, honestly

- A link is a bearer instrument. Whoever has it can claim — like cash in an envelope. Add a code and an expiry for anything that matters.
- The secret exists only in the link. Nothing can regenerate it. A lost link means the box waits for its expiry; a box with no expiry that nobody opens stays sealed forever. The form says so.
- The code's strength is the code's entropy: the KDF makes each guess cost ~0.3 s, the 128-bit link secret salts it, and the "suggest four words" button gives 44 bits. Anything shorter than four words is guessable by someone who has the link.
- The contracts are not audited.

## Design

Glacier glass: a light ice page, deep cold navy for text, one accent (glacier azure) for actions, frosted panels with a real `backdrop-filter`. The hero is five solid glass blocks in three.js (`MeshPhysicalMaterial` transmission, front faces only, no depth write) each holding a lacquered token, refracting a painted copy of the page that is drawn only into the transmission pass. Opening a box is the token rising out of the block. No raster asset anywhere: the studio environment is painted at runtime.
