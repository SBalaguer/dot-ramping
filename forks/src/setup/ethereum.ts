import { MAINNET_USDT, endpoints, tetherAbi } from "@onramp/chains";
import { actor, deployFactory } from "@onramp/contracts";
import { recordedFactoryConfig } from "@onramp/routes";
import {
  createTestClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseEther,
  toHex,
  type Account,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";

const RELAYER_ETHER = parseEther("10");
const USER_ETHER = parseEther("1");
const USER_USDT = 100_000n * 10n ** 6n;
/** `balances` in Tether's `BasicToken`. */
const TETHER_BALANCES_SLOT = 2n;

/**
 * What the Ethereum fork needs beyond mainnet state: ether for the relayer, ether and USDT for the demo
 * user, both written into state, and our factory, deployed like on any chain. The Gateway is mainnet's.
 */
export async function setUpEthereumFork(operator: Account, user: Address): Promise<Address> {
  const anvil = createTestClient({ mode: "anvil", chain: mainnet, transport: http(endpoints.ethForkRpc) });
  const by = actor("ethereumFork", operator);

  await anvil.setBalance({ address: operator.address, value: RELAYER_ETHER });
  await anvil.setBalance({ address: user, value: USER_ETHER });
  await anvil.setStorageAt({
    address: MAINNET_USDT,
    index: keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [user, TETHER_BALANCES_SLOT])),
    value: toHex(USER_USDT, { size: 32 }),
  });
  const funded = await by.reader.readContract({
    address: MAINNET_USDT,
    abi: tetherAbi,
    functionName: "balanceOf",
    args: [user],
  });
  if (funded !== USER_USDT) throw new Error(`writing Tether's balance slot left ${user} with ${funded}`);

  return deployFactory(by.wallet, by.reader, await recordedFactoryConfig());
}
