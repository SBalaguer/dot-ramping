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

## 2026-11-23 — Fork writes: chopsticks 2.3.0 serves `eth_sendRawTransaction`; no fork gateway

- **What:** A workspace-wide pnpm override moves `@galacticcouncil/chopsticks` from whm's pinned 2.0.0 to
  2.3.0. Both forks run in Instant block mode (`dev_setBlockBuildMode`). The relayer will reach the Hydration
  fork only through its RPC endpoints (`ws://127.0.0.1:8061` for Substrate, `http://127.0.0.1:8061` for eth),
  like a live chain, and never owns the fork process. No fork-gateway process is built.
- **Why:** 2.3.0 adds `eth_sendRawTransaction`, `eth_getTransactionReceipt` and `eth_getLogs`, and fixes
  `eth_getTransactionCount`. `pnpm check:forks` proves it from the outside: a viem wallet deploys a contract
  through the eth RPC and reads its receipt, and a PAPI `signAndSubmit` on Hydration is delivered to Asset
  Hub over HRMP with no fork-side block building. This supersedes the 2.0.0 pin and HANDOFF §15.1.
  `polkadot-api` 2.x and descriptors 2.7.0 still match whm.
- **Known limit:** a transaction sent with viem's default gas and fee estimation was dropped at apply
  (`outcome.isErr`); with an explicit gas limit both legacy and EIP-1559 transactions succeed. To be pinned
  down in M3. The first block of a cold fork takes 20–80 s.
- **Revert:** remove the `pnpm.overrides` entry and the `dev_setBlockBuildMode` call; EVM writes then need
  whm's in-process `sendRawEthTx` again, which would require a gateway process in front of the forks.

## 2026-11-23 — whm TypeScript is imported from the submodule, never copied

- **What:** `forks/src/polkadot.ts` now calls whm's exported `spawn` (pinned block and cache passed through
  the `CHOPSTICKS_BLOCK` / `CHOPSTICKS_DB` environment variables it reads) instead of carrying its own copy of
  that function. This supersedes the "Own fork spawner" entry. Our `truncatedAccount` helper in
  `forks/src/checks/evm-write.ts` is not a copy: whm's README lists `truncatedEvmAccount` as an export, but
  the library does not export it.
- **Licence:** whm has no LICENSE file and no licence field in any `package.json`. Only the Solidity sources
  carry `SPDX-License-Identifier: MIT`; the TypeScript under `chopsticks/`, `common/` and `migrations/` has no
  licence statement at all. Until Hydration adds one, their TypeScript stays referenced through the submodule
  and their contracts are compiled from it unmodified. Ask Hydration for a top-level LICENSE before any
  production use.
- **Revert:** not applicable.

## 2026-11-23 — Owner directions after M0

- M3 additionally dry-runs whether Hydration's XCM `ExchangeAsset` routes USDT.sb (1000767) to USDT (10) on
  the fork, and reports the result; it decides the S-ETH design (HANDOFF §8.3, §16).
- `ETH_MAINNET_RPC` stays on dRPC's keyless endpoint; raise it again before M6.
- M4: the Sepolia NTT manager needs a peer registered for Wormhole chain 73 before `transfer()` works.

## 2026-11-23 — Node pinned to 26

- **What:** `.nvmrc` is `26`, `engines.node` is `26.x`, and `.npmrc` sets `engine-strict=true` so pnpm
  refuses other majors. HANDOFF §10 and §12 say Node 22. This supersedes the earlier toolchain entry.
