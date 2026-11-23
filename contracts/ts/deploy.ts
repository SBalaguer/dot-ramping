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

const FACTORY_SALT = stringToHex("onramp/forwarder-factory/1", { size: 32 });

function factoryInitCode(owner: Address): Hex {
  const { bytecode } = loadArtifact("DepositForwarderFactory");
  return encodeDeployData({ abi: factoryAbi, bytecode, args: [owner] });
}

/** Where the factory owned by `owner` lives on every chain that has the CREATE2 deployer. */
export function factoryAddress(owner: Address): Address {
  return getCreate2Address({ from: CREATE2_DEPLOYER, salt: FACTORY_SALT, bytecode: factoryInitCode(owner) });
}

/** Deploys the factory through the CREATE2 deployer unless it is already there. */
export async function deployFactory(
  wallet: WalletClient<Transport, Chain, Account>,
  reader: PublicClient,
  owner: Address = wallet.account.address,
): Promise<Address> {
  const factory = factoryAddress(owner);
  if (await reader.getCode({ address: factory })) return factory;

  const hash = await wallet.sendTransaction({
    to: CREATE2_DEPLOYER,
    data: concatHex([FACTORY_SALT, factoryInitCode(owner)]),
  });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !(await reader.getCode({ address: factory }))) {
    throw new Error(`factory deployment ${hash} did not create ${factory}`);
  }
  return factory;
}
