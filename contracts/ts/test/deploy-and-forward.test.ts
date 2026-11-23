import { CREATE2_DEPLOYER, startAnvil, type Anvil } from "@onramp/chains";
import {
  Route,
  deriveRefundAccount,
  forwarderAddress,
  implementationOf,
  newTopUpSecrets,
  routeMask,
  topUpParams,
  type ForwarderParams,
} from "@onramp/keys";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  toHex,
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
import { chainRoutes, type FactoryConfig } from "../config";
import { deployFactory, factoryAddress } from "../deploy";

/** Anvil's first two pre-funded dev keys. */
const RELAYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OWNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const DEPOSIT = parseUnits("120", 6);
const OTHER_ACCOUNT: Hex = `0x${"aa".repeat(32)}`;
const ROUTES = routeMask(Route.Basejump, Route.Snowbridge);

describe("deposit forwarding on a local anvil", { timeout: 60_000 }, () => {
  let node: Anvil;
  let reader: PublicClient;
  let relayer: WalletClient<Transport, Chain, Account>;
  let config: FactoryConfig;
  let factory: Address;
  let usdc: Address;
  let emitter: Address;
  const erc20Abi = loadArtifact("MockERC20").abi;
  const emitterAbi = loadArtifact("MockBasejumpEmitter").abi;

  const walletOf = (account: Account) => createWalletClient({ account, chain: anvilChain, transport: http(node.url) });

  async function deployMock(contract: string, args: unknown[] = []): Promise<Address> {
    const { abi, bytecode } = loadArtifact(contract);
    const hash = await relayer.deployContract({ abi, bytecode, args });
    const { contractAddress } = await reader.waitForTransactionReceipt({ hash });
    if (!contractAddress) throw new Error(`${contract} was not deployed`);
    return contractAddress;
  }

  async function send(
    from: WalletClient<Transport, Chain, Account>,
    address: Address,
    abi: Abi,
    functionName: string,
    args: unknown[],
    value = 0n,
  ): Promise<void> {
    const hash = await from.writeContract({ address, abi, functionName, args, value });
    expect((await reader.waitForTransactionReceipt({ hash })).status).toBe("success");
  }

  const balanceOf = (token: Address, owner: Address) =>
    reader.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

  async function depositFor(params: ForwarderParams, token = usdc): Promise<Address> {
    const deposit = forwarderAddress(factory, params);
    await send(relayer, token, erc20Abi, "mint", [deposit, DEPOSIT]);
    return deposit;
  }

  beforeAll(async () => {
    node = await startAnvil();
    reader = createPublicClient({ chain: anvilChain, transport: http(node.url) });
    relayer = walletOf(RELAYER);

    usdc = await deployMock("MockERC20", ["USDC"]);
    emitter = await deployMock("MockBasejumpEmitter");
    config = {
      owner: OWNER.address,
      relayer: RELAYER.address,
      chains: [chainRoutes(anvilChain.id, { basejump: { bridge: emitter, token: usdc } })],
    };
    factory = await deployFactory(relayer, reader, config);
  });

  afterAll(() => node?.stop());

  it("deploys the factory at the address its configuration determines, idempotently", async () => {
    const read = (functionName: "implementation" | "owner" | "relayer") =>
      reader.readContract({ address: factory, abi: factoryAbi, functionName });

    expect(await reader.getCode({ address: CREATE2_DEPLOYER })).toBeDefined();
    expect(factory).toBe(factoryAddress(config));
    expect(await deployFactory(relayer, reader, config)).toBe(factory);
    expect(await read("implementation")).toBe(implementationOf(factory));
    expect(await read("owner")).toBe(OWNER.address);
    expect(await read("relayer")).toBe(RELAYER.address);
    expect(factoryAddress({ ...config, chains: [] })).not.toBe(factory);
  });

  it("bridges a deposit sent to the TypeScript-derived address to the derived beneficiary", async () => {
    const params = topUpParams(newTopUpSecrets(), ROUTES);
    const deposit = await depositFor(params);
    expect(
      await reader.readContract({ address: factory, abi: factoryAbi, functionName: "predict", args: [params] }),
    ).toBe(deposit);
    expect(await reader.getCode({ address: deposit })).toBeUndefined();

    await send(relayer, factory, factoryAbi, "deployAndForward", [params, Route.Basejump, "0x"], parseEther("0.01"));

    expect(await reader.getCode({ address: deposit })).toBeDefined();
    const read = (functionName: string) => reader.readContract({ address: emitter, abi: emitterAbi, functionName });
    expect(await read("lastRecipient")).toBe(params.beneficiary);
    expect(await read("lastAmount")).toBe(DEPOSIT);
    expect(await read("lastValue")).toBe(parseEther("0.01"));
    expect(await balanceOf(usdc, deposit)).toBe(0n);
  });

  it("lets the relayer refund an unforwarded deposit to the derived refund address", async () => {
    const params = topUpParams(newTopUpSecrets(), ROUTES);
    const deposit = await depositFor(params);

    await send(relayer, factory, factoryAbi, "refund", [params, usdc]);

    expect(await balanceOf(usdc, params.refund)).toBe(DEPOSIT);
    expect(await balanceOf(usdc, deposit)).toBe(0n);
  });

  it("lets the derived refund key pull back a stray token and ether without the relayer", async () => {
    const secrets = newTopUpSecrets();
    const params = topUpParams(secrets, ROUTES);
    const stray = await deployMock("MockERC20", ["DAI"]);
    const deposit = await depositFor(params, stray);
    const refundKey = walletOf(deriveRefundAccount(secrets));
    const setBalance = (address: Address, wei: bigint) =>
      reader.request({ method: "anvil_setBalance" as never, params: [address, toHex(wei)] as never });
    await setBalance(deposit, parseEther("0.25"));
    await setBalance(params.refund, parseEther("1"));

    await send(refundKey, factory, factoryAbi, "refund", [params, stray]);
    const etherBefore = await reader.getBalance({ address: params.refund });
    await send(refundKey, factory, factoryAbi, "refund", [params, "0x0000000000000000000000000000000000000000"]);

    expect(await balanceOf(stray, params.refund)).toBe(DEPOSIT);
    expect(await reader.getBalance({ address: deposit })).toBe(0n);
    expect((await reader.getBalance({ address: params.refund })) - etherBefore).toBeGreaterThan(parseEther("0.24"));
  });

  it("rejects a relayer that swaps the beneficiary", async () => {
    const params = topUpParams(newTopUpSecrets(), ROUTES);
    await depositFor(params);
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
