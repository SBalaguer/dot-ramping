import { publicClient, walletClient, type EvmChainKey } from "@onramp/chains";
import {
  encodeFunctionData,
  getAddress,
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";

import { loadArtifact, type Artifact, type Build } from "./artifacts";

/** An account on one chain: what it signs with and what it reads through. */
export interface Actor {
  wallet: WalletClient<Transport, Chain, Account>;
  reader: PublicClient;
}

export function actor(chain: EvmChainKey, account: Account): Actor {
  return { wallet: walletClient(chain, account), reader: publicClient(chain) };
}

export async function confirmed({ reader }: Actor, hash: Hash): Promise<TransactionReceipt> {
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return receipt;
}

export async function create(by: Actor, { abi, bytecode }: Artifact, args: readonly unknown[] = []): Promise<Address> {
  const receipt = await confirmed(by, await by.wallet.deployContract({ abi, bytecode, args }));
  if (!receipt.contractAddress) throw new Error(`transaction ${receipt.transactionHash} created no contract`);
  return getAddress(receipt.contractAddress);
}

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

/** Simulates the call as the actor, then sends it and waits for it to succeed. */
export async function send(by: Actor, call: Call): Promise<TransactionReceipt> {
  const { request } = await by.reader.simulateContract({ ...call, account: by.wallet.account });
  return confirmed(by, await by.wallet.writeContract(request));
}

/** Deploys a UUPS implementation and an ERC-1967 proxy that initializes it, both from the same build. */
export async function createBehindProxy(
  by: Actor,
  contract: string,
  build: Build,
  initializerArgs: readonly unknown[],
): Promise<Address> {
  const implementation = loadArtifact(contract, build);
  const initializer = encodeFunctionData({
    abi: implementation.abi,
    functionName: "initialize",
    args: initializerArgs,
  });
  return create(by, loadArtifact("ERC1967Proxy", build), [await create(by, implementation), initializer]);
}
