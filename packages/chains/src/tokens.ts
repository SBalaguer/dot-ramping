import type { Address } from "viem";

/** Circle's testnet USDC on Sepolia; the W-ETH deposit asset. */
export const SEPOLIA_USDC: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

/** The USDC that Aave v3 lists on Base Sepolia, required by the PSM vault's oracle gate; mintable from Aave's faucet. */
export const BASE_SEPOLIA_USDC: Address = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";

export const MAINNET_USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

/** Aave v3's pool on Base Sepolia; the PSM vault supplies its idle USDC here and reads Aave's oracle. */
export const BASE_SEPOLIA_AAVE_POOL: Address = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27";

/** Aave's testnet faucet on Base Sepolia; anyone may mint the USDC Aave lists there. */
export const BASE_SEPOLIA_AAVE_FAUCET: Address = "0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc";
