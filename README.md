# onramp-bridges

Proof of concept: a user sends a stablecoin to a fresh deposit address on Ethereum or Base and receives
USDT (asset 1984) on Polkadot Asset Hub in a fresh per-top-up account. `HANDOFF.md` is the spec,
`DECISIONS.md` logs every deviation from it.

## Prerequisites

- Node 26 (`.nvmrc`) and pnpm 9
- Foundry (`forge`, `anvil`), e.g. `brew install foundry`

## Setup

```sh
git submodule update --init
pnpm install
pnpm bootstrap          # Solidity dependencies and the whm contract build
cp .env.example .env    # then fill in the two testnet-only keys
```

## Commands

| Command                             | What it does                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm test`                         | Lint, typecheck, TypeScript tests and Foundry tests                                                        |
| `pnpm check:env`                    | Verifies the testnet RPCs, Wormhole, the CREATE2 deployer and the Snowbridge Gateway on the Ethereum fork  |
| `pnpm check:forks`                  | Spawns the Hydration and Asset Hub forks and proves HRMP delivery, EVM writes and testnet VAA verification |
| `pnpm forks:up` / `pnpm forks:down` | Starts and stops the Ethereum (anvil), Hydration and Asset Hub mainnet forks                               |
| `pnpm funding:report`               | Lists the testnet funds each account still needs                                                           |
| `pnpm probe:exchange-asset`         | Dry-runs the in-XCM USDT.sb to USDT swap on the Hydration fork                                             |

## Layout

| Path               | Contents                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `contracts/`       | Deposit forwarder factory and forwarder (Foundry)                      |
| `packages/keys/`   | Per-top-up key, salt and address derivation                            |
| `packages/chains/` | Endpoints, clients and addresses for every chain involved              |
| `packages/routes/` | One module per route                                                   |
| `forks/`           | Mainnet fork spawners and their checks                                 |
| `relayer/`         | Relayer service                                                        |
| `web/`             | Dashboard                                                              |
| `third_party/whm/` | Hydration's Wormhole contracts and fork helpers, pinned and unmodified |
