import { HYDRATION_ASSET } from "@onramp/chains";
import {
  acceptedMessage,
  assetHubHead,
  bridgeHubXcm,
  deliverFromBridgeHub,
  forwardViaSnowbridge,
  quoteSnowbridgeFees,
  rehearseOnAssetHub,
  snowbridgeGatewayOf,
  topicOf,
  type GatewayMessage,
} from "@onramp/routes";
import type { Address, Hash, Hex } from "viem";

import type { Context } from "../context";
import type { Outcome, StepDefinition } from "../pipeline";
import { paramsOf } from "../secrets";
import { refsOf, type Refs, type TopUp } from "../topup";

const messageRefs = (message: GatewayMessage): Refs => ({
  gateway: message.gateway,
  nonce: message.nonce.toString(),
  origin: message.origin,
  token: message.token,
  amount: message.amount.toString(),
  xcm: message.xcm,
  claimer: message.claimer,
  value: message.value.toString(),
  executionFee: message.executionFee.toString(),
  relayerFee: message.relayerFee.toString(),
});

function messageOf(topUp: TopUp): GatewayMessage {
  const refs = refsOf(topUp, "GATEWAY_EVENT") as Record<keyof GatewayMessage, string>;
  return {
    gateway: refs.gateway as Address,
    nonce: BigInt(refs.nonce),
    origin: refs.origin as Address,
    token: refs.token as Address,
    amount: BigInt(refs.amount),
    xcm: refs.xcm as Hex,
    claimer: refs.claimer as Hex,
    value: BigInt(refs.value),
    executionFee: BigInt(refs.executionFee),
    relayerFee: BigInt(refs.relayerFee),
  };
}

export const snowbridgeSubmitted: StepDefinition<Context> = {
  name: "SOURCE_SUBMITTED",
  chain: "ethereumFork",
  async run({ sources, factory, assetHub, codec }, topUp) {
    const { by } = sources.ethereumFork;
    const deposit = refsOf(topUp, "DEPOSIT_DETECTED");
    const gateway = await snowbridgeGatewayOf(by, factory);
    const quote = () =>
      quoteSnowbridgeFees(assetHub, codec, {
        gateway,
        origin: topUp.forwarder,
        token: deposit.token as Address,
        amount: BigInt(deposit.amount!),
        beneficiary: topUp.beneficiary.accountId,
      });
    const sent = await forwardViaSnowbridge(by, factory, paramsOf(topUp), BigInt(deposit.block!), quote);
    return { done: { tx: sent.txHash, block: sent.blockNumber.toString(), gateway } };
  },
};

export const gatewayEvent: StepDefinition<Context> = {
  name: "GATEWAY_EVENT",
  chain: "ethereumFork",
  async run({ sources }, topUp) {
    const { tx, gateway } = refsOf(topUp, "SOURCE_SUBMITTED");
    return { done: messageRefs(await acceptedMessage(sources.ethereumFork.by, gateway as Address, tx as Hash)) };
  },
};

/** The one hop that is not executed by a real chain: Bridge Hub's message is rebuilt from the Gateway's event. */
export const relaySimulated: StepDefinition<Context> = {
  name: "RELAY_SIMULATED",
  chain: "bridge-hub",
  run({ codec }, topUp) {
    const xcm = bridgeHubXcm(codec, messageOf(topUp));
    return Promise.resolve({ done: { relay: "simulated", topic: topicOf(xcm), message: codec.xcm(xcm) } });
  },
};

export const dryRunOk: StepDefinition<Context> = {
  name: "DRY_RUN_OK",
  chain: "asset-hub",
  async run({ assetHub, assetHubClient, codec }, topUp) {
    const { message } = refsOf(topUp, "RELAY_SIMULATED");
    const head = await assetHubHead(assetHubClient);
    await rehearseOnAssetHub(assetHub, codec.decodeXcm(message as Hex));
    return { done: { block: String(head), forwardsTo: "hydration" } };
  },
};

/** Safe to repeat: the message is only injected if Asset Hub has not processed it since the dry-run. */
export const deliveredAssetHub: StepDefinition<Context> = {
  name: "DELIVERED_AH",
  chain: "asset-hub",
  async run({ assetHubClient, codec }, topUp) {
    const { message, topic } = refsOf(topUp, "RELAY_SIMULATED");
    const since = Number(refsOf(topUp, "DRY_RUN_OK").block);
    const outcome = await deliverFromBridgeHub(assetHubClient, codec, codec.decodeXcm(message as Hex), since);
    return { done: { block: String(outcome.blockNumber), blockHash: outcome.blockHash, topic: topic! } };
  },
};

export const arrivedOnHydration: StepDefinition<Context> = {
  name: "DELIVERED",
  chain: "hydration",
  async run({ hydration }, topUp): Promise<Outcome> {
    const { usdtSb } = HYDRATION_ASSET;
    const held = await hydration.apis.CurrenciesApi.free_balance(usdtSb, topUp.beneficiary.ss58, { at: "best" });
    if (held === 0n) return { waiting: "the transfer has not reached Hydration yet" };
    return { done: { asset: String(usdtSb), received: held.toString() } };
  },
};
