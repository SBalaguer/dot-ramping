import {
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
  configureBasejumpEmitter,
  deployBasejumpEmitter,
  deployFactory,
  deployLockingNtt,
  setNttPeer,
} from "@onramp/contracts";
import { forkContracts } from "@onramp/forks";
import { factoryConfig } from "@onramp/routes";

const USDC_DECIMALS = 6;
/** Flat Basejump fee per transfer, the value Hydration runs in production (0.1 USDC). */
const ASSET_FEE = 100_000n;

const relayer = relayerAccount();
const by = actor("sepolia", relayer);
const { core, chainId } = WORMHOLE_TESTNET.sepolia;

const deployment = readPartialDeployment("sepolia");
const record = (update: Partial<Deployments["sepolia"]>): void => {
  Object.assign(deployment, update);
  writeDeployment("sepolia", deployment);
  for (const [name, address] of Object.entries(update)) console.log(`${name.padEnd(16)} ${address}`);
};

if (!deployment.nttManager || !deployment.nttTransceiver) {
  const ntt = await deployLockingNtt(by, { token: SEPOLIA_USDC, wormholeCore: core, wormholeChainId: chainId });
  await setNttPeer(by, ntt.manager, {
    wormholeChainId: HYDRATION_WORMHOLE_CHAIN_ID,
    manager: HYDRATION_USDC_NTT_MANAGER,
    tokenDecimals: USDC_DECIMALS,
  });
  record({ nttManager: ntt.manager, nttTransceiver: ntt.transceiver });
}
const nttManager = deployment.nttManager!;

if (!deployment.basejumpEmitter) {
  const emitter = await deployBasejumpEmitter(by, core);
  await configureBasejumpEmitter(by, emitter, {
    landing: forkContracts(relayer.address).basejumpLanding,
    token: SEPOLIA_USDC,
    nttManager,
    assetFee: ASSET_FEE,
  });
  record({ basejumpEmitter: emitter });
}
const basejumpEmitter = deployment.basejumpEmitter!;

const config = factoryConfig(factoryOwner(), relayer.address, { basejumpEmitter });
record({ factory: await deployFactory(by.wallet, by.reader, config) });
