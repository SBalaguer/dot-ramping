import { BASE_SEPOLIA_AAVE_FAUCET, tetherAbi } from "@onramp/chains";
import { actor, send } from "@onramp/contracts";
import { formatUnits, parseAbi, parseUnits, type Account, type Address, type Hash } from "viem";

import type { SourceChain } from "./api-types";
import type { Context } from "./context";

/** Sends `amount` of a chain's stablecoin from the dev wallet to a deposit address. */
export type DemoDeposit = (to: Address, chain: SourceChain, amount: bigint) => Promise<Hash>;

const faucetAbi = parseAbi(["function mint(address token, address to, uint256 amount) returns (uint256)"]);
/** Aave's faucet serves an address once an hour, so one mint has to cover many demo deposits. */
const FAUCET_STOCK = "1000";

/**
 * The demo's "user": a dev wallet that makes the plain token transfer a real user would make from any
 * wallet. It is a different key from the relayer's, and its deposits run one after another.
 */
export function demoDepositor(sources: Context["sources"], user: Account): DemoDeposit {
  let queue: Promise<unknown> = Promise.resolve();

  const deposit: DemoDeposit = async (to, chain, amount) => {
    const { token, symbol, decimals, name } = sources[chain];
    const wallet = actor(chain, user);
    // Tether's ABI also fits the USDC tokens: only `transfer`'s unused return value differs.
    const erc20 = { address: token, abi: tetherAbi } as const;
    const held = await wallet.reader.readContract({ ...erc20, functionName: "balanceOf", args: [user.address] });

    if (held < amount) {
      if (chain !== "baseSepolia") {
        throw new Error(`the dev wallet holds ${formatUnits(held, decimals)} ${symbol} on ${name}`);
      }
      const stock = parseUnits(FAUCET_STOCK, decimals);
      const minted = amount - held > stock ? amount - held : stock;
      const args = [token, user.address, minted] as const;
      await send(wallet, { address: BASE_SEPOLIA_AAVE_FAUCET, abi: faucetAbi, functionName: "mint", args });
    }
    const receipt = await send(wallet, { ...erc20, functionName: "transfer", args: [to, amount] });
    return receipt.transactionHash;
  };

  return (to, chain, amount) => {
    const sent = queue.then(() => deposit(to, chain, amount));
    queue = sent.catch(() => undefined);
    return sent;
  };
}
