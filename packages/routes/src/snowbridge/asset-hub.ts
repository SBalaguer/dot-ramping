import { hub, XcmV5Junction, XcmV5Junctions, XcmVersionedLocation } from "@galacticcouncil/descriptors";
import { BRIDGE_HUB_PARA_ID, HYDRATION_PARA_ID, type AssetHubApi } from "@onramp/chains";
import { getTypedCodecs, type PolkadotClient } from "polkadot-api";
import { hexToNumber, type Hex } from "viem";

import type { VersionedXcm, XcmCodec } from "../xcm-codec";
import { xcmpMessage } from "./relay";

const bridgeHub = XcmVersionedLocation.V5({
  parents: 1,
  interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(BRIDGE_HUB_PARA_ID)),
});

type Rehearsal = Awaited<ReturnType<AssetHubApi["apis"]["DryRunApi"]["dry_run_xcm"]>>;
type RehearsalEvents = Extract<Rehearsal, { success: true }>["value"]["emitted_events"];

const describe = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item));

/** The topic a message ends in; Asset Hub reports the message's outcome under it. */
export function topicOf(xcm: VersionedXcm): Hex {
  const last = xcm.value.at(-1);
  if (last?.type !== "SetTopic") throw new Error("the message does not end in a topic");
  return last.value as Hex;
}

/**
 * Dry-runs a message from Bridge Hub on Asset Hub. It must complete and hand exactly one message on to
 * Hydration; the events it would emit are returned.
 */
export async function rehearseOnAssetHub(api: AssetHubApi, xcm: VersionedXcm): Promise<RehearsalEvents> {
  const result = await api.apis.DryRunApi.dry_run_xcm(bridgeHub, xcm, { at: "best" });
  if (!result.success) throw new Error(`Asset Hub refused the dry-run: ${result.value.type}`);
  const { execution_result: outcome, forwarded_xcms: forwarded, emitted_events: events } = result.value;
  if (outcome.type !== "Complete") throw new Error(`Asset Hub would not complete the message: ${describe(outcome)}`);

  const toHydration = forwarded.flatMap(([destination, messages]) => {
    const { interior } = destination.value;
    const isHydration =
      interior.type === "X1" && interior.value.type === "Parachain" && interior.value.value === HYDRATION_PARA_ID;
    return isHydration ? messages : [];
  });
  if (toHydration.length !== 1) {
    throw new Error(`Asset Hub would forward ${toHydration.length} messages to Hydration instead of one`);
  }
  return events;
}

export interface AssetHubOutcome {
  blockNumber: number;
  blockHash: Hex;
  success: boolean;
}

/** `System.Events`, the same key on every Substrate chain. */
const EVENTS_KEY = "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7";

/** How Asset Hub's message queue ended the message with `topic`, looking at the blocks after `sinceBlock`. */
async function assetHubOutcome(
  client: PolkadotClient,
  topic: Hex,
  sinceBlock: number,
): Promise<AssetHubOutcome | undefined> {
  const events = (await getTypedCodecs(hub)).query.System.Events.value;
  const head = await assetHubHead(client);

  for (let blockNumber = sinceBlock + 1; blockNumber <= head; blockNumber++) {
    const blockHash = await client._request<Hex, [number]>("chain_getBlockHash", [blockNumber]);
    const encoded = await client._request<Hex | null, [Hex, Hex]>("state_getStorage", [EVENTS_KEY, blockHash]);
    if (!encoded) continue;
    for (const { event } of events.dec(encoded)) {
      if (event.type !== "MessageQueue") continue;
      if (event.value.type === "Processed" && event.value.value.id === topic) {
        return { blockNumber, blockHash, success: event.value.value.success };
      }
      if (event.value.type === "ProcessingFailed" && event.value.value.id === topic) {
        return { blockNumber, blockHash, success: false };
      }
    }
  }
  return undefined;
}

/**
 * Hands Asset Hub a message as if Bridge Hub had sent it: the fork builds a block with it in the HRMP
 * channel from Bridge Hub, and Asset Hub's own queue, barrier and executor take it from there. This is the
 * simulated half of the relay hop; it only works against a fork's `dev_newBlock`.
 */
async function injectFromBridgeHub(client: PolkadotClient, codec: XcmCodec, xcm: VersionedXcm): Promise<void> {
  // The fork stamps the message with its own relay block number.
  const message = { sentAt: 0, data: xcmpMessage(codec, xcm) };
  await client._request("dev_newBlock", [{ hrmp: { [BRIDGE_HUB_PARA_ID]: [message] } }]);
}

/**
 * Delivers a Bridge Hub message to Asset Hub exactly once. Bridge Hub would refuse a repeated nonce; here
 * the blocks after `sinceBlock` are searched for the message's topic first, so calling this again for a
 * message that already ran delivers nothing. Throws if Asset Hub did not execute the message successfully.
 */
export async function deliverFromBridgeHub(
  client: PolkadotClient,
  codec: XcmCodec,
  xcm: VersionedXcm,
  sinceBlock: number,
): Promise<AssetHubOutcome> {
  const topic = topicOf(xcm);
  let outcome = await assetHubOutcome(client, topic, sinceBlock);
  if (!outcome) {
    await injectFromBridgeHub(client, codec, xcm);
    outcome = await assetHubOutcome(client, topic, sinceBlock);
  }
  if (!outcome) throw new Error(`Asset Hub took message ${topic} but has not processed it`);
  if (!outcome.success) throw new Error(`Asset Hub failed message ${topic} in block ${outcome.blockNumber}`);
  return outcome;
}

export async function assetHubHead(client: PolkadotClient): Promise<number> {
  return hexToNumber((await client._request<{ number: Hex }, []>("chain_getHeader", [])).number);
}
