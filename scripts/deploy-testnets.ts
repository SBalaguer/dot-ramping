import {
  BASE_SEPOLIA_AAVE_POOL,
  BASE_SEPOLIA_USDC,
  HYDRATION_USDC_NTT_MANAGER,
  HYDRATION_WORMHOLE_CHAIN_ID,
  SEPOLIA_USDC,
  WORMHOLE_TESTNET,
  factoryOwner,
  readPartialDeployment,
  relayerAccount,
  writeDeployment,
  type Deployments,
} from "@onramp/chains";
import {
  actor,
  bindPsmVault,
  configureBasejumpEmitter,
  deployBasejumpEmitter,
  deployFactory,
  deployLockingNtt,
  deployPsmVault,
  setNttPeer,
} from "@onramp/contracts";
import { parseAbi } from "viem";
import { forkContracts } from "@onramp/forks";
import { factoryConfig } from "@onramp/routes";

const USDC_DECIMALS = 6;
/** Flat Basejump fee per transfer, the value Hydration runs in production (0.1 USDC). */
const ASSET_FEE = 100_000n;

const aavePoolAbi = parseAbi([
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function getReserveAToken(address asset) view returns (address)",
]);

const relayer = relayerAccount();
const fork = forkContracts(relayer.address);

function recorder<K extends "sepolia" | "base-sepolia">(name: K) {
  const deployment = readPartialDeployment(name);
  const record = (update: Partial<Deployments[K]>): void => {
    Object.assign(deployment, update);
    writeDeployment(name, deployment);
    for (const [key, address] of Object.entries(update)) console.log(`${name.padEnd(13)} ${key.padEnd(16)} ${address}`);
  };
  return { deployment, record };
}

/** Sepolia: the NTT settlement rail for Circle USDC and Hydration's Basejump emitter on top of it. */
async function deploySepoliaBridges(): Promise<Deployments["sepolia"]["basejumpEmitter"]> {
  const by = actor("sepolia", relayer);
  const { core, chainId } = WORMHOLE_TESTNET.sepolia;
  const { deployment, record } = recorder("sepolia");

  if (!deployment.nttManager || !deployment.nttTransceiver) {
    const ntt = await deployLockingNtt(by, { token: SEPOLIA_USDC, wormholeCore: core, wormholeChainId: chainId });
    await setNttPeer(by, ntt.manager, {
      wormholeChainId: HYDRATION_WORMHOLE_CHAIN_ID,
      manager: HYDRATION_USDC_NTT_MANAGER,
      tokenDecimals: USDC_DECIMALS,
    });
    record({ nttManager: ntt.manager, nttTransceiver: ntt.transceiver });
  }
  if (!deployment.basejumpEmitter) {
    const emitter = await deployBasejumpEmitter(by, core);
    await configureBasejumpEmitter(by, emitter, {
      landing: fork.basejumpLanding,
      token: SEPOLIA_USDC,
      nttManager: deployment.nttManager!,
      assetFee: ASSET_FEE,
    });
    record({ basejumpEmitter: emitter });
  }
  return deployment.basejumpEmitter!;
}

/** Base Sepolia: Hydration's PSM vault over the USDC that Aave lists there, bound to the fork's facilitator. */
async function deployBaseSepoliaBridges(): Promise<Deployments["base-sepolia"]["psmVault"]> {
  const by = actor("baseSepolia", relayer);
  const { deployment, record } = recorder("base-sepolia");

  if (!deployment.psmVault) {
    const pool = { address: BASE_SEPOLIA_AAVE_POOL, abi: aavePoolAbi } as const;
    const [aaveAddressesProvider, aUsdc] = await Promise.all([
      by.reader.readContract({ ...pool, functionName: "ADDRESSES_PROVIDER" }),
      by.reader.readContract({ ...pool, functionName: "getReserveAToken", args: [BASE_SEPOLIA_USDC] }),
    ]);
    const vault = await deployPsmVault(by, {
      wormholeCore: WORMHOLE_TESTNET.baseSepolia.core,
      usdc: BASE_SEPOLIA_USDC,
      aUsdc,
      aaveAddressesProvider,
      hydrationChainId: HYDRATION_WORMHOLE_CHAIN_ID,
    });
    record({ psmVault: vault });
  }
  await bindPsmVault(by, deployment.psmVault!, HYDRATION_WORMHOLE_CHAIN_ID, fork.psmFacilitator);
  return deployment.psmVault!;
}

const config = factoryConfig(factoryOwner(), relayer.address, {
  basejumpEmitter: await deploySepoliaBridges(),
  psmVault: await deployBaseSepoliaBridges(),
});
for (const [chain, name] of [
  ["sepolia", "sepolia"],
  ["baseSepolia", "base-sepolia"],
] as const) {
  const by = actor(chain, relayer);
  recorder(name).record({ factory: await deployFactory(by.wallet, by.reader, config) });
}
