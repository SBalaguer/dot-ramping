import { pad, zeroHash, type Address } from "viem";

import { loadAbi } from "../artifacts";
import { createBehindProxy, send, type Actor } from "../transact";

/**
 * Hydration's HOLLAR peg stability module (`third_party/whm`), unmodified: a vault that takes USDC on Base and
 * a facilitator that mints HOLLAR on Hydration. The deploying account holds every role on what it deploys.
 */

const USDC_DECIMALS = 6;
/** Hydration's launch limits: 10,000 USDC per day in each direction. */
const DAILY_CAPACITY = 10_000n * 10n ** BigInt(USDC_DECIMALS);
const WINDOW_SECONDS = 86_400n;
/** The vault refuses deposits while Aave's oracle prices USDC below this (8 decimals). */
const MIN_USDC_PRICE = 99_000_000n;

export interface VaultParameters {
  wormholeCore: Address;
  usdc: Address;
  aUsdc: Address;
  aaveAddressesProvider: Address;
  /** Wormhole chain id of Hydration. */
  hydrationChainId: number;
}

/** Deploys the vault with Hydration's launch limits and opens it for deposits. */
export async function deployPsmVault(by: Actor, parameters: VaultParameters): Promise<Address> {
  const operator = by.wallet.account.address;
  const vault = await createBehindProxy(by, "HollarBaseVault", "whm", {
    functionName: "initializeVault",
    args: [
      {
        wormhole: parameters.wormholeCore,
        usdc: parameters.usdc,
        aUsdc: parameters.aUsdc,
        addressesProvider: parameters.aaveAddressesProvider,
        hydrationChainId: parameters.hydrationChainId,
        minUsdcPrice: MIN_USDC_PRICE,
        admin: operator,
        guardian: operator,
        treasurer: operator,
      },
    ],
  });
  const contract = { address: vault, abi: loadAbi("HollarBaseVault", "whm") };
  await send(by, { ...contract, functionName: "setDepositLimit", args: [DAILY_CAPACITY, WINDOW_SECONDS] });
  await send(by, { ...contract, functionName: "setPayoutLimit", args: [DAILY_CAPACITY, WINDOW_SECONDS] });
  await send(by, { ...contract, functionName: "setDepositsPaused", args: [false] });
  return vault;
}

export interface FacilitatorParameters {
  wormholeCore: Address;
  hollar: Address;
  /** Wormhole chain id of the chain the vault lives on. */
  vaultChainId: number;
}

export function deployPsmFacilitator(by: Actor, parameters: FacilitatorParameters): Promise<Address> {
  const operator = by.wallet.account.address;
  return createBehindProxy(by, "HollarBaseFacilitator", "whm", {
    functionName: "initializeFacilitator",
    args: [parameters.wormholeCore, parameters.hollar, USDC_DECIMALS, parameters.vaultChainId, operator, operator],
  });
}

/**
 * Binds one side of the module to the other. The binding is permanent in both contracts, so an existing
 * one is only accepted if it already names `counterpart`.
 */
async function bind(by: Actor, contract: string, address: Address, counterpartChain: number, counterpart: Address) {
  const target = { address, abi: loadAbi(contract, "whm") };
  const bound = await by.reader.readContract({
    ...target,
    functionName: "authorizedEmitters",
    args: [counterpartChain],
  });
  if (bound === pad(counterpart).toLowerCase()) return;
  if (bound !== zeroHash) throw new Error(`${contract} ${address} is permanently bound to ${String(bound)}`);
  const setter = contract === "HollarBaseVault" ? "setHydrationEmitter" : "setBaseEmitter";
  await send(by, { ...target, functionName: setter, args: [pad(counterpart)] });
}

export function bindPsmVault(by: Actor, vault: Address, hydrationChainId: number, facilitator: Address): Promise<void> {
  return bind(by, "HollarBaseVault", vault, hydrationChainId, facilitator);
}

/** Binds the facilitator to its vault, applies the launch limits and opens minting and redeeming. */
export async function openPsmFacilitator(
  by: Actor,
  facilitator: Address,
  vaultChainId: number,
  vault: Address,
): Promise<void> {
  await bind(by, "HollarBaseFacilitator", facilitator, vaultChainId, vault);
  const contract = { address: facilitator, abi: loadAbi("HollarBaseFacilitator", "whm") };
  await send(by, { ...contract, functionName: "setLimits", args: [DAILY_CAPACITY, DAILY_CAPACITY, WINDOW_SECONDS] });
  await send(by, { ...contract, functionName: "setPaused", args: [false, false] });
}
