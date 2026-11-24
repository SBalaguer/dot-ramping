import { factoryAbi, type Actor } from "@onramp/contracts";
import { Route, type ForwarderParams } from "@onramp/keys";
import { encodeAbiParameters, type Address, type Hash } from "viem";

import { forwardOnce } from "../forwarder";
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

/**
 * Sends a top-up's deposit through its forwarder into the Snowbridge Gateway, once. The relayer pays both
 * fees in ether; they are only quoted if a transaction is sent.
 */
export async function forwardViaSnowbridge(
  by: Actor,
  factory: Address,
  params: ForwarderParams,
  sinceBlock: bigint,
  quote: () => Promise<SnowbridgeFees>,
): Promise<SnowbridgeDispatch> {
  const fees = async () => {
    const { executionFee, relayerFee } = await quote();
    return {
      value: executionFee + relayerFee,
      routeArgs: encodeAbiParameters([{ type: "uint128" }, { type: "uint128" }], [executionFee, relayerFee]),
    };
  };
  const receipt = await forwardOnce(by, { factory, params, route: Route.Snowbridge, sinceBlock, fees });
  return { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber };
}

/** The message the Gateway accepted in transaction `txHash`. */
export async function acceptedMessage(by: Actor, gateway: Address, txHash: Hash): Promise<GatewayMessage> {
  const receipt = await by.reader.getTransactionReceipt({ hash: txHash });
  return gatewayMessage(receipt.logs, gateway);
}
