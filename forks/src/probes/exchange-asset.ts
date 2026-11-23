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
const recipient = {
  parents: 0,
  interior: XcmV5Junctions.X1(XcmV5Junction.AccountId32({ network: undefined, id: `0x${"d4".repeat(32)}` })),
};

/** What Asset Hub would deliver for a Snowbridge USDT transfer that swaps on arrival. */
function swapOnArrival(minOut: bigint) {
  const fungible = XcmV3MultiassetFungibility.Fungible;
  return XcmVersionedXcm.V5([
    XcmV5Instruction.ReserveAssetDeposited([{ id: usdtSb, fun: fungible(AMOUNT) }]),
    XcmV5Instruction.ClearOrigin(),
    XcmV5Instruction.BuyExecution({
      fees: { id: usdtSb, fun: fungible(5n * UNIT) },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),
    XcmV5Instruction.ExchangeAsset({
      give: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllOf({ id: usdtSb, fun: XcmV2MultiassetWildFungibility.Fungible() })),
      want: [{ id: usdt, fun: fungible(minOut) }],
      maximal: true,
    }),
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

async function dryRun(forks: PolkadotForks, minOut: bigint): Promise<string> {
  const api = forks.hydration.client.getUnsafeApi();
  const result = (await api.apis.DryRunApi!.dry_run_xcm!(
    XcmVersionedLocation.V5(assetHub),
    swapOnArrival(minOut),
  )) as DryRun;
  if (!result.success) return "dry-run rejected";

  const { execution_result: outcome, emitted_events: events } = result.value;
  if (outcome.type !== "Complete") {
    const failure = outcome.value.error;
    return `${outcome.type}: ${failure?.error.type} at instruction ${failure?.index}`;
  }
  const swap = events.find((e) => e.type === "Router" && e.value.type === "Executed")?.value.value;
  return `Complete: ${String(swap?.amount_in)} of ${USDT_SB} -> ${String(swap?.amount_out)} of ${USDT}`;
}

const forks = await spawnPolkadotForks();
try {
  const report = async (label: string, minOut: bigint) =>
    console.log(`${label.padEnd(44)} min-out ${String(minOut).padStart(10)}: ${await dryRun(forks, minOut)}`);

  await report("mainnet state", 1n);

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
    await report("with a stored route USDT <-> USDT.sb", minOut);
  }
} finally {
  await teardownPolkadotForks(forks);
}
process.exit(0);
