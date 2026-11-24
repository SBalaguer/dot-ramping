import {
  HYDRATION_ASSET,
  SEPOLIA_USDC,
  WORMHOLE_TESTNET,
  hydrationAssetAddress,
  publicClient,
  readDeployment,
} from "@onramp/chains";
import {
  basejumpEmitterAbi,
  connectBasejumpReceiver,
  deployBasejumpLanding,
  deployBasejumpReceiver,
  type Actor,
} from "@onramp/contracts";
import type { Network } from "@whm/chopsticks";
import { pad, type Address } from "viem";

import { truncatedAccount } from "./evm-account";

const LANDING_LIQUIDITY = 1_000_000n * 10n ** 6n;

export interface BasejumpDestination {
  landing: Address;
  receiver: Address;
}

/**
 * The Hydration end of our Basejump corridor: a landing that pays out Wormhole USDC and a receiver that only
 * accepts our Sepolia emitter. The landing's liquidity is written into storage; governance funds it in production.
 */
export async function deployBasejumpDestination(
  hydration: Network,
  operator: Actor,
  wormholeCore: Address,
): Promise<BasejumpDestination> {
  const emitter = readDeployment("sepolia").basejumpEmitter;
  const landing = await deployBasejumpLanding(operator);
  const receiver = await deployBasejumpReceiver(operator, wormholeCore);
  await connectBasejumpReceiver(operator, {
    receiver,
    landing,
    emitterChain: WORMHOLE_TESTNET.sepolia.chainId,
    emitter,
    sourceToken: SEPOLIA_USDC,
    payoutAsset: hydrationAssetAddress(HYDRATION_ASSET.wormholeUsdc),
  });

  // The settlement leg is addressed to whatever landing the emitter names; it must be the one that pays out.
  const settledTo = await publicClient("sepolia").readContract({
    address: emitter,
    abi: basejumpEmitterAbi,
    functionName: "landing",
  });
  if (settledTo !== pad(landing).toLowerCase()) {
    throw new Error(`the Sepolia emitter settles to ${settledTo}, not to the fork landing ${landing}`);
  }

  await hydration.setStorage({
    Tokens: { Accounts: [[[truncatedAccount(landing), HYDRATION_ASSET.wormholeUsdc], { free: LANDING_LIQUIDITY }]] },
  });
  return { landing, receiver };
}
