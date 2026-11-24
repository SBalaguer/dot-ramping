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

## Running the routes

| Route  | Deposit                   | Bridge                         | Arrives on Hydration as |
| ------ | ------------------------- | ------------------------------ | ----------------------- |
| W-ETH  | USDC on Sepolia           | Basejump over Wormhole testnet | Wormhole USDC           |
| W-BASE | USDC on Base Sepolia      | HOLLAR PSM over Wormhole       | HOLLAR                  |
| S-ETH  | USDT on the Ethereum fork | Snowbridge Gateway (mainnet's) | Snowbridge USDT         |

All three end as USDT on the Asset Hub fork. The testnet contracts in `deployments/` belong to this
repository's relayer key; with a different key, delete the two testnet files and run `pnpm deploy:testnets`
first.

```sh
pnpm forks:up           # terminal 1: Ethereum, Hydration and Asset Hub forks plus the fork-side contracts
pnpm relayer:dev        # terminal 2: relayer on http://127.0.0.1:8787
pnpm demo:w-eth 5       # terminal 3: deposits 5 USDC on Sepolia from the dev wallet and follows the top-up
pnpm demo:w-base 5      #             the same on Base Sepolia (mints the USDC from Aave's faucet)
pnpm demo:s-eth 300     #             300 USDT on the Ethereum fork, through Snowbridge
```

A top-up has one deposit address, valid on all three source chains. The chain a deposit arrives on and its
size pick the route: Snowbridge from 250 USD up, a Wormhole route below, and whichever the chain has when it
has only one.

### Relayer API

| Request                   | What it does                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /topups`            | Creates a top-up and returns its deposit address and Asset Hub account                                  |
| `GET /topups`, `/:id`     | Reads top-ups with every step, its status and its references                                            |
| `GET /events`             | Streams every change as server-sent events                                                              |
| `POST /topups/:id/refund` | Sends what is at the deposit address to the top-up's refund address; refused once it has been forwarded |
| `POST /topups/:id/retry`  | Gives a top-up whose step failed eight times a fresh set of attempts                                    |

The relayer can be stopped at any point and picks every open top-up up where it was. The API has no
authentication; it is meant for a local machine.

S-ETH runs against mainnet forks because Snowbridge has no testnet relayers. One hop is simulated: the
message Bridge Hub would send Asset Hub is rebuilt from the Gateway's event and injected into the Asset Hub
fork (the relayer's `RELAY_SIMULATED` step). The Gateway before it and Asset Hub and Hydration after it
execute for real.

## Commands

| Command                                                  | What it does                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                              | Lint, typecheck, TypeScript tests and Foundry tests                                                                                                                           |
| `pnpm check:env`                                         | Verifies the testnet RPCs, Wormhole, the CREATE2 deployer, our deployments on the testnets and the Ethereum fork, and the Snowbridge Gateway                                  |
| `pnpm check:forks [word]`                                | Spawns the forks and proves HRMP delivery, the swap home from each payout asset, EVM writes, VAA verification and S-ETH end to end; a word runs only the checks named with it |
| `pnpm forks:up` / `pnpm forks:down`                      | Starts and stops the Ethereum (anvil), Hydration and Asset Hub mainnet forks                                                                                                  |
| `pnpm relayer:dev`                                       | Runs the relayer against the forks and the two testnets                                                                                                                       |
| `pnpm demo:w-eth [amount]` / `pnpm demo:w-base [amount]` | Sends test USDC to a new deposit address on Sepolia or Base Sepolia and follows it to Asset Hub                                                                               |
| `pnpm demo:s-eth [amount]`                               | Sends USDT to a new deposit address on the Ethereum fork and follows it to Asset Hub                                                                                          |
| `pnpm deploy:testnets`                                   | Deploys what is missing from `deployments/` on Sepolia and Base Sepolia (bridges, then the factory)                                                                           |
| `pnpm funding:report`                                    | Lists the testnet funds each account still needs                                                                                                                              |
| `pnpm bridge:base-sepolia <relayer\|dev-user> <ether>`   | Moves an account's Sepolia ETH to Base Sepolia through Base's native bridge                                                                                                   |
| `pnpm probe:exchange-asset`                              | Dry-runs the in-XCM USDT.sb to USDT swap on the Hydration fork                                                                                                                |

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
