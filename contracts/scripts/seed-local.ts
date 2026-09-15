import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { AbiCoder, ZeroAddress, parseEther, parseUnits } from "ethers";
import type { Address } from "viem";
import { claimKeyAccount, claimKeyAddress, newSecret, signClaim } from "../../src/lib/keys";
import { DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODE, deployTx, predictedAddress, CONTRACT_NAMES } from "../../src/lib/deploy";
import { deploymentsDir } from "./lib/exportAbi";

/**
 * Browser rehearsal. Against `npm run node` (port 8560):
 *   - installs the CREATE2 proxy and the three contracts at their real addresses,
 *   - deploys a mock USDC (6 dec) and a mock NFT pass, mints both to the first accounts,
 *   - drops seven boxes in every state the site has to render,
 *   - writes the links (with their secrets and codes) to deployments/local-seed.json.
 *
 * Point the site at the node with .env.local:
 *   NEXT_PUBLIC_CHAIN_ID=31337
 *   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8560
 * and connect the browser through a stubbed window.ethereum (scripts/dev-wallet.js).
 */
const coder = AbiCoder.defaultAbiCoder();

async function main() {
  const [deployer, sender, alice, carol] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`seeding chain ${chainId} on ${network.name}`);

  if ((await ethers.provider.getCode(DETERMINISTIC_DEPLOYER)) === "0x") {
    await network.provider.send("hardhat_setCode", [DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODE]);
  }
  for (const name of CONTRACT_NAMES) {
    if ((await ethers.provider.getCode(predictedAddress(name))) === "0x") {
      const tx = deployTx(name);
      await (await deployer.sendTransaction({ to: tx.to, data: tx.data })).wait();
    }
    console.log(`${name} at ${predictedAddress(name)}`);
  }
  const droplock = await ethers.getContractAt("Droplock", predictedAddress("Droplock"));
  const cosign = await ethers.getContractAt("Cosign", predictedAddress("Cosign"));
  const holdsToken = predictedAddress("HoldsToken");

  const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const pass = await (await ethers.getContractFactory("MockERC721")).deploy();
  await pass.waitForDeployment();
  for (const a of [deployer, sender, alice]) await (await usdc.mint(a.address, parseUnits("25000", 6))).wait();
  await (await pass.mint(alice.address)).wait();
  console.log(`USDC ${await usdc.getAddress()} · PASS ${await pass.getAddress()}`);

  const droplockAddress = (await droplock.getAddress()) as Address;
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const seeds: Array<Record<string, unknown>> = [];

  async function drop(label: string, o: { token?: string; amount: bigint; code?: string; unlockAt?: number; expiresAt?: number; condition?: string; args?: string }) {
    const secret = newSecret();
    const code = o.code ?? "";
    const key = await claimKeyAddress(secret, code);
    const token = o.token ?? ZeroAddress;
    if (token !== ZeroAddress) {
      const erc20 = await ethers.getContractAt("MockERC20", token);
      await (await erc20.connect(sender).approve(droplockAddress, o.amount)).wait();
    }
    const tx = await droplock
      .connect(sender)
      .drop(token, o.amount, key, o.unlockAt ?? 0, o.expiresAt ?? 0, o.condition ?? ZeroAddress, o.args ?? "0x", { value: token === ZeroAddress ? o.amount : 0 });
    await tx.wait();
    const id = (await droplock.count()) - 1n;
    seeds.push({ id: Number(id), label, secret, code, link: `http://localhost:3860/b/${id}#${secret}` });
    console.log(`#${id} ${label}`);
    return { id, secret, code };
  }

  await drop("0.25 ETH · open · link only", { amount: parseEther("0.25"), expiresAt: now + 30 * 86400 });
  await drop("0.1 ETH · code required", { amount: parseEther("0.1"), code: "glacier honey ritual twelve", expiresAt: now + 30 * 86400 });
  await drop("1 000 USDC · opens in 2 days", { token: await usdc.getAddress(), amount: parseUnits("1000", 6), unlockAt: now + 2 * 86400, expiresAt: now + 32 * 86400 });
  await drop("0.05 ETH · holders of PASS only", {
    amount: parseEther("0.05"),
    condition: holdsToken,
    args: coder.encode(["address", "uint256"], [await pass.getAddress(), 1n]),
    expiresAt: now + 30 * 86400,
  });
  await drop("0.5 ETH · cosigned by carol", { amount: parseEther("0.5"), condition: predictedAddress("Cosign"), args: coder.encode(["address"], [carol.address]) });
  const claimed = await drop("0.02 ETH · already claimed", { amount: parseEther("0.02") });
  const account = await claimKeyAccount(claimed.secret, claimed.code);
  const sig = await signClaim(account, { chainId, verifyingContract: droplockAddress, boxId: claimed.id, recipient: alice.address as Address });
  await (await droplock.connect(alice).claim(claimed.id, alice.address, sig, "0x")).wait();
  await drop("0.03 ETH · expired", { amount: parseEther("0.03"), expiresAt: now + 120 });
  await drop("250 USDC · code + cosign", {
    token: await usdc.getAddress(),
    amount: parseUnits("250", 6),
    code: "tahiti",
    condition: predictedAddress("Cosign"),
    args: coder.encode(["address"], [carol.address]),
    expiresAt: now + 60 * 86400,
  });
  await network.provider.send("evm_increaseTime", [130]);
  await network.provider.send("evm_mine", []);
  console.log(`cosigner carol ${carol.address} · claimed by alice ${alice.address}`);

  const record = {
    chainId,
    droplock: droplockAddress,
    holdsToken,
    cosign: await cosign.getAddress(),
    usdc: await usdc.getAddress(),
    pass: await pass.getAddress(),
    accounts: { deployer: deployer.address, sender: sender.address, alice: alice.address, carol: carol.address },
    boxes: seeds,
  };
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, "local-seed.json");
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
