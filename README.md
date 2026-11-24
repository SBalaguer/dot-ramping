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
pnpm bootstrap          # Solidity dependencies, the whm and NTT contract builds
cp .env.example .env    # then fill in the two testnet-only keys and the factory owner address
```

## Running the Wormhole routes

W-ETH takes USDC on Sepolia through Basejump, W-BASE takes USDC on Base Sepolia through the HOLLAR PSM. Both
end as USDT on the Asset Hub fork. The testnet contracts in `deployments/` belong to this repository's
relayer key; with a different key, delete the two testnet files and run `pnpm deploy:testnets` first.

```sh
pnpm forks:up           # terminal 1: Ethereum, Hydration and Asset Hub forks plus the fork-side contracts
pnpm relayer:dev        # terminal 2: relayer on http://127.0.0.1:8787
pnpm demo:w-eth 5       # terminal 3: deposits 5 USDC on Sepolia from the dev wallet and follows the top-up
pnpm demo:w-base 5      #             the same on Base Sepolia (mints the USDC from Aave's faucet)
```

A top-up has one deposit address, valid on both testnets. The relayer API: `POST /topups`, `GET /topups`,
`GET /topups/:id`, `GET /events` (server-sent events).

## Commands

| Command                                                  | What it does                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                              | Lint, typecheck, TypeScript tests and Foundry tests                                                                                         |
| `pnpm check:env`                                         | Verifies the testnet RPCs, Wormhole, the CREATE2 deployer, our testnet deployments and the Snowbridge Gateway                               |
| `pnpm check:forks`                                       | Spawns the Hydration and Asset Hub forks and proves HRMP delivery, the swap home from USDC and from HOLLAR, EVM writes and VAA verification |
| `pnpm forks:up` / `pnpm forks:down`                      | Starts and stops the Ethereum (anvil), Hydration and Asset Hub mainnet forks                                                                |
| `pnpm relayer:dev`                                       | Runs the relayer against the forks and Sepolia                                                                                              |
| `pnpm demo:w-eth [amount]` / `pnpm demo:w-base [amount]` | Sends test USDC to a new deposit address on Sepolia or Base Sepolia and follows it to Asset Hub                                             |
| `pnpm deploy:testnets`                                   | Deploys what is missing from `deployments/` on Sepolia and Base Sepolia (bridges, then the factory)                                         |
| `pnpm funding:report`                                    | Lists the testnet funds each account still needs                                                                                            |
| `pnpm bridge:base-sepolia <relayer\|dev-user> <ether>`   | Moves an account's Sepolia ETH to Base Sepolia through Base's native bridge                                                                 |
| `pnpm probe:exchange-asset`                              | Dry-runs the in-XCM USDT.sb to USDT swap on the Hydration fork                                                                              |

## Layout

| Path               | Contents                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `contracts/`       | Deposit forwarder factory and forwarder (Foundry); deployment helpers  |
| `packages/keys/`   | Per-top-up key, salt and address derivation                            |
| `packages/chains/` | Endpoints, clients and addresses for every chain involved              |
| `packages/routes/` | One module per route                                                   |
| `forks/`           | Mainnet fork spawners and their checks                                 |
| `relayer/`         | Relayer service                                                        |
| `web/`             | Dashboard                                                              |
| `deployments/`     | Addresses of what we deployed, per chain                               |
| `scripts/`         | Deployment, demo and check scripts                                     |
| `third_party/whm/` | Hydration's Wormhole contracts and fork helpers, pinned and unmodified |
| `third_party/ntt/` | Wormhole's NTT contracts, pinned and unmodified                        |
