import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { CONTRACT_NAMES, DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODE, deployTx, initCodeHash, predictedAddress, SALTS } from "../../src/lib/deploy";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";

/**
 * Puts Droplock, HoldsToken and Cosign on the chain at their deterministic
 * addresses — the same ones the site computes and the /deploy page uses —
 * through Arachnid's deterministic-deployment proxy (CREATE2). Anyone can
 * run it; the deployer pays gas and gets nothing else: the contracts have
 * no owner.
 *
 *   npm run deploy:robinhood   (DEPLOYER_PRIVATE_KEY in contracts/.env)
 *   npm run deploy:local       (against `npm run node`; installs the proxy first)
 *
 * Code already at an address is left alone and recorded anyway. The init
 * code comes from src/lib/abi/<Name>.bytecode.json (exported by `hardhat
 * compile`), so the addresses cannot drift from the site.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer: set DEPLOYER_PRIVATE_KEY in contracts/.env");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`network ${network.name} chainId ${chainId} deployer ${deployer.address}`);

  if ((await ethers.provider.getCode(DETERMINISTIC_DEPLOYER)) === "0x") {
    if (network.name === "localhost" || network.name === "hardhat") {
      await network.provider.send("hardhat_setCode", [DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODE]);
      console.log(`installed the deterministic deployer at ${DETERMINISTIC_DEPLOYER} (local network)`);
    } else {
      throw new Error(`no deterministic deployer at ${DETERMINISTIC_DEPLOYER} on chain ${chainId}`);
    }
  }

  const txHashes: Record<string, string | null> = {};
  for (const name of CONTRACT_NAMES) {
    const expected = predictedAddress(name);
    console.log(`${name}: salt ${SALTS[name]} init code hash ${initCodeHash(name)} → ${expected}`);
    if ((await ethers.provider.getCode(expected)) !== "0x") {
      console.log(`  already deployed — nothing to send`);
      txHashes[name] = null;
      continue;
    }
    const tx = deployTx(name);
    const sent = await deployer.sendTransaction({ to: tx.to, data: tx.data });
    console.log(`  sent ${sent.hash}, waiting…`);
    const receipt = await sent.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`${name}: deployment reverted`);
    if ((await ethers.provider.getCode(expected)) === "0x") throw new Error(`${name}: no code at ${expected} after the transaction`);
    console.log(`  mined in block ${receipt.blockNumber}, gas ${receipt.gasUsed}`);
    txHashes[name] = sent.hash;
  }

  const droplock = await ethers.getContractAt("Droplock", predictedAddress("Droplock"));
  const domain = await droplock.eip712Domain();
  if (domain.name !== "DROPLOCK" || domain.verifyingContract.toLowerCase() !== predictedAddress("Droplock").toLowerCase()) {
    throw new Error("the Droplock at the predicted address does not sign the expected domain");
  }
  const cosign = await ethers.getContractAt("Cosign", predictedAddress("Cosign"));
  if ((await cosign.droplock()).toLowerCase() !== predictedAddress("Droplock").toLowerCase()) {
    throw new Error("Cosign is bound to another Droplock");
  }
  console.log(`Droplock ${predictedAddress("Droplock")} count ${await droplock.count()} — Cosign bound to it`);

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    droplock: predictedAddress("Droplock"),
    holdsToken: predictedAddress("HoldsToken"),
    cosign: predictedAddress("Cosign"),
    deployedAt: new Date().toISOString(),
    txHashes,
  };
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, `${network.name === "hardhat" || network.name === "localhost" ? "local" : network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
