import {
  XcmV2MultiassetWildFungibility,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV5AssetFilter,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5NetworkId,
  XcmV5WildAsset,
  XcmVersionedLocation,
  XcmVersionedXcm,
} from "@galacticcouncil/descriptors";
import { MAINNET_USDT } from "@onramp/chains";

import { spawnPolkadotForks, teardownPolkadotForks, type PolkadotForks } from "../polkadot";

const USDT = 10;
const USDT_SB = 1_000_767;
const A_USDT = 1002;
const STABLESWAP_POOL = 103;
const UNIT = 10n ** 6n;
const AMOUNT = 1000n * UNIT;

const assetHub = { parents: 1, interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(1000)) };
const usdt = {
  parents: 1,
  interior: XcmV5Junctions.X3([
    XcmV5Junction.Parachain(1000),
    XcmV5Junction.PalletInstance(50),
    XcmV5Junction.GeneralIndex(1984n),
  ]),
};
const usdtSb = {
  parents: 2,
  interior: XcmV5Junctions.X2([
    XcmV5Junction.GlobalConsensus(XcmV5NetworkId.Ethereum({ chain_id: 1n })),
    XcmV5Junction.AccountKey20({ network: undefined, key: MAINNET_USDT.toLowerCase() }),
  ]),
};
const hdx = { parents: 0, interior: XcmV5Junctions.X1(XcmV5Junction.GeneralIndex(0n)) };
const recipient = {
  parents: 0,
  interior: XcmV5Junctions.X1(XcmV5Junction.AccountId32({ network: undefined, id: `0x${"d4".repeat(32)}` })),
};

interface Location {
  parents: number;
  interior: XcmV5Junctions;
}
const fungible = XcmV3MultiassetFungibility.Fungible;

function exchangeAll(give: Location, want: Location, minOut: bigint) {
  return XcmV5Instruction.ExchangeAsset({
    give: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllOf({ id: give, fun: XcmV2MultiassetWildFungibility.Fungible() })),
    want: [{ id: want, fun: fungible(minOut) }],
    maximal: true,
  });
}

/** What Asset Hub would deliver for a Snowbridge USDT transfer that swaps on arrival, directly or through `via`. */
function swapOnArrival(amount: bigint, minOut: bigint, via?: Location) {
  const swaps = via
    ? [exchangeAll(usdtSb, via, 1n), exchangeAll(via, usdt, minOut)]
    : [exchangeAll(usdtSb, usdt, minOut)];
  return XcmVersionedXcm.V5([
    XcmV5Instruction.ReserveAssetDeposited([{ id: usdtSb, fun: fungible(amount) }]),
    XcmV5Instruction.ClearOrigin(),
    XcmV5Instruction.BuyExecution({
      fees: { id: usdtSb, fun: fungible(5n * UNIT) },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),
    ...swaps,
    XcmV5Instruction.DepositAsset({ assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.All()), beneficiary: recipient }),
  ]);
}

interface DryRun {
  success: boolean;
  value: {
    execution_result: { type: string; value: { error?: { index: number; error: { type: string } } } };
    emitted_events: { type: string; value: { type: string; value: Record<string, unknown> } }[];
  };
}

async function dryRun(forks: PolkadotForks, message: ReturnType<typeof swapOnArrival>): Promise<string> {
  const api = forks.hydration.client.getUnsafeApi();
  const result = (await api.apis.DryRunApi!.dry_run_xcm!(XcmVersionedLocation.V5(assetHub), message)) as DryRun;
  if (!result.success) return "dry-run rejected";

  const { execution_result: outcome, emitted_events: events } = result.value;
  if (outcome.type !== "Complete") {
    const failure = outcome.value.error;
    return `${outcome.type}: ${failure?.error.type} at instruction ${failure?.index}`;
  }
  const swaps = events.filter((e) => e.type === "Router" && e.value.type === "Executed").map((e) => e.value.value);
  return `Complete: ${String(swaps.at(0)?.amount_in)} of ${USDT_SB} -> ${String(swaps.at(-1)?.amount_out)} of ${USDT}`;
}

const forks = await spawnPolkadotForks();
try {
  const report = async (label: string, message: ReturnType<typeof swapOnArrival>) =>
    console.log(`${label.padEnd(58)} ${await dryRun(forks, message)}`);

  await report("mainnet state, one hop", swapOnArrival(AMOUNT, 1n));
  for (const amount of [300n, 1000n, 10_000n, 100_000n]) {
    await report(`mainnet state, two hops via HDX, ${amount} USDT.sb`, swapOnArrival(amount * UNIT, 1n, hdx));
  }

  // The ordered-pair entry governance's `Router.force_insert_route` would store; `set_route` is call-filtered.
  await forks.hydration.setStorage({
    Router: {
      Routes: [
        [
          [{ assetIn: USDT, assetOut: USDT_SB }],
          [
            { pool: { Aave: null }, assetIn: USDT, assetOut: A_USDT },
            { pool: { Stableswap: STABLESWAP_POOL }, assetIn: A_USDT, assetOut: USDT_SB },
          ],
        ],
      ],
    },
  });
  // A new head, so the dry-runs below cannot be answered from results cached for the old state.
  await forks.hydration.newBlock();
  for (const minOut of [1n, 995n * UNIT, 1005n * UNIT]) {
    await report(`with a stored route, one hop, min-out ${minOut}`, swapOnArrival(AMOUNT, minOut));
  }
} finally {
  await teardownPolkadotForks(forks);
}
process.exit(0);
