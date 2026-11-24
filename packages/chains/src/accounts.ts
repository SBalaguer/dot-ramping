import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set; copy .env.example to .env and fill it in`);
  return value;
}

/** Pays gas on every chain, triggers forwarders, and deploys and administers the bridge contracts we stand up. */
export const relayerAccount = (): PrivateKeyAccount => privateKeyToAccount(requireEnv("RELAYER_EVM_PK") as Hex);

/** Plays the user in demos: the wallet a deposit is sent from. */
export const devUserAccount = (): PrivateKeyAccount => privateKeyToAccount(requireEnv("DEV_USER_EVM_PK") as Hex);

/** May rotate the factory's relayer and nothing else; only its address is needed. */
export const factoryOwner = (): Address => getAddress(requireEnv("OWNER_EVM_ADDRESS"));
