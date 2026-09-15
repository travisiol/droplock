import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AbiCoder, ZeroAddress, parseEther, type Signer } from "ethers";
import type { Address } from "viem";
import { claimKeyAccount, claimKeyAddress, decodeSecret, encodeSecret, newSecret, normalizeCode, signClaim } from "../../src/lib/keys";
import { CONTRACT_NAMES, DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODE, deployTx, predictedAddress } from "../../src/lib/deploy";

const coder = AbiCoder.defaultAbiCoder();
const NONE = "0x";

/**
 * The claim path is exercised with the site's own key derivation and
 * signing (src/lib/keys.ts), so what a browser produces is what the
 * contract verifies.
 */
describe("Droplock", () => {
  async function deploy() {
    const [deployer, sender, alice, bob, carol] = await ethers.getSigners();
    const droplock = await (await ethers.getContractFactory("Droplock")).deploy();
    await droplock.waitForDeployment();
    const holdsToken = await (await ethers.getContractFactory("HoldsToken")).deploy();
    const cosign = await (await ethers.getContractFactory("Cosign")).deploy(await droplock.getAddress());
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const pass = await (await ethers.getContractFactory("MockERC721")).deploy();
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const verifyingContract = (await droplock.getAddress()) as Address;
    return { deployer, sender, alice, bob, carol, droplock, holdsToken, cosign, usdc, pass, chainId, verifyingContract };
  }

  type Ctx = Awaited<ReturnType<typeof deploy>>;

  /** Drops `eth` behind a fresh secret (+ code) and returns what a link + a claimer need. */
  async function dropEth(ctx: Ctx, eth: string, opts: { code?: string; unlockAt?: number; expiresAt?: number; condition?: string; args?: string } = {}) {
    const secret = newSecret();
    const code = opts.code ?? "";
    const key = await claimKeyAddress(secret, code);
    const tx = await ctx.droplock
      .connect(ctx.sender)
      .drop(ZeroAddress, parseEther(eth), key, opts.unlockAt ?? 0, opts.expiresAt ?? 0, opts.condition ?? ZeroAddress, opts.args ?? NONE, { value: parseEther(eth) });
    await tx.wait();
    const id = (await ctx.droplock.count()) - 1n;
    return { id, secret, code, key, tx };
  }

  async function signature(ctx: Ctx, secret: string, code: string, id: bigint, recipient: string) {
    const account = await claimKeyAccount(secret, code);
    return signClaim(account, { chainId: ctx.chainId, verifyingContract: ctx.verifyingContract, boxId: id, recipient: recipient as Address });
  }

  async function claimAs(ctx: Ctx, caller: Signer, id: bigint, recipient: string, secret: string, code: string, proof = NONE) {
    const sig = await signature(ctx, secret, code, id, recipient);
    return ctx.droplock.connect(caller).claim(id, recipient, sig, proof);
  }

  // ───────────────────────────── secrets ─────────────────────────────

  it("encodes a 16-byte secret as 22 url-safe characters and back", () => {
    for (let i = 0; i < 20; i++) {
      const s = newSecret();
      expect(s).to.match(/^[A-Za-z0-9_-]{22}$/);
      expect(encodeSecret(decodeSecret(s)!)).to.equal(s);
    }
    expect(decodeSecret("too-short")).to.equal(null);
    expect(decodeSecret("A".repeat(21) + "!")).to.equal(null);
  });

  it("derives the same key address from the same link and code, and a different one from any other", async () => {
    const secret = newSecret();
    const a = await claimKeyAddress(secret, "glacier honey ritual twelve");
    const b = await claimKeyAddress(secret, "  Glacier   HONEY ritual twelve ");
    const c = await claimKeyAddress(secret, "glacier honey ritual eleven");
    const d = await claimKeyAddress(newSecret(), "glacier honey ritual twelve");
    const e = await claimKeyAddress(secret, "");
    expect(a).to.equal(b);
    expect(a).to.not.equal(c);
    expect(a).to.not.equal(d);
    expect(a).to.not.equal(e);
    expect(normalizeCode("  Glacier   HONEY ritual twelve ")).to.equal("glacier honey ritual twelve");
  });

  // ───────────────────────────── drop ─────────────────────────────

  it("drops ETH into a box and records it under the sender", async () => {
    const ctx = await deploy();
    const { id, key, tx } = await dropEth(ctx, "1");
    expect(id).to.equal(0n);
    expect(await ctx.droplock.count()).to.equal(1n);
    const box = await ctx.droplock.getBox(id);
    expect(box.sender).to.equal(ctx.sender.address);
    expect(box.token).to.equal(ZeroAddress);
    expect(box.amount).to.equal(parseEther("1"));
    expect(box.key).to.equal(key);
    expect(box.unlockAt).to.equal(0n);
    expect(box.expiresAt).to.equal(0n);
    expect(box.status).to.equal(0n);
    expect(box.condition).to.equal(ZeroAddress);
    expect(await ctx.droplock.stateOf(id)).to.equal(1n); // Open
    expect(await ctx.droplock.boxesOf(ctx.sender.address)).to.deep.equal([0n]);
    expect(await ethers.provider.getBalance(await ctx.droplock.getAddress())).to.equal(parseEther("1"));
    await expect(tx).to.emit(ctx.droplock, "Dropped").withArgs(0n, ctx.sender.address, ZeroAddress, parseEther("1"), key, 0n, 0n, ZeroAddress);
  });

  it("drops an ERC-20 and records what actually arrived", async () => {
    const ctx = await deploy();
    await ctx.usdc.mint(ctx.sender.address, 1_000_000_000n);
    await ctx.usdc.connect(ctx.sender).approve(await ctx.droplock.getAddress(), 250_000_000n);
    const key = await claimKeyAddress(newSecret(), "");
    await ctx.droplock.connect(ctx.sender).drop(await ctx.usdc.getAddress(), 250_000_000n, key, 0, 0, ZeroAddress, NONE);
    expect((await ctx.droplock.getBox(0)).amount).to.equal(250_000_000n);

    const fee = await (await ethers.getContractFactory("FeeOnTransferERC20")).deploy();
    await fee.mint(ctx.sender.address, parseEther("100"));
    await fee.connect(ctx.sender).approve(await ctx.droplock.getAddress(), parseEther("100"));
    await ctx.droplock.connect(ctx.sender).drop(await fee.getAddress(), parseEther("100"), key, 0, 0, ZeroAddress, NONE);
    expect((await ctx.droplock.getBox(1)).amount).to.equal(parseEther("99"));
    expect(await ctx.droplock.boxesOf(ctx.sender.address)).to.deep.equal([0n, 1n]);
  });

  it("refuses a box that could never be built right", async () => {
    const ctx = await deploy();
    const key = await claimKeyAddress(newSecret(), "");
    const now = await time.latest();
    const d = ctx.droplock.connect(ctx.sender);
    await expect(d.drop(ZeroAddress, parseEther("1"), ZeroAddress, 0, 0, ZeroAddress, NONE, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "ZeroKey");
    await expect(d.drop(ZeroAddress, parseEther("1"), key, 0, 0, ZeroAddress, NONE, { value: parseEther("2") })).to.be.revertedWithCustomError(ctx.droplock, "BadValue");
    await expect(d.drop(ZeroAddress, 0, key, 0, 0, ZeroAddress, NONE)).to.be.revertedWithCustomError(ctx.droplock, "BadValue");
    await expect(d.drop(await ctx.usdc.getAddress(), 1, key, 0, 0, ZeroAddress, NONE, { value: 1 })).to.be.revertedWithCustomError(ctx.droplock, "BadValue");
    await expect(d.drop(await ctx.usdc.getAddress(), 0, key, 0, 0, ZeroAddress, NONE)).to.be.revertedWithCustomError(ctx.droplock, "ZeroAmount");
    await expect(d.drop(ZeroAddress, parseEther("1"), key, 0, now - 1, ZeroAddress, NONE, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "BadWindow");
    await expect(d.drop(ZeroAddress, parseEther("1"), key, now + 200, now + 100, ZeroAddress, NONE, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "BadWindow");
    // A condition must be a contract that accepts the arguments.
    await expect(d.drop(ZeroAddress, parseEther("1"), key, 0, 0, ctx.alice.address, NONE, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "BadCondition");
    const badArgs = coder.encode(["address", "uint256"], [ctx.alice.address, 1]); // not a token
    await expect(d.drop(ZeroAddress, parseEther("1"), key, 0, 0, await ctx.holdsToken.getAddress(), badArgs, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "BadCondition");
    const zeroMin = coder.encode(["address", "uint256"], [await ctx.usdc.getAddress(), 0]);
    await expect(d.drop(ZeroAddress, parseEther("1"), key, 0, 0, await ctx.holdsToken.getAddress(), zeroMin, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "BadCondition");
    const noCosigner = coder.encode(["address"], [ZeroAddress]);
    await expect(d.drop(ZeroAddress, parseEther("1"), key, 0, 0, await ctx.cosign.getAddress(), noCosigner, { value: parseEther("1") })).to.be.revertedWithCustomError(ctx.droplock, "BadCondition");
  });

  // ───────────────────────────── claim ─────────────────────────────

  it("opens for the signature holder, to the recipient the signature names, sent by anyone", async () => {
    const ctx = await deploy();
    const { id, secret } = await dropEth(ctx, "1");
    const before = await ethers.provider.getBalance(ctx.alice.address);
    // Bob relays alice's claim: the contents go to alice, bob only pays gas.
    const tx = await claimAs(ctx, ctx.bob, id, ctx.alice.address, secret, "");
    await expect(tx).to.emit(ctx.droplock, "Claimed").withArgs(id, ctx.alice.address, ctx.bob.address);
    expect((await ethers.provider.getBalance(ctx.alice.address)) - before).to.equal(parseEther("1"));
    expect((await ctx.droplock.getBox(id)).status).to.equal(1n);
    expect(await ctx.droplock.stateOf(id)).to.equal(2n); // Claimed
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "NotSealed");
    await expect(ctx.droplock.connect(ctx.sender).reclaim(id)).to.be.revertedWithCustomError(ctx.droplock, "NotSealed");
  });

  it("a signature for one recipient cannot be redirected to another", async () => {
    const ctx = await deploy();
    const { id, secret } = await dropEth(ctx, "1");
    const sigForAlice = await signature(ctx, secret, "", id, ctx.alice.address);
    // Seen in the mempool, replayed towards bob.
    await expect(ctx.droplock.connect(ctx.bob).claim(id, ctx.bob.address, sigForAlice, NONE)).to.be.revertedWithCustomError(ctx.droplock, "BadSignature");
    // And a signature for another box does not open this one.
    const other = await dropEth(ctx, "1");
    const sigOther = await signature(ctx, other.secret, "", other.id, ctx.alice.address);
    await expect(ctx.droplock.connect(ctx.alice).claim(id, ctx.alice.address, sigOther, NONE)).to.be.revertedWithCustomError(ctx.droplock, "BadSignature");
    await expect(ctx.droplock.connect(ctx.alice).claim(id, ctx.alice.address, "0x1234", NONE)).to.be.revertedWithCustomError(ctx.droplock, "BadSignature");
    await expect(ctx.droplock.connect(ctx.alice).claim(id, ZeroAddress, sigForAlice, NONE)).to.be.revertedWithCustomError(ctx.droplock, "ZeroRecipient");
    await expect(ctx.droplock.connect(ctx.alice).claim(99n, ctx.alice.address, sigForAlice, NONE)).to.be.revertedWithCustomError(ctx.droplock, "NoSuchBox");
    expect(await ctx.droplock.isClaimSignature(id, ctx.alice.address, sigForAlice)).to.equal(true);
    expect(await ctx.droplock.isClaimSignature(id, ctx.bob.address, sigForAlice)).to.equal(false);
  });

  it("with a code, the link alone is not enough", async () => {
    const ctx = await deploy();
    const { id, secret } = await dropEth(ctx, "0.5", { code: "glacier honey ritual twelve" });
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "BadSignature");
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "glacier honey ritual eleven")).to.be.revertedWithCustomError(ctx.droplock, "BadSignature");
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "GLACIER honey  ritual twelve")).to.emit(ctx.droplock, "Claimed");
  });

  it("delivers ERC-20 boxes", async () => {
    const ctx = await deploy();
    await ctx.usdc.mint(ctx.sender.address, 1_000_000n);
    await ctx.usdc.connect(ctx.sender).approve(await ctx.droplock.getAddress(), 1_000_000n);
    const secret = newSecret();
    await ctx.droplock.connect(ctx.sender).drop(await ctx.usdc.getAddress(), 1_000_000n, await claimKeyAddress(secret, ""), 0, 0, ZeroAddress, NONE);
    await claimAs(ctx, ctx.alice, 0n, ctx.alice.address, secret, "");
    expect(await ctx.usdc.balanceOf(ctx.alice.address)).to.equal(1_000_000n);
    expect(await ctx.usdc.balanceOf(await ctx.droplock.getAddress())).to.equal(0n);
  });

  it("does not lose a box whose recipient refuses ETH", async () => {
    const ctx = await deploy();
    const rejector = await (await ethers.getContractFactory("Rejector")).deploy();
    const { id, secret } = await dropEth(ctx, "1");
    await expect(claimAs(ctx, ctx.alice, id, await rejector.getAddress(), secret, "")).to.be.revertedWithCustomError(ctx.droplock, "NativeSendFailed");
    expect((await ctx.droplock.getBox(id)).status).to.equal(0n);
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.emit(ctx.droplock, "Claimed");
  });

  // ───────────────────────────── date & expiry ─────────────────────────────

  it("a dated box opens on the date, not before", async () => {
    const ctx = await deploy();
    const unlockAt = (await time.latest()) + 7 * 86400;
    const { id, secret } = await dropEth(ctx, "1", { unlockAt });
    expect(await ctx.droplock.stateOf(id)).to.equal(0n); // Locked
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "NotYet");
    await time.increaseTo(unlockAt);
    expect(await ctx.droplock.stateOf(id)).to.equal(1n); // Open
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.emit(ctx.droplock, "Claimed");
  });

  it("an expired box closes to claims and returns to the sender, and only the sender", async () => {
    const ctx = await deploy();
    const now = await time.latest();
    const { id, secret } = await dropEth(ctx, "1", { unlockAt: now + 100, expiresAt: now + 1000 });
    await expect(ctx.droplock.connect(ctx.sender).reclaim(id)).to.be.revertedWithCustomError(ctx.droplock, "NotExpired");
    await time.increaseTo(now + 1000);
    expect(await ctx.droplock.stateOf(id)).to.equal(3n); // Expired
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "WindowClosed");
    await expect(ctx.droplock.connect(ctx.alice).reclaim(id)).to.be.revertedWithCustomError(ctx.droplock, "NotSender");
    const before = await ethers.provider.getBalance(ctx.sender.address);
    const tx = await ctx.droplock.connect(ctx.sender).reclaim(id);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    await expect(tx).to.emit(ctx.droplock, "Reclaimed").withArgs(id, ctx.sender.address);
    expect((await ethers.provider.getBalance(ctx.sender.address)) - before + gas).to.equal(parseEther("1"));
    expect(await ctx.droplock.stateOf(id)).to.equal(4n); // Reclaimed
    await expect(ctx.droplock.connect(ctx.sender).reclaim(id)).to.be.revertedWithCustomError(ctx.droplock, "NotSealed");

    // A box without expiry never returns.
    const forever = await dropEth(ctx, "1");
    await time.increase(365 * 86400);
    await expect(ctx.droplock.connect(ctx.sender).reclaim(forever.id)).to.be.revertedWithCustomError(ctx.droplock, "NotExpired");
  });

  // ───────────────────────────── conditions ─────────────────────────────

  it("HoldsToken: opens only for a holder of the token — ERC-20 or ERC-721", async () => {
    const ctx = await deploy();
    const holds = await ctx.holdsToken.getAddress();
    const erc20Args = coder.encode(["address", "uint256"], [await ctx.usdc.getAddress(), 100n]);
    const a = await dropEth(ctx, "1", { condition: holds, args: erc20Args });
    expect(await ctx.droplock.conditionMet(a.id, ctx.alice.address, NONE)).to.equal(false);
    await expect(claimAs(ctx, ctx.alice, a.id, ctx.alice.address, a.secret, "")).to.be.revertedWithCustomError(ctx.droplock, "ConditionFailed");
    await ctx.usdc.mint(ctx.alice.address, 99n);
    await expect(claimAs(ctx, ctx.alice, a.id, ctx.alice.address, a.secret, "")).to.be.revertedWithCustomError(ctx.droplock, "ConditionFailed");
    await ctx.usdc.mint(ctx.alice.address, 1n);
    expect(await ctx.droplock.conditionMet(a.id, ctx.alice.address, NONE)).to.equal(true);
    await expect(claimAs(ctx, ctx.alice, a.id, ctx.alice.address, a.secret, "")).to.emit(ctx.droplock, "Claimed");

    const nftArgs = coder.encode(["address", "uint256"], [await ctx.pass.getAddress(), 1n]);
    const b = await dropEth(ctx, "1", { condition: holds, args: nftArgs });
    await expect(claimAs(ctx, ctx.bob, b.id, ctx.bob.address, b.secret, "")).to.be.revertedWithCustomError(ctx.droplock, "ConditionFailed");
    await ctx.pass.mint(ctx.bob.address);
    await expect(claimAs(ctx, ctx.bob, b.id, ctx.bob.address, b.secret, "")).to.emit(ctx.droplock, "Claimed");
  });

  it("Cosign: opens only once the named cosigner has released it", async () => {
    const ctx = await deploy();
    const cosign = await ctx.cosign.getAddress();
    const args = coder.encode(["address"], [ctx.carol.address]);
    const { id, secret } = await dropEth(ctx, "1", { condition: cosign, args });
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "ConditionFailed");
    // Someone else saying yes changes nothing.
    await ctx.cosign.connect(ctx.bob).release(id);
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "ConditionFailed");
    await expect(ctx.cosign.connect(ctx.carol).release(id)).to.emit(ctx.cosign, "Released").withArgs(id, ctx.carol.address);
    expect(await ctx.cosign.released(id, ctx.carol.address)).to.equal(true);
    expect(await ctx.droplock.conditionMet(id, ctx.alice.address, NONE)).to.equal(true);
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.emit(ctx.droplock, "Claimed");
    // The condition only answers its own Droplock.
    await expect(ctx.cosign.check(id, ctx.alice.address, args, NONE)).to.be.revertedWithCustomError(ctx.cosign, "NotDroplock");
    expect(await ctx.cosign.droplock()).to.equal(await ctx.droplock.getAddress());
  });

  it("a condition and a code and a date all apply at once", async () => {
    const ctx = await deploy();
    const now = await time.latest();
    const args = coder.encode(["address", "uint256"], [await ctx.usdc.getAddress(), 1n]);
    const { id, secret, code } = await dropEth(ctx, "1", { code: "tahiti", unlockAt: now + 100, condition: await ctx.holdsToken.getAddress(), args });
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, code)).to.be.revertedWithCustomError(ctx.droplock, "NotYet");
    await time.increaseTo(now + 100);
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, "")).to.be.revertedWithCustomError(ctx.droplock, "BadSignature");
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, code)).to.be.revertedWithCustomError(ctx.droplock, "ConditionFailed");
    await ctx.usdc.mint(ctx.alice.address, 1n);
    await expect(claimAs(ctx, ctx.alice, id, ctx.alice.address, secret, code)).to.emit(ctx.droplock, "Claimed");
  });

  // ───────────────────────────── deterministic deployment ─────────────────────────────

  it("deploys all three at their predicted addresses through the CREATE2 proxy, from any wallet", async () => {
    const [, , alice] = await ethers.getSigners();
    await network.provider.send("hardhat_setCode", [DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODE]);
    for (const name of CONTRACT_NAMES) {
      const expected = predictedAddress(name);
      expect(await ethers.provider.getCode(expected)).to.equal("0x");
      const tx = deployTx(name);
      await (await alice.sendTransaction({ to: tx.to, data: tx.data })).wait();
      expect(await ethers.provider.getCode(expected), name).to.not.equal("0x");
    }
    const droplock = await ethers.getContractAt("Droplock", predictedAddress("Droplock"));
    expect(await droplock.count()).to.equal(0n);
    const cosign = await ethers.getContractAt("Cosign", predictedAddress("Cosign"));
    expect(await cosign.droplock()).to.equal(predictedAddress("Droplock"));
    // The proxy refuses to deploy the same salt + code twice.
    const again = deployTx("Droplock");
    await expect(alice.sendTransaction({ to: again.to, data: again.data })).to.be.reverted;
    // The EIP-712 domain the site signs against is the deployed one.
    const domain = await droplock.eip712Domain();
    expect(domain.name).to.equal("DROPLOCK");
    expect(domain.version).to.equal("1");
    expect(domain.verifyingContract).to.equal(predictedAddress("Droplock"));
  });
});
