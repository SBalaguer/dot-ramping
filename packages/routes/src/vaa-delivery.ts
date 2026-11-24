import { wormholeCoreAbi } from "@onramp/chains";
import { send, type Actor } from "@onramp/contracts";
import { parseAbi, type Address, type Hex, type TransactionReceipt } from "viem";

/** What every whm message receiver shares: the core it verifies with and the VAAs it has already taken. */
const receiverAbi = parseAbi([
  "function wormhole() view returns (address)",
  "function processedVaas(bytes32 vaaHash) view returns (bool)",
  "function completeTransfer(bytes vaa)",
  "function receiveMessage(bytes vaa)",
]);

/**
 * Delivers a guardian-signed VAA to a receiver on Hydration. Anyone may deliver and a receiver takes each
 * VAA once, so nothing is returned when it was already delivered, by us earlier or by someone else.
 */
export async function deliverVaa(
  by: Actor,
  receiver: Address,
  entrypoint: "completeTransfer" | "receiveMessage",
  vaa: Hex,
): Promise<TransactionReceipt | undefined> {
  const contract = { address: receiver, abi: receiverAbi } as const;
  const core = await by.reader.readContract({ ...contract, functionName: "wormhole" });
  const [message, valid, reason] = await by.reader.readContract({
    address: core,
    abi: wormholeCoreAbi,
    functionName: "parseAndVerifyVM",
    args: [vaa],
  });
  if (!valid) throw new Error(`the Wormhole core on Hydration rejects the VAA: ${reason}`);
  if (await by.reader.readContract({ ...contract, functionName: "processedVaas", args: [message.hash] }))
    return undefined;
  return send(by, { ...contract, functionName: entrypoint, args: [vaa] });
}
