import { factoryAbi, type Actor } from "@onramp/contracts";
import { Route, type ForwarderParams } from "@onramp/keys";
import { encodeAbiParameters, type Address, type Hash } from "viem";

import { triggerForwarder } from "../forwarder";
import type { SnowbridgeFees } from "./fees";
import { gatewayMessage, type GatewayMessage } from "./relay";

export async function snowbridgeGatewayOf(by: Actor, factory: Address): Promise<Address> {
  const [gateway] = await by.reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "routeConfig",
    args: [Route.Snowbridge],
  });
  return gateway;
}

export interface SnowbridgeDispatch {
  txHash: Hash;
  blockNumber: bigint;
}

/** Sends a top-up's deposit through its forwarder into the Snowbridge Gateway; the relayer pays both fees in ether. */
export async function forwardViaSnowbridge(
  by: Actor,
  factory: Address,
  params: ForwarderParams,
  fees: SnowbridgeFees,
): Promise<SnowbridgeDispatch> {
  const receipt = await triggerForwarder(by, {
    factory,
    params,
    route: Route.Snowbridge,
    routeArgs: encodeAbiParameters([{ type: "uint128" }, { type: "uint128" }], [fees.executionFee, fees.relayerFee]),
    value: fees.executionFee + fees.relayerFee,
  });
  return { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber };
}

/** The message the Gateway accepted in transaction `txHash`. */
export async function acceptedMessage(by: Actor, gateway: Address, txHash: Hash): Promise<GatewayMessage> {
  const receipt = await by.reader.getTransactionReceipt({ hash: txHash });
  return gatewayMessage(receipt.logs, gateway);
}
