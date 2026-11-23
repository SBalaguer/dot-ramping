# Decisions

Append-only log of deviations from `HANDOFF.md`, fallbacks and setup shortcuts.
Each entry: date, what, why, how to revert.

## 2026-11-23 — Spec revised before the first commit: S-ETH moves to mainnet forks

- **What:** The owner replaced `HANDOFF.md` and `CLAUDE.md` mid-M0. S-ETH no longer targets a Snowbridge
  testnet (old variants a/b/c); it runs on an anvil Ethereum mainnet fork against the real Gateway, with the
  relay hop reconstructed (§3.7, §8.3). The Snowbridge-testnet liveness script and Bridge Hub helpers written
  under the old spec were discarded uncommitted.
- **Why:** The Snowbridge team stopped running testnet relayers; Sepolia sunsets in Q2 2027.
- **Evidence gathered before the change (consistent with the new §5):** the current Paseo relay
  (spec 2005005) has no head and no lifecycle entry for para 1002, so Paseo Bridge Hub no longer exists;
  Westend Bridge Hub's beacon light client is at slot 10,841,952 (2026-08-04), 111 days behind.
- **Revert:** not applicable.

## 2026-11-23 — Toolchain: Node 26 and pnpm 9.12 instead of Node 22

- **What:** The repo is developed on Node 26.7.0 and pnpm 9.12.0, the versions installed on the owner's
  machine. `engines.node` is `>=22`.
- **Why:** No Node version manager is installed; everything used so far runs on Node 26.
- **Revert:** install Node 22 and rerun `pnpm install && pnpm test`.

## 2026-11-23 — whm pinned at 19a5d6c

- **What:** `third_party/whm` is pinned at `19a5d6c899075919cfdef23118879273a0c2aaec` (2026-11-16).
- **Why:** Latest `main` at project start.
- **Caveat:** the repository has no top-level LICENSE file; the Basejump and PSM contracts carry
  `SPDX-License-Identifier: MIT` headers, which is what the "MIT" claim in `HANDOFF.md` rests on.
- **Revert:** `git -C third_party/whm checkout <commit>` and commit the submodule pointer.

## 2026-11-23 — polkadot-api 2.x, descriptors 2.7.0 and chopsticks 2.0.0, matching whm

- **What:** The workspace pins `polkadot-api@^2.2.2`, `@galacticcouncil/descriptors@2.7.0` and
  `@galacticcouncil/chopsticks@2.0.0` although newer releases exist (polkadot-api 3.3.0, chopsticks 2.3.0).
  The root `package.json` declares `polkadot-api`, `viem` and the descriptors, and mirrors whm's two
  `packageExtensions`, because `@whm/chopsticks` imports them without declaring them.
- **Why:** `@whm/chopsticks` (`EthClient`, `sendRawEthTx`) is used read-only and is written against exactly
  this toolchain.
- **Revert:** bump the three versions together once whm does, then rerun `pnpm check:forks`.

## 2026-11-23 — Own fork spawner instead of whm `spawnForks`

- **What:** `forks/src/polkadot.ts` calls chopsticks directly and returns whm's `Network` shape, so whm's
  EVM helpers still work on it. whm's `configs.hydration` preset is reused; the Asset Hub preset is ours.
- **Why:** whm's `spawn` takes one `CHOPSTICKS_BLOCK` for every chain and ships no Asset Hub preset. Each
  fork needs its own pinned block (HANDOFF §15.9): Hydration #17,352,800 and Asset Hub #23,509,300,
  overridable with `HYDRATION_FORK_BLOCK` / `AH_FORK_BLOCK`. Fetched state is cached in `forks/.cache`.
- **Revert:** replace `spawnPolkadotForks` with whm's `spawnForks` once it supports per-chain blocks.

## 2026-11-23 — Fork setup shortcut: dev account funding in `check:forks`

- **What:** `forks/src/check-hrmp.ts` gives `//Alice` 1,000 HDX and 100 USDT (asset 10) on the Hydration
  fork with `dev_setStorage` before sending the HRMP test transfer. The transfer itself is a signed
  `PolkadotXcm.transfer_assets_using_type_and_then` executed by both runtimes.
- **Why:** Dev accounts hold nothing on mainnet state.
- **Revert:** not applicable; fork-only.

## 2026-11-23 — Foundry installed with Homebrew

- **What:** `brew install foundry` (forge/anvil 1.10.0) on the owner's machine.
- **Why:** M0 needs anvil for the Ethereum mainnet fork and no Foundry was installed. Homebrew leaves the
  shell profile untouched, unlike `foundryup`.
- **Revert:** `brew uninstall foundry`.

## 2026-11-23 — Ethereum fork source: drpc public RPC, pinned at block 26,478,800

- **What:** `ETH_MAINNET_RPC` defaults to `https://eth.drpc.org`; anvil forks mainnet at #26,478,800
  (`ETH_FORK_BLOCK`). The Gateway address comes from `@snowbridge/registry` (`polkadot_mainnet`).
- **Why:** A pinned fork needs archive state. `ethereum-rpc.publicnode.com` refuses archive requests without
  a token; drpc's keyless endpoint serves them but is rate-limited and comes with no guarantee.
- **Revert:** set `ETH_MAINNET_RPC` to a keyed archive endpoint in `.env`; move the pin with `ETH_FORK_BLOCK`.

## 2026-11-23 — Dev keys generated locally

- **What:** `.env` (gitignored) holds two freshly generated secp256k1 keys: `RELAYER_EVM_PK` (also the
  contract deployer and factory owner in the POC) and `DEV_USER_EVM_PK` (the demo "user"). `REFUND_ADDRESS`
  is the dev user's address.
- **Why:** `pnpm funding:report` needs addresses to ask the owner for testnet funds.
- **Revert:** replace the values in `.env` before anything is deployed; deployed contracts are owned by the
  relayer key.

## 2026-11-23 — W-BASE deposit asset: Aave's Base Sepolia USDC, not Circle's

- **What:** W-BASE uses USDC `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`, the token Aave v3 lists on Base
  Sepolia (HANDOFF §16 default). Demo funds are minted from Aave's faucet
  `0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc`, which is permissionless (`isPermissioned() == false`).
- **Why:** The PSM vault gates deposits on the Aave oracle price (0.9998 USD today) and supplies to the Aave
  pool, so the asset must be an Aave reserve. Circle's Base Sepolia USDC is not one.
- **Revert:** change `BASE_SEPOLIA_USDC` in `packages/chains/src/tokens.ts` and redeploy the vault.

## 2026-11-23 — M0 result

- `pnpm check:env` and `pnpm check:forks` pass. Differences from HANDOFF §5 and §12:
  - `ethereum-rpc.publicnode.com` cannot back a pinned fork (no archive state); see the fork source entry.
  - `pnpm -F <pkg> up` is pnpm's own update command, so fork scripts are invoked with `pnpm -F … run`.
  - Sepolia and Base Sepolia Wormhole cores charge a 0 wei message fee and use guardian set #0 with the
    single testnet guardian `0x13947Bd48b18E53fdAeEe77F3473391aC727C638`.
  - Hydration → Asset Hub USDT transfer costs 0.000591 USDT in XCM fees on the forks.
