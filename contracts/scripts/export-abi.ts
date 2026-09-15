import hre from "hardhat";
import { exportAbis, frontendAbiDir } from "./lib/exportAbi";

exportAbis(hre)
  .then(() => console.log(`exported to ${frontendAbiDir}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
