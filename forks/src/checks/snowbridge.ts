import { hub, hydration } from "@galacticcouncil/descriptors";
import { HYDRATION_ASSET, MAINNET_USDT, devUserAccount, relayerAccount, tetherAbi } from "@onramp/chains";
import { actor, factoryAbi, send } from "@onramp/contracts";
import { Route, deriveBeneficiary, newTopUpSecrets, routeMask, topUpParams } from "@onramp/keys";
import {
  acceptedMessage,
  assetHubHead,
  bridgeHubXcm,
  deliverFromBridgeHub,
  forwardViaSnowbridge,
  quoteSnowbridgeFees,
  rehearseOnAssetHub,
  snowbridgeGatewayOf,
  swapAndSendHome,
  usdtOnAssetHub,
  usdtSbHomeSwap,
  xcmCodec,
} from "@onramp/routes";
import { formatEther } from "viem";

import type { PolkadotForks } from "../polkadot";
import { setUpEthereumFork } from "../setup";
import { waitFor } from "./wait";

const USDT = 10n ** 6n;
const DEPOSIT = 300n * USDT;

/**
 * S-ETH end to end without the relayer service: USDT sent to a fresh deposit address on the Ethereum fork
 * goes through the real Gateway, the Gateway's event is rebuilt into Bridge Hub's message, and Asset Hub and
 * Hydration execute it; the top-up's own key then swaps and sends USDT home. Delivering the rebuilt message a
 * second time must not reach Asset Hub again.
 */
export async function checkSnowbridge(forks: PolkadotForks): Promise<string> {
  const relayer = actor("ethereumFork", relayerAccount());
  const user = actor("ethereumFork", devUserAccount());
  const hydrationApi = forks.hydration.client.getTypedApi(hydration);
  const assetHubApi = forks.assetHub.client.getTypedApi(hub);
  const codec = await xcmCodec();

  const factory = await setUpEthereumFork(relayer.wallet.account, user.wallet.account.address);
  const secrets = newTopUpSecrets();
  const account = deriveBeneficiary(secrets);
  const params = topUpParams(secrets, routeMask(Route.Snowbridge, Route.Basejump, Route.Psm));
  const forwarder = await relayer.reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "predict",
    args: [params],
  });
  const depositedAt = await relayer.reader.getBlockNumber();
  await send(user, { address: MAINNET_USDT, abi: tetherAbi, functionName: "transfer", args: [forwarder, DEPOSIT] });

  const gateway = await snowbridgeGatewayOf(relayer, factory);
  const fees = await quoteSnowbridgeFees(assetHubApi, codec, {
    gateway,
    origin: forwarder,
    token: MAINNET_USDT,
    amount: DEPOSIT,
    beneficiary: account.accountId,
  });
  const sent = await forwardViaSnowbridge(relayer, factory, params, depositedAt, () => Promise.resolve(fees));
  const message = await acceptedMessage(relayer, gateway, sent.txHash);
  if (message.origin !== forwarder || message.amount !== DEPOSIT) {
    throw new Error(`the Gateway recorded ${message.amount} from ${message.origin}`);
  }

  const xcm = bridgeHubXcm(codec, message);
  await rehearseOnAssetHub(assetHubApi, xcm);
  const before = await assetHubHead(forks.assetHub.client);
  const delivered = await deliverFromBridgeHub(forks.assetHub.client, codec, xcm, before);

  const held = (asset: number) => hydrationApi.apis.CurrenciesApi.free_balance(asset, account.address, { at: "best" });
  const arrived = await waitFor("USDT.sb on Hydration", async () => {
    const balance = await held(HYDRATION_ASSET.usdtSb);
    return balance > 0n ? balance : undefined;
  });
  const headAfterDelivery = await assetHubHead(forks.assetHub.client);
  const repeated = await deliverFromBridgeHub(forks.assetHub.client, codec, xcm, before);
  if (
    repeated.blockNumber !== delivered.blockNumber ||
    (await assetHubHead(forks.assetHub.client)) !== headAfterDelivery
  ) {
    throw new Error("delivering the same message again reached Asset Hub a second time");
  }
  if ((await held(HYDRATION_ASSET.usdtSb)) !== arrived) throw new Error("the repeated delivery paid out again");

  const home = await swapAndSendHome(hydrationApi, account, usdtSbHomeSwap);
  const credited = await waitFor("USDT on Asset Hub", async () => {
    const balance = await usdtOnAssetHub(assetHubApi, account.address);
    return balance > 0n ? balance : undefined;
  });

  const left = await Promise.all([held(HYDRATION_ASSET.usdtSb), held(HYDRATION_ASSET.usdt)]);
  if (left.some((balance) => balance >= USDT / 100n)) throw new Error(`left on Hydration: ${left.join(", ")}`);
  if (credited < (DEPOSIT * 995n) / 1000n) throw new Error(`Asset Hub credited only ${credited} for ${DEPOSIT}`);

  return `${DEPOSIT} USDT through the Gateway (nonce ${message.nonce}, fees ${formatEther(fees.executionFee + fees.relayerFee)} ETH) arrived as ${arrived} USDT.sb on Hydration; sold ${home.sold} for ${home.bought} USDT; Asset Hub credited ${credited}`;
}
