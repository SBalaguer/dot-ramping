# CLAUDE.md
 
Cross-chain deposit POC: stablecoins sent to per-top-up deposit addresses on Sepolia / Base Sepolia end up as USDT 1984 on Asset Hub, via Wormhole + Hydration (small) or Snowbridge (large).
 
## Read first
- `HANDOFF.md` is the spec. Read it fully before coding. Build in the milestone order of section 13.
- `DECISIONS.md` is append-only. Log every deviation, fallback and setup shortcut there (date, what, why, how to revert).
## Hard rules
- Never fake a bridge message, VAA, delivery or swap result. Real testnets where they exist, mainnet forks only where they don't (HANDOFF §5). Fork *setup* shortcuts (funding, registering a facilitator, guardian set) are fine if logged. The single exception is the Snowbridge relay hop, reconstructed exactly as HANDOFF §8.3 describes and labelled "relay simulated".
- Forwarders must stay non-custodial: beneficiary and refund are bound in the CREATE2 salt; the relayer can never pick a destination. Don't add arbitrary-call or owner-sweep functions.
- One fresh forwarder address and one fresh Asset Hub key per top-up, derived from `(id, entropy)` (HANDOFF §6).
- No real money. When an account needs testnet funds, stop and print the address, chain, token and amount for the owner (`pnpm funding:report`).
- Never commit secrets. `.env` is gitignored; keep `.env.example` current.
- polkadot-api (PAPI) for Substrate, viem for EVM. Don't use ParaSpell for fee-sensitive XCM.
## Code standards
Write like a seasoned open-source maintainer whose code gets reviewed by strangers.
- Clean architecture: clear module boundaries, single responsibility, dependencies pointing inward. Shared logic lives in `packages/`, never copy-pasted.
- Small files and functions. If a file grows past ~300 lines or does two jobs, split it.
- Names carry the meaning. Comments only where the code can't say it (an invariant, a protocol quirk, a non-obvious constraint), one line, written as documentation. No narration, no explaining your reasoning, no "Note:", "Here we…", "This function…", no emoji, no AI tells.
- Tests prove the code is sound: invariants, edge cases, security properties (non-custodial guarantees, address parity, payload encoding). No tests that only restate the implementation or pad coverage.
- No dead code, commented-out code, TODOs without an issue reference, or speculative abstractions.
## Git
- This repo only: commit on your own, without asking first. Don't push unless the owner asks.
- Commits don't need GPG signing here. If the global config enforces it, commit with `git -c commit.gpgsign=false commit …` rather than changing the owner's git config.
- Commit often and with intent: one logical change per commit, reviewable on its own, and the full test suite passes at every commit.
- Messages: short imperative subject (≤ 60 chars), optional body only when the why isn't obvious. No co-author trailers, no tool or AI attribution, no emoji.
## Working style
- Small, verifiable steps. Each milestone ends with a runnable script and passing tests.
- Before an on-chain write, dry-run (XCM `DryRunApi`, `eth_call`/`simulateContract`).
- Re-verify environment facts (HANDOFF §5) instead of trusting them; they were checked on 2026-11-23.
- Stuck more than an hour: log attempts in `DECISIONS.md`, take the documented fallback, move on.
- `third_party/whm` is Hydration's MIT code, used read-only. Deploy our own instances; don't edit their files.
## Commands (keep this updated as the repo grows)
- `pnpm install` · `pnpm test` · `pnpm -F contracts test` (forge)
- `pnpm forks:up` / `pnpm forks:down`
- `pnpm relayer:dev` · `pnpm web:dev`
- `pnpm demo:w-eth` · `pnpm demo:w-base` · `pnpm demo:s-eth`
- `pnpm check:env` · `pnpm check:forks`
- `pnpm funding:report`
