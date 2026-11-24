import { BASE_SEPOLIA_USDC, SEPOLIA_USDC, devUserAccount, publicClient, relayerAccount } from "@onramp/chains";
import { erc20Abi, formatUnits, parseEther, parseUnits, type Address } from "viem";

type Testnet = "sepolia" | "baseSepolia";

interface Requirement {
  account: string;
  address: Address;
  chain: Testnet;
  token: { symbol: string; decimals: number; address?: Address };
  required: bigint;
  /** Set when the agent can obtain the token itself, so the owner has nothing to send. */
  selfServe?: string;
}

const ETH = { symbol: "ETH", decimals: 18 };
const CHAIN_NAMES: Record<Testnet, string> = { sepolia: "Sepolia", baseSepolia: "Base Sepolia" };

function requirements(): Requirement[] {
  const relayer = relayerAccount().address;
  const user = devUserAccount().address;
  return [
    { account: "relayer", address: relayer, chain: "sepolia", token: ETH, required: parseEther("0.01") },
    { account: "relayer", address: relayer, chain: "baseSepolia", token: ETH, required: parseEther("0.01") },
    { account: "dev user", address: user, chain: "sepolia", token: ETH, required: parseEther("0.002") },
    { account: "dev user", address: user, chain: "baseSepolia", token: ETH, required: parseEther("0.002") },
    {
      account: "dev user",
      address: user,
      chain: "sepolia",
      token: { symbol: "USDC", decimals: 6, address: SEPOLIA_USDC },
      required: parseUnits("20", 6),
    },
    {
      account: "dev user",
      address: user,
      chain: "baseSepolia",
      token: { symbol: "USDC", decimals: 6, address: BASE_SEPOLIA_USDC },
      required: parseUnits("50", 6),
      selfServe: "minted from Aave's faucet by the demo script",
    },
  ];
}

function balanceOf({ chain, address, token }: Requirement): Promise<bigint> {
  const client = publicClient(chain);
  return token.address
    ? client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })
    : client.getBalance({ address });
}

const rows = await Promise.all(
  requirements().map(async (requirement) => ({ ...requirement, balance: await balanceOf(requirement) })),
);

let ownerActionNeeded = false;
for (const row of rows) {
  const { symbol, decimals, address: tokenAddress } = row.token;
  const amount = (value: bigint): string => `${formatUnits(value, decimals)} ${symbol}`;
  const shortfall = row.required > row.balance ? row.required - row.balance : 0n;
  const status =
    shortfall === 0n ? "funded" : row.selfServe ? `no action (${row.selfServe})` : `SEND ${amount(shortfall)}`;
  ownerActionNeeded ||= shortfall > 0n && !row.selfServe;
  console.log(
    [
      row.account.padEnd(8),
      CHAIN_NAMES[row.chain].padEnd(12),
      row.address,
      (tokenAddress ? `${symbol} ${tokenAddress}` : symbol).padEnd(47),
      `need ${amount(row.required)}`.padEnd(15),
      `have ${amount(row.balance)}`.padEnd(15),
      status,
    ].join("  "),
  );
}
process.exit(ownerActionNeeded ? 1 : 0);
