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
