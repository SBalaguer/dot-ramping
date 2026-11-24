import { startAnvil, type Anvil } from "@onramp/chains";
import { chainRoutes, create, deployFactory, loadArtifact, send, type Actor } from "@onramp/contracts";
import { Route, forwarderAddress, newTopUpSecrets, routeMask, topUpParams, type ForwarderParams } from "@onramp/keys";
import { createPublicClient, createWalletClient, http, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil as anvilChain } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { forwardOnce, type ForwardRequest } from "../src/forwarder";

/** Anvil's first two pre-funded dev keys. */
const RELAYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OWNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const DEPOSIT = parseUnits("40", 6);

describe("forwardOnce on a local anvil", { timeout: 60_000 }, () => {
  let node: Anvil;
  let relayer: Actor;
  let factory: Address;
  let usdc: Address;
  const token = loadArtifact("MockERC20");

  const nonce = () => relayer.reader.getTransactionCount({ address: RELAYER.address });

  async function depositedTopUp(): Promise<Omit<ForwardRequest, "fees">> {
    const params: ForwarderParams = topUpParams(newTopUpSecrets(), routeMask(Route.Basejump));
    const sinceBlock = await relayer.reader.getBlockNumber();
    const args = [forwarderAddress(factory, params), DEPOSIT];
    await send(relayer, { address: usdc, abi: token.abi, functionName: "mint", args });
    return { factory, params, route: Route.Basejump, sinceBlock };
  }

  beforeAll(async () => {
    node = await startAnvil();
    relayer = {
      wallet: createWalletClient({ account: RELAYER, chain: anvilChain, transport: http(node.url) }),
      reader: createPublicClient({ chain: anvilChain, transport: http(node.url) }),
    };
    usdc = await create(relayer, token, ["USDC"]);
    const emitter = await create(relayer, loadArtifact("MockBasejumpEmitter"));
    factory = await deployFactory(relayer.wallet, relayer.reader, {
      owner: OWNER.address,
      relayer: RELAYER.address,
      chains: [chainRoutes(anvilChain.id, { basejump: { bridge: emitter, token: usdc } })],
    });
  });

  afterAll(() => node?.stop());

  it("returns the first forward instead of sending a second transaction", async () => {
    const request = await depositedTopUp();
    let quotes = 0;
    const fees = () => Promise.resolve({ value: BigInt(++quotes) });

    const first = await forwardOnce(relayer, { ...request, fees });
    const sent = await nonce();
    const again = await forwardOnce(relayer, { ...request, fees });

    expect(again.transactionHash).toBe(first.transactionHash);
    expect(await nonce()).toBe(sent);
    expect(quotes).toBe(1);
  });

  it("refuses an empty deposit address that never forwarded", async () => {
    const params = topUpParams(newTopUpSecrets(), routeMask(Route.Basejump));
    const request = {
      factory,
      params,
      route: Route.Basejump,
      sinceBlock: 0n,
      fees: () => Promise.resolve({ value: 0n }),
    };

    await expect(forwardOnce(relayer, request)).rejects.toThrow(/forwarded nothing since block 0/);
  });

  it("does not mistake a forward from before the search window for this one", async () => {
    const request = await depositedTopUp();
    const fees = () => Promise.resolve({ value: 0n });
    const { blockNumber } = await forwardOnce(relayer, { ...request, fees });
    await send(relayer, { address: usdc, abi: token.abi, functionName: "mint", args: [OWNER.address, 1n] });

    await expect(forwardOnce(relayer, { ...request, sinceBlock: blockNumber + 1n, fees })).rejects.toThrow(
      /forwarded nothing since block/,
    );
  });
});
