import { factoryAbi, send, type Actor } from "@onramp/contracts";
import type { ForwarderParams } from "@onramp/keys";
import type { Address, Hex, TransactionReceipt } from "viem";

export interface ForwardRequest {
  factory: Address;
  params: ForwarderParams;
  route: number;
  routeArgs?: Hex;
  /** Ether for the bridge's own fees, passed through the forwarder. */
  value?: bigint;
}

/** Forwards a top-up's whole deposit in one transaction paid by the relayer, creating the forwarder on first use. */
export async function triggerForwarder(by: Actor, request: ForwardRequest): Promise<TransactionReceipt> {
  const factory = { address: request.factory, abi: factoryAbi } as const;
  const forwarder = await by.reader.readContract({ ...factory, functionName: "predict", args: [request.params] });
  const exists = await by.reader.getCode({ address: forwarder });
  return send(by, {
    ...factory,
    functionName: exists ? "forward" : "deployAndForward",
    args: [request.params, request.route, request.routeArgs ?? "0x"],
    value: request.value,
  });
}