- **Why:** 26.7.0 is the Node on the owner's machine and the one everything has been verified on. Native
  modules load on it: `sqlite3@6.0.1` (chopsticks state cache, exercised by every fork run) and
  `better-sqlite3@13.2.0` (the relayer's store from M4; installed and queried in a scratch project).
- **Revert:** change `.nvmrc` and `engines` together, then rerun `pnpm install`, `pnpm test`, `pnpm check:forks`.

## 2026-11-23 — Fork setup shortcut: EVM account funding in `check:forks`

- **What:** `forks/src/checks/evm-write.ts` gives a throwaway EVM key HDX and WETH (asset 20) and whitelists it
  in `EVMAccounts.ContractDeployer` with `dev_setStorage` before it deploys a probe contract.
- **Why:** Hydration charges EVM gas in WETH and gates CREATE on the deployer whitelist.
- **Revert:** not applicable; fork-only.

## 2026-11-23 — whm build restores `soldeer.lock`

- **What:** `pnpm whm:build` runs `forge soldeer install` and `forge build` inside `third_party/whm/contracts`,
  then `git checkout -- soldeer.lock` in the submodule.
- **Why:** Foundry 1.10's soldeer rewrites the lock file with a `version = 2` header. whm's files must stay
  untouched; dependencies and build output land in directories whm already gitignores.
- **Revert:** drop the checkout once whm commits a version 2 lock file.

## 2026-11-23 — M2 contract design choices

- **One token per route.** `configureBasejump`, `configurePsm` and `configureSnowbridge` each bind one bridge
  and one token, once. This keeps `deployAndForward(params, route, routeArgs)` exactly as HANDOFF §7.1 writes
  it (`routeArgs` empty for Basejump and PSM). The Snowbridge XCM template is token-specific anyway.
  _Revert:_ a per-route token allowlist needs a `token` argument and a template per token.
- **Forwarder interface.** HANDOFF §7.2 sketches `execute(Route, bytes)` with stored params. The forwarder
  instead stores only `paramsHash` (equal to its CREATE2 salt) and takes `Params` on every call, checking them
  against the hash; it reads bridge, token and templates from the factory. One storage write per deployment.
- **`onlyRelayer` is on** for `deployAndForward` and `forward` (HANDOFF marks it optional). A stranger could
  otherwise pick Snowbridge with zero relayer fee and strand a deposit in transit.
- **Refund authorisation.** HANDOFF says "always allowed" and "permissionless after a timeout". A fully
  permissionless refund lets anyone bounce every deposit before the relayer forwards it, and a timeout needs a
  timestamp that a plain ERC-20 transfer to a counterfactual address never records. `refund` is callable by the
  relayer and by the bound refund address, and always pays the bound refund address. _Production question:_ a
  refund address that cannot send transactions (an exchange) depends on the relayer; a deadline bound into the
  salt would fix that.
- **Ether.** Forwarders accept ether because the PSM vault returns unused message fee to its caller. Whatever
  a bridge returns goes back to the relayer in the same call; ether that was already at the deposit address
  stays and is refundable with `refund(params, address(0))`.
- **Snowbridge fees** come from `routeArgs` and are only bounded by `msg.value`, as specified. A relayer can
  therefore underpay and delay a message, but not redirect it; the claimer is the beneficiary.
- **Template placeholder** is `0xbe…be` (32 bytes). The factory rejects a template with no slot, a slot that
  is not the placeholder, or a placeholder missing from the offsets. The constant min-out limitation of
  HANDOFF §7.3 will apply to the real S-ETH template built in M6.
- **Trust point (unchanged from HANDOFF §7.1):** the factory owner picks each route's bridge, token and
  template once. In the POC the owner and relayer are the same dev key.

## 2026-11-23 — M2 layout and tooling choices

- **`contracts/ts`** holds the TypeScript side of our contracts (ABIs, forge artifact loader, deterministic
  deployment), exported as `@onramp/contracts`. HANDOFF §12 has no slot for it; it sits next to the Solidity it
  describes. Hand-written ABIs are checked against the compiled artifacts by `contracts/ts/test/abi.test.ts`.
- **Factory address.** Deployed through the CREATE2 deployer with a fixed salt; the owner is a constructor
  argument, so the address depends on the owner and the creation code. `bytecode_hash = "none"` and
  `cbor_metadata = false` keep the creation code independent of compiler metadata. The forwarder
  implementation is created in the factory's constructor, at the factory's CREATE nonce 1.
- **Bridge interfaces.** `IBasejumpEmitter` is imported from the whm submodule. `IHollarPsmVault` is declared
  here because whm's `IHollarBaseVault` declares no functions, and `ISnowbridgeGatewayV2` because Snowbridge's
  contracts are not vendored; both are single-function declarations to be exercised against the real contracts
  in M5 and M6.
- **Cross-language fixtures.** `contracts/test/fixtures/*.json` are written by the vitest suites
  (`vitest -u` regenerates them) and read by the Foundry suites, so TypeScript and Solidity are tested against
  the same vectors. The XCM fixture is encoded with Asset Hub's own `PolkadotXcm.send` argument codec.
- **Solidity toolchain.** solc 0.8.34, EVM version cancun, dependencies through soldeer
  (forge-std 1.14.0, OpenZeppelin 5.5.0, the versions whm uses).

## 2026-11-23 — Routes are fixed when the factory is constructed

- **What:** The factory has no route setters any more. Its constructor takes the routes of every chain
  (`ChainRoutes[]`: bridge and token per route, plus the Snowbridge templates), keeps the entry matching
  `block.chainid`, and stores bridges and tokens as immutables. This supersedes the set-once `configure*`
  functions of the M2 entry.
- **Why (owner direction):** with set-once setters the owner could still configure a route that had been left
  empty and point it at any bridge, redirecting pending deposits whose mask allowed that route. Now nothing
  the owner can call changes where a route leads; `test_ownerCannotRedirectPendingDeposits` and the ABI
  surface test in `contracts/ts/test/abi.test.ts` pin that down.
- **Same address on every chain:** the list covers all chains, so the creation code, and with it the CREATE2
  address, is identical on Sepolia, Base Sepolia and the mainnet fork (HANDOFF §5). The factory address is a
  hash over the whole route configuration, so a deposit address already commits to its routes indirectly.
- **Limits:**
  - Adding or changing a route on any chain needs a new factory, which means new deposit addresses
    everywhere. In this POC that happens at each of M4, M5 and M6 as the routes come online; forwarders of an
    older factory keep working with the routes they were created with.
  - Trust in the route configuration sits with whoever deployed the factory: they chose the bridges, tokens
    and Snowbridge templates. It is verifiable (recompute the address from the configuration) but not
    enforced per deposit.
- **Production plan (owner):** commit a hash of the route configuration into the forwarder salt, so each
  deposit address is tied to the exact routes it was created with, independent of the factory.
- **Revert:** not intended.

## 2026-11-23 — Owner and relayer are separate keys

- **What:** The constructor takes `owner` and `relayer`. The owner's only function is `setRelayer` (plus
  Ownable's ownership transfer); the relayer triggers forwarding and refunds. Rotating the relayer changes
  neither the factory address nor any deposit address. `.env` gains `OWNER_EVM_PK`; only its address is used
  at deployment, and any funded account can send the deployment transaction.
- **Why (owner direction):** the hot relayer key should be replaceable without touching deposits.
- **Revert:** not intended.

## 2026-11-23 — Refund address is a per-top-up EVM key derived from the seed

- **What:** `refund = address(secp256k1 key blake2b-256("dep-poc/evm" || seed))`, derived in
  `packages/keys` (`deriveRefundAccount`, `topUpParams`). `REFUND_ADDRESS` is gone from the configuration;
  HANDOFF §6 had it as a dev EOA from config. `refund` stays callable by the relayer or that address, pays
  only that address, and works for any ERC-20 and for ether.
- **Why (owner direction):** the app holds the refund key for every top-up, so a refund never needs a
  user-supplied address, and the key can be exported to the user.
- **One-way:** the EVM key is a hash of the seed. Knowing it reveals neither the seed nor the Asset Hub key,
  which is the seed used directly as an sr25519 mini-secret.
- **Gas:** the derived address holds no ether, so in practice the relayer sends the refund transaction and
  pays for it; the refunded tokens then sit at an address only the key holder can move, and moving them
  needs gas there.
- **Revert:** pass a different `refund` when building `ForwarderParams`.

## 2026-11-23 — Ethereum fork source comes from `.env` only

- **What:** `ETH_MAINNET_RPC` has no default any more; the owner's keyed archive endpoint in `.env` replaces
  the dRPC public endpoint. `pnpm forks:up` and `pnpm check:env` fail with a clear message without it.
- **Why (owner direction).**
- **Revert:** set `ETH_MAINNET_RPC` to any archive-capable endpoint.
