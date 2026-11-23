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
