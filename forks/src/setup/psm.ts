import { hydration as hydrationDescriptors } from "@galacticcouncil/descriptors";
import {
  HOLLAR_TOKEN,
  HYDRATION_WORMHOLE_CHAIN_ID,
  WORMHOLE_TESTNET,
  publicClient,
  readDeployment,
} from "@onramp/chains";
import { deployPsmFacilitator, ghoTokenAbi, openPsmFacilitator, psmVaultAbi, type Actor } from "@onramp/contracts";
import type { Network } from "@whm/chopsticks";
import { AccountId } from "polkadot-api";
import { encodeFunctionData, getAddress, hexToBytes, pad, toHex, type Address } from "viem";

import { enactAsEconomicParameters } from "./governance";

const BUCKET_CAPACITY = 1_000_000n * 10n ** 18n;
const LABEL = "Onramp POC PSM (Base Sepolia USDC)";
const ADD_FACILITATOR_GAS = 300_000n;
const MAX_FEE_PER_GAS = 10n ** 10n;
const u256 = (value: bigint): [bigint, bigint, bigint, bigint] => [value, 0n, 0n, 0n];

/**
 * HOLLAR only lets its facilitator manager add a mint bucket, and that manager is a governance-controlled
 * account. The bucket is granted by enacting the call Hydration governance would vote on.
 */
async function grantMintBucket(hydration: Network, facilitator: Address): Promise<void> {
  const api = hydration.client.getTypedApi(hydrationDescriptors);
  // Not in the typed descriptors: the account `dispatch_as_aave_manager` dispatches as.
  const manager = (await hydration.client
    .getUnsafeApi()
    .query.Dispatcher!.AaveManagerAccount!.getValue({ at: "best" })) as string;
  const addFacilitator = encodeFunctionData({
    abi: ghoTokenAbi,
    functionName: "addFacilitator",
    args: [facilitator, LABEL, BUCKET_CAPACITY],
  });
  await enactAsEconomicParameters(
    hydration,
    api.tx.Dispatcher.dispatch_as_aave_manager({
      call: api.tx.EVM.call({
        source: getAddress(toHex(AccountId().enc(manager).slice(0, 20))),
        target: HOLLAR_TOKEN,
        input: hexToBytes(addFacilitator),
        value: u256(0n),
        gas_limit: ADD_FACILITATOR_GAS,
        max_fee_per_gas: u256(MAX_FEE_PER_GAS),
        max_priority_fee_per_gas: undefined,
        nonce: undefined,
        access_list: [],
        authorization_list: [],
      }).decodedCall,
    }),
  );

  const granted = await publicClient("hydrationFork").readContract({
    address: HOLLAR_TOKEN,
    abi: ghoTokenAbi,
    functionName: "getFacilitator",
    args: [facilitator],
  });
  if (granted.bucketCapacity !== BUCKET_CAPACITY) {
    throw new Error(`HOLLAR did not grant ${facilitator} a mint bucket (capacity ${granted.bucketCapacity})`);
  }
}

/**
 * The Hydration end of our peg stability module: a facilitator bound to our vault on Base Sepolia, with a
 * HOLLAR mint bucket and Hydration's launch limits, open for minting.
 */
export async function deployPsmDestination(
  hydration: Network,
  operator: Actor,
  wormholeCore: Address,
): Promise<Address> {
  const { chainId } = WORMHOLE_TESTNET.baseSepolia;
  const vault = readDeployment("base-sepolia").psmVault;
  const facilitator = await deployPsmFacilitator(operator, {
    wormholeCore,
    hollar: HOLLAR_TOKEN,
    vaultChainId: chainId,
  });

  // The vault names its facilitator once and for all; a facilitator anywhere else could never serve it.
  const bound = await publicClient("baseSepolia").readContract({
    address: vault,
    abi: psmVaultAbi,
    functionName: "authorizedEmitters",
    args: [HYDRATION_WORMHOLE_CHAIN_ID],
  });
  if (bound !== pad(facilitator).toLowerCase()) {
    throw new Error(`the Base Sepolia vault is bound to ${bound}, not to the fork facilitator ${facilitator}`);
  }

  await grantMintBucket(hydration, facilitator);
  await openPsmFacilitator(operator, facilitator, chainId, vault);
  return facilitator;
}
