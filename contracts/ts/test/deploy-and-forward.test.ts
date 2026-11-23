import { CREATE2_DEPLOYER, startAnvil, type Anvil } from "@onramp/chains";
import {
  Route,
  deriveBeneficiary,
  forwarderAddress,
  implementationOf,
  newTopUpSecrets,
  routeMask,
  type ForwarderParams,
} from "@onramp/keys";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil as anvilChain } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { factoryAbi, forwarderAbi } from "../abi";
import { loadArtifact } from "../artifacts";
import { deployFactory, factoryAddress } from "../deploy";

/** Anvil's first and second pre-funded dev keys. */
const RELAYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const REFUND = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const DEPOSIT = parseUnits("120", 6);
const OTHER_ACCOUNT: Hex = `0x${"aa".repeat(32)}`;

describe("deposit forwarding on a local anvil", { timeout: 60_000 }, () => {
  let node: Anvil;
  let reader: PublicClient;
  let relayer: WalletClient<Transport, Chain, Account>;
  let factory: Address;
  let usdc: Address;
  let emitter: Address;
  const usdcAbi = loadArtifact("MockERC20").abi;
  const emitterAbi = loadArtifact("MockBasejumpEmitter").abi;

  async function deployMock(contract: string, args: unknown[] = []): Promise<Address> {
    const { abi, bytecode } = loadArtifact(contract);
    const hash = await relayer.deployContract({ abi, bytecode, args });
    const { contractAddress } = await reader.waitForTransactionReceipt({ hash });
    if (!contractAddress) throw new Error(`${contract} was not deployed`);
    return contractAddress;
  }

  async function send(address: Address, abi: Abi, functionName: string, args: unknown[], value = 0n) {
    const hash = await relayer.writeContract({ address, abi, functionName, args, value });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  }

  function newTopUp(): ForwarderParams {
    const secrets = newTopUpSecrets();
    return {
      ...secrets,
      beneficiary: deriveBeneficiary(secrets).accountId,
      refund: REFUND.address,
      routeMask: routeMask(Route.Basejump, Route.Snowbridge),
    };
  }

  beforeAll(async () => {
    node = await startAnvil();
    const transport = http(node.url);
    reader = createPublicClient({ chain: anvilChain, transport });
    relayer = createWalletClient({ account: RELAYER, chain: anvilChain, transport });

    factory = await deployFactory(relayer, reader);
    usdc = await deployMock("MockERC20", ["USDC"]);
    emitter = await deployMock("MockBasejumpEmitter");
    await send(factory, factoryAbi, "configureBasejump", [emitter, usdc]);
  });

  afterAll(() => node?.stop());

  it("deploys the factory at its deterministic address, idempotently", async () => {
    expect(await reader.getCode({ address: CREATE2_DEPLOYER })).toBeDefined();
    expect(factory).toBe(factoryAddress(RELAYER.address));
    expect(await deployFactory(relayer, reader)).toBe(factory);
    expect(await reader.readContract({ address: factory, abi: factoryAbi, functionName: "implementation" })).toBe(
      implementationOf(factory),
    );
  });

  it("bridges a deposit sent to the TypeScript-derived address to the derived beneficiary", async () => {
    const params = newTopUp();
    const deposit = forwarderAddress(factory, params);
    expect(
      await reader.readContract({ address: factory, abi: factoryAbi, functionName: "predict", args: [params] }),
    ).toBe(deposit);

    await send(usdc, usdcAbi, "mint", [deposit, DEPOSIT]);
    expect(await reader.getCode({ address: deposit })).toBeUndefined();

    await send(factory, factoryAbi, "deployAndForward", [params, Route.Basejump, "0x"], parseEther("0.01"));

    expect(await reader.getCode({ address: deposit })).toBeDefined();
    const read = (functionName: string) => reader.readContract({ address: emitter, abi: emitterAbi, functionName });
    expect(await read("lastRecipient")).toBe(params.beneficiary);
    expect(await read("lastAmount")).toBe(DEPOSIT);
    expect(await read("lastValue")).toBe(parseEther("0.01"));
    expect(await reader.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [deposit] })).toBe(
      0n,
    );
  });

  it("refunds an unforwarded deposit to the refund address on its own request", async () => {
    const params = newTopUp();
    const deposit = forwarderAddress(factory, params);
    await send(usdc, usdcAbi, "mint", [deposit, DEPOSIT]);

    const refunder = createWalletClient({ account: REFUND, chain: anvilChain, transport: http(node.url) });
    const hash = await refunder.writeContract({
      address: factory,
      abi: factoryAbi,
      functionName: "refund",
      args: [params, usdc],
    });
    expect((await reader.waitForTransactionReceipt({ hash })).status).toBe("success");

    const balanceOf = (owner: Address) =>
      reader.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [owner] });
    expect(await balanceOf(REFUND.address)).toBe(DEPOSIT);
    expect(await balanceOf(deposit)).toBe(0n);
  });

  it("rejects a relayer that swaps the beneficiary", async () => {
    const params = newTopUp();
    await send(usdc, usdcAbi, "mint", [forwarderAddress(factory, params), DEPOSIT]);
    const tampered: ForwarderParams = { ...params, beneficiary: OTHER_ACCOUNT };

    await expect(
      reader.simulateContract({
        account: RELAYER,
        address: factory,
        abi: [...factoryAbi, ...forwarderAbi],
        functionName: "deployAndForward",
        args: [tampered, Route.Basejump, "0x"],
      }),
    ).rejects.toThrow(/NothingToForward/);
  });
});
