import {
  XcmV3MultiassetFungibility,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
} from "@galacticcouncil/descriptors";
import { SNOWBRIDGE_INBOUND_QUEUE_PALLET, gatewayAbi } from "@onramp/chains";
import { Blake2256, Tuple, compact, str, u64 } from "@polkadot-api/substrate-bindings";
import { Enum } from "polkadot-api";
import {
  concatHex,
  decodeAbiParameters,
  decodeEventLog,
  isAddressEqual,
  size,
  toHex,
  type Address,
  type Hex,
  type Log,
} from "viem";

import type { VersionedXcm, XcmCodec, XcmInstruction } from "../xcm-codec";
import { bridgedToken, ether, ethereum } from "./xcm";

/** A message the Snowbridge Gateway accepted for Polkadot, as its `OutboundMessageAccepted` event records it. */
export interface GatewayMessage {
  gateway: Address;
  nonce: bigint;
  /** The contract or account that called the Gateway. */
  origin: Address;
  token: Address;
  amount: bigint;
  /** SCALE `VersionedXcm` supplied by the sender. */
  xcm: Hex;
  /** SCALE XCM location that may reclaim trapped assets. */
  claimer: Hex;
  /** Ether sent beyond the two fees; it joins the bridged assets on Asset Hub. */
  value: bigint;
  executionFee: bigint;
  relayerFee: bigint;
}

const NATIVE_ERC20 = 0;
const RAW_XCM = 0;
/** XCMP's `ConcatenatedOpaqueVersionedXcm`: each message is length-prefixed. Bridge Hub sends in this format. */
const XCMP_OPAQUE_VERSIONED_XCM: Hex = "0x03";
const TOPIC_PREFIX = "SnowbridgeInboundQueueV2";

const topicInput = Tuple(str, u64);

/**
 * Reads the Gateway's event from a transaction's logs. Only the shape our forwarders produce is accepted:
 * one Ethereum-native ERC-20, raw XCM and a claimer.
 */
export function gatewayMessage(logs: Pick<Log, "address" | "topics" | "data">[], gateway: Address): GatewayMessage {
  const log = logs.find(({ address }) => isAddressEqual(address, gateway));
  if (!log) throw new Error(`no event from the Snowbridge Gateway ${gateway}`);
  const { args } = decodeEventLog({
    abi: gatewayAbi,
    eventName: "OutboundMessageAccepted",
    topics: log.topics,
    data: log.data,
  });
  const { payload } = args;
  const [asset] = payload.assets;
  if (payload.assets.length !== 1 || asset?.kind !== NATIVE_ERC20) {
    throw new Error("the Gateway message does not carry exactly one Ethereum-native ERC-20");
  }
  if (payload.xcm.kind !== RAW_XCM) throw new Error("the Gateway message does not carry raw XCM");
  if (payload.claimer === "0x") throw new Error("the Gateway message names no claimer");
  const [token, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint128" }], asset.data);

  return {
    gateway,
    nonce: args.nonce,
    origin: payload.origin,
    token,
    amount,
    xcm: payload.xcm.data,
    claimer: payload.claimer,
    value: payload.value,
    executionFee: payload.executionFee,
    relayerFee: payload.relayerFee,
  };
}

/** The topic Bridge Hub gives a message whose XCM does not end in one. */
function topicOf(nonce: bigint): Hex {
  return toHex(Blake2256(topicInput.enc([TOPIC_PREFIX, nonce])));
}

/**
 * The XCM Bridge Hub sends Asset Hub for a Gateway message. Snowbridge runs no relayers on testnets, so
 * this hop is rebuilt here: a port of `MessageToXcm::convert` in Bridge Hub's inbound queue V2
 * (polkadot-sdk `bridges/snowbridge/primitives/inbound-queue/src/v2/converter.rs`) for the messages
 * `gatewayMessage` accepts. The Ethereum proof and the Bridge Hub execution around it are not reproduced.
 */
export function bridgeHubXcm(codec: XcmCodec, message: GatewayMessage): VersionedXcm {
  const sent = codec.decodeXcm(message.xcm);
  if (isAddressEqual(message.origin, message.gateway))
    throw new Error("messages from the Gateway itself are not rebuilt");

  const fungible = XcmV3MultiassetFungibility.Fungible;
  const executionFee = { id: ether, fun: fungible(message.executionFee) };
  const bridged = [
    ...(message.value > 0n ? [{ id: ether, fun: fungible(message.value) }] : []),
    { id: bridgedToken(message.token), fun: fungible(message.amount) },
  ];
  const endsInTopic = sent.value.at(-1)?.type === "SetTopic";
  const topic: XcmInstruction[] = endsInTopic ? [] : [XcmV5Instruction.SetTopic(topicOf(message.nonce))];

  return {
    type: "V5",
    value: [
      XcmV5Instruction.DescendOrigin(XcmV5Junctions.X1(XcmV5Junction.PalletInstance(SNOWBRIDGE_INBOUND_QUEUE_PALLET))),
      XcmV5Instruction.UniversalOrigin(ethereum),
      XcmV5Instruction.ReserveAssetDeposited([executionFee]),
      XcmV5Instruction.SetHints({
        hints: [Enum("AssetClaimer", { location: codec.decodeLocation(message.claimer) })],
      }),
      XcmV5Instruction.PayFees({ asset: executionFee }),
      XcmV5Instruction.ReserveAssetDeposited(bridged),
      XcmV5Instruction.DescendOrigin(
        XcmV5Junctions.X1(XcmV5Junction.AccountKey20({ network: undefined, key: message.origin.toLowerCase() })),
      ),
      ...sent.value,
      ...topic,
    ],
  };
}

/** The HRMP payload carrying `xcm`, as Bridge Hub's XCMP queue writes it. */
export function xcmpMessage(codec: XcmCodec, xcm: VersionedXcm): Hex {
  const encoded = codec.xcm(xcm);
  return concatHex([XCMP_OPAQUE_VERSIONED_XCM, toHex(compact.enc(size(encoded))), encoded]);
}
