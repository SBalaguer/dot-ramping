import { CREATE2_DEPLOYER } from "@onramp/chains";
import {
  concatHex,
  encodeDeployData,
  getCreate2Address,
  stringToHex,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

import { factoryAbi } from "./abi";
import { loadArtifact } from "./artifacts";
import type { FactoryConfig } from "./config";

const FACTORY_SALT = stringToHex("onramp/forwarder-factory/1", { size: 32 });
const CODE_READ_ATTEMPTS = 10;
const CODE_READ_INTERVAL_MS = 2_000;

function factoryInitCode({ owner, relayer, chains }: FactoryConfig): Hex {
  const { bytecode } = loadArtifact("DepositForwarderFactory");
  return encodeDeployData({ abi: factoryAbi, bytecode, args: [owner, relayer, chains] });
}

/** Where the factory built from `config` lives on every chain that has the CREATE2 deployer. */
export function factoryAddress(config: FactoryConfig): Address {
  return getCreate2Address({ from: CREATE2_DEPLOYER, salt: FACTORY_SALT, bytecode: factoryInitCode(config) });
}

/** Deploys the factory through the CREATE2 deployer unless it is already there; any funded account can pay. */
export async function deployFactory(
  wallet: WalletClient<Transport, Chain, Account>,
  reader: PublicClient,
  config: FactoryConfig,
): Promise<Address> {
  const factory = factoryAddress(config);
  if (await reader.getCode({ address: factory })) return factory;

  const hash = await wallet.sendTransaction({
    to: CREATE2_DEPLOYER,
    data: concatHex([FACTORY_SALT, factoryInitCode(config)]),
  });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`factory deployment ${hash} reverted`);
  // A load-balanced RPC can serve the receipt before every node behind it has the block.
  for (let attempt = 0; attempt < CODE_READ_ATTEMPTS; attempt++) {
    if (await reader.getCode({ address: factory })) return factory;
    await new Promise((retry) => setTimeout(retry, CODE_READ_INTERVAL_MS));
  }
  throw new Error(`factory deployment ${hash} did not create ${factory}`);
}
