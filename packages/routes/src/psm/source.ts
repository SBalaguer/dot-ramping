import { wormholeCoreAbi } from "@onramp/chains";
import { factoryAbi, psmVaultAbi, type Actor } from "@onramp/contracts";
import { Route, type ForwarderParams } from "@onramp/keys";
import { parseEventLogs, type Address, type Hash } from "viem";

import { triggerForwarder } from "../forwarder";

export interface PsmDispatch {
  txHash: Hash;
  blockNumber: bigint;
  vault: Address;
  /** USDC the vault took in. */
  amount: bigint;
  /** Wormhole sequence of the mint message, the VAA to deliver on Hydration. */
  messageSequence: bigint;
}

/** Sends a top-up's deposit through its forwarder into the PSM vault; the only ether needed is Wormhole's message fee. */
export async function forwardViaPsm(by: Actor, factory: Address, params: ForwarderParams): Promise<PsmDispatch> {
  const [vault] = await by.reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "routeConfig",
    args: [Route.Psm],
  });
  const core = await by.reader.readContract({ address: vault, abi: psmVaultAbi, functionName: "wormhole" });
  const value = await by.reader.readContract({ address: core, abi: wormholeCoreAbi, functionName: "messageFee" });
  const receipt = await triggerForwarder(by, { factory, params, route: Route.Psm, value });

  const [deposited] = parseEventLogs({ abi: psmVaultAbi, eventName: "Deposited", logs: receipt.logs });
  if (!deposited) throw new Error(`${receipt.transactionHash} forwarded without a PSM deposit`);
  return {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    vault,
    amount: deposited.args.amount,
    messageSequence: deposited.args.sequence,
  };
}
