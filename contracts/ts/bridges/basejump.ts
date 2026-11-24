import { pad, type Address } from "viem";

import { loadAbi } from "../artifacts";
import { createBehindProxy, send, type Actor } from "../transact";

/** Hydration's Basejump contracts (`third_party/whm`), unmodified. Each is UUPS and owned by whoever deploys it. */

export function deployBasejumpEmitter(by: Actor, wormholeCore: Address): Promise<Address> {
  return createBehindProxy(by, "BasejumpEmitter", "whm", { functionName: "initialize", args: [wormholeCore] });
}

export function deployBasejumpLanding(by: Actor): Promise<Address> {
  return createBehindProxy(by, "BasejumpLanding", "whm", { functionName: "initialize", args: [] });
}

export function deployBasejumpReceiver(by: Actor, wormholeCore: Address): Promise<Address> {
  return createBehindProxy(by, "BasejumpReceiver", "whm", { functionName: "initialize", args: [wormholeCore] });
}

export interface EmitterRoute {
  /** The landing on Hydration: where the NTT settlement is addressed. */
  landing: Address;
  token: Address;
  nttManager: Address;
  /** Flat fee in token units kept by the landing; the fast path pays out the amount minus this. */
  assetFee: bigint;
}

export async function configureBasejumpEmitter(by: Actor, emitter: Address, route: EmitterRoute): Promise<void> {
  const abi = loadAbi("BasejumpEmitter", "whm");
  await send(by, { address: emitter, abi, functionName: "setLanding", args: [pad(route.landing)] });
  await send(by, { address: emitter, abi, functionName: "setNttManager", args: [route.token, route.nttManager] });
  await send(by, { address: emitter, abi, functionName: "setAssetFee", args: [route.token, route.assetFee] });
}

export interface ReceiverRoute {
  receiver: Address;
  landing: Address;
  /** Wormhole chain id of the chain the emitter lives on. */
  emitterChain: number;
  emitter: Address;
  sourceToken: Address;
  /** ERC-20 precompile of the Hydration asset paid out for `sourceToken`. */
  payoutAsset: Address;
}

export async function connectBasejumpReceiver(by: Actor, route: ReceiverRoute): Promise<void> {
  const receiver = { address: route.receiver, abi: loadAbi("BasejumpReceiver", "whm") };
  const landing = { address: route.landing, abi: loadAbi("BasejumpLanding", "whm") };
  await send(by, { ...receiver, functionName: "setAuthorizedEmitter", args: [route.emitterChain, pad(route.emitter)] });
  await send(by, { ...receiver, functionName: "setLanding", args: [pad(route.landing)] });
  await send(by, { ...landing, functionName: "setDestAsset", args: [route.sourceToken, route.payoutAsset] });
  await send(by, { ...landing, functionName: "setAuthorizedBridge", args: [route.receiver, true] });
}
