import { readFileSync } from "node:fs";

import { MAINNET_USDT, snowbridgeGateway } from "@onramp/chains";
import { getAddress, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

import { bridgeHubXcm, gatewayMessage, xcmpMessage, type GatewayMessage } from "../src/snowbridge/relay";
import { claimer, transferToHydration } from "../src/snowbridge/xcm";
import { xcmCodec, type XcmCodec } from "../src/xcm-codec";

interface MainnetMessage {
  log: { address: Hex; topics: [Hex, ...Hex[]]; data: Hex };
  hrmpToAssetHub: Hex;
}

const mainnet = JSON.parse(
  readFileSync(new URL("./fixtures/snowbridge-mainnet-message.json", import.meta.url), "utf8"),
) as MainnetMessage;
const BENEFICIARY: Hex = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";

let codec: XcmCodec;
beforeAll(async () => {
  codec = await xcmCodec();
});

describe("Bridge Hub relay reconstruction", () => {
  it("rebuilds, byte for byte, the message Bridge Hub sent Asset Hub for a real mainnet transfer", () => {
    const message = gatewayMessage([mainnet.log], snowbridgeGateway());

    expect(message).toMatchObject({ nonce: 1529n, token: MAINNET_USDT, amount: 70_000_000n });
    expect(xcmpMessage(codec, bridgeHubXcm(codec, message))).toBe(mainnet.hrmpToAssetHub);
  });

  it("gives a message without a topic the one Bridge Hub derives from its nonce", () => {
    const ours: GatewayMessage = {
      gateway: snowbridgeGateway(),
      nonce: 7n,
      origin: getAddress(`0x${"11".repeat(20)}`),
      token: MAINNET_USDT,
      amount: 300_000_000n,
      xcm: codec.xcm(transferToHydration(BENEFICIARY)),
      claimer: codec.location(claimer(BENEFICIARY)),
      value: 0n,
      executionFee: 10n ** 14n,
      relayerFee: 10n ** 14n,
    };
    const { value: instructions } = bridgeHubXcm(codec, ours);
    const next = bridgeHubXcm(codec, { ...ours, nonce: 8n }).value;

    expect(instructions.at(-1)?.type).toBe("SetTopic");
    expect(instructions.at(-1)).not.toEqual(next.at(-1));
    expect(instructions.slice(0, -1)).toEqual(next.slice(0, -1));
    expect(instructions.filter(({ type }) => type === "ReserveAssetDeposited")[1]?.value).toHaveLength(1);
  });

  it("refuses logs without a Gateway event", () => {
    const elsewhere = { ...mainnet.log, address: getAddress(`0x${"22".repeat(20)}`) };
    expect(() => gatewayMessage([elsewhere], snowbridgeGateway())).toThrow(/no event from the Snowbridge Gateway/);
  });
});
