import { factoryAbi, forwarderAbi, send, type Actor } from "@onramp/contracts";
import type { ForwarderParams, Route } from "@onramp/keys";
import { erc20Abi, getAbiItem, type Address, type Hex, type TransactionReceipt } from "viem";

export interface ForwardFees {
  /** Ether for the bridge's own fees, passed through the forwarder. */
  value: bigint;
  routeArgs?: Hex;
}

export interface ForwardRequest {
  factory: Address;
  params: ForwarderParams;
  route: Route;
  /** A block no later than the deposit's detection; the top-up cannot have been forwarded before it. */
  sinceBlock: bigint;
  /** Worked out only if a transaction is actually sent. */
  fees: () => Promise<ForwardFees>;
}

const forwarded = getAbiItem({ abi: forwarderAbi, name: "Forwarded" });

/**
 * Forwards a top-up's whole deposit in one transaction paid by the relayer, creating the forwarder on first
 * use. Safe to repeat: when the deposit address is already empty, the forward it made since `sinceBlock` is
 * looked up and that transaction's receipt returned, so a relayer that lost track of a transaction it sent
 * picks it up again instead of failing or sending twice.
 */
export async function forwardOnce(by: Actor, request: ForwardRequest): Promise<TransactionReceipt> {
  const factory = { address: request.factory, abi: factoryAbi } as const;
  const [forwarder, [, token]] = await Promise.all([
    by.reader.readContract({ ...factory, functionName: "predict", args: [request.params] }),
    by.reader.readContract({ ...factory, functionName: "routeConfig", args: [request.route] }),
  ]);
  const held = await by.reader.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [forwarder],
  });

  if (held === 0n) {
    const [earlier] = await by.reader.getLogs({
      address: forwarder,
      event: forwarded,
      args: { route: request.route },
      fromBlock: request.sinceBlock,
    });
    if (!earlier) {
      throw new Error(`deposit address ${forwarder} is empty and forwarded nothing since block ${request.sinceBlock}`);
    }
    return by.reader.getTransactionReceipt({ hash: earlier.transactionHash });
  }

  const exists = await by.reader.getCode({ address: forwarder });
  const { value, routeArgs = "0x" } = await request.fees();
  return send(by, {
    ...factory,
    functionName: exists ? "forward" : "deployAndForward",
    args: [request.params, request.route, routeArgs],
    value,
  });
}
