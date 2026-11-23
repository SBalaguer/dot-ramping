import {
  HYDRATION_WORMHOLE_CHAIN_ID,
  WORMHOLE_TESTNET,
  latestSignedVaa,
  publicClient,
  wormholeCoreAbi,
} from "@onramp/chains";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { PolkadotForks } from "../polkadot";
import { fundEvmDeployer } from "../setup/evm-account";
import { deployTestnetWormholeCore } from "../setup/wormhole-core";

/** Hydration's production core, which trusts the mainnet guardian set. */
const HYDRATION_MAINNET_CORE: Address = "0x3792a6d63c31941B2805181771795D9176fA82A1";

async function verifies(core: Address, vaa: Hex): Promise<boolean> {
  try {
    const [, valid] = await publicClient("hydrationFork").readContract({
      address: core,
      abi: wormholeCoreAbi,
      functionName: "parseAndVerifyVM",
      args: [vaa],
    });
    return valid;
  } catch {
    return false;
  }
}

/** Flips one bit of the last payload byte, which the guardian signatures cover. */
function tampered(vaa: Hex): Hex {
  const lastByte = Number.parseInt(vaa.slice(-2), 16) ^ 1;
  return `${vaa.slice(0, -2)}${lastByte.toString(16).padStart(2, "0")}` as Hex;
}

/** The core deployed on the fork accepts a real guardian-signed Sepolia VAA and nothing else does or passes. */
export async function checkWormholeCore(forks: PolkadotForks): Promise<string> {
  const deployer = privateKeyToAccount(generatePrivateKey());
  await fundEvmDeployer(forks.hydration, deployer.address);
  const core = await deployTestnetWormholeCore(deployer);

  const chainId = await publicClient("hydrationFork").readContract({
    address: core,
    abi: wormholeCoreAbi,
    functionName: "chainId",
  });
  if (chainId !== HYDRATION_WORMHOLE_CHAIN_ID) throw new Error(`core reports Wormhole chain ${chainId}`);

  const vaa = await latestSignedVaa(WORMHOLE_TESTNET.sepolia.chainId);
  if (!vaa) throw new Error("Wormholescan has no Sepolia VAA to verify");
  if (!(await verifies(core, vaa.bytes))) throw new Error(`core ${core} rejected real VAA ${vaa.id}`);
  if (await verifies(core, tampered(vaa.bytes))) throw new Error("core accepted a tampered VAA");
  if (await verifies(HYDRATION_MAINNET_CORE, vaa.bytes)) {
    throw new Error("Hydration's mainnet core accepted a testnet VAA; the separate core is unnecessary");
  }

  return `core ${core} (Wormhole chain ${chainId}) verified Sepolia VAA ${vaa.id}; a tampered copy and Hydration's mainnet core reject`;
}
