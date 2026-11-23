import {
  CREATE2_DEPLOYER,
  GATEWAY_MODE_NORMAL,
  MAINNET_USDT,
  WORMHOLE_TESTNET,
  gatewayAbi,
  latestSignedVaa,
  publicClient,
  snowbridgeGateway,
  wormholeCoreAbi,
  type EvmChainKey,
} from "@onramp/chains";
import { spawnEthereumFork } from "@onramp/forks";
import { keccak256 } from "viem";

type Testnet = keyof typeof WORMHOLE_TESTNET;

const TESTNETS: Testnet[] = ["sepolia", "baseSepolia"];
const MAX_HEAD_AGE_SECONDS = 300;
const MAX_VAA_AGE_HOURS = 24;
const HYDRATION_PASEO_RPC = "https://paseo-rpc.play.hydration.cloud";
const HYDRATION_PASEO_LAST_BLOCK = 2_919_026;

const secondsAgo = (unixSeconds: number): number => Math.floor(Date.now() / 1000) - unixSeconds;

async function testnetHead(key: Testnet): Promise<string> {
  const client = publicClient(key);
  const [chainId, head] = await Promise.all([client.getChainId(), client.getBlock()]);
  if (chainId !== client.chain?.id) throw new Error(`RPC serves chain ${chainId}`);
  const age = secondsAgo(Number(head.timestamp));
  if (age > MAX_HEAD_AGE_SECONDS) throw new Error(`head #${head.number} is ${age}s old`);
  return `chain ${chainId}, head #${head.number} (${age}s old)`;
}

async function wormholeCore(key: Testnet): Promise<string> {
  const { core, chainId } = WORMHOLE_TESTNET[key];
  const contract = { address: core, abi: wormholeCoreAbi } as const;
  const client = publicClient(key);
  const [onChainId, fee, index] = await Promise.all([
    client.readContract({ ...contract, functionName: "chainId" }),
    client.readContract({ ...contract, functionName: "messageFee" }),
    client.readContract({ ...contract, functionName: "getCurrentGuardianSetIndex" }),
  ]);
  if (onChainId !== chainId) throw new Error(`core reports Wormhole chain ${onChainId}, expected ${chainId}`);
  const { keys } = await client.readContract({ ...contract, functionName: "getGuardianSet", args: [index] });
  return `${core}, guardian set #${index} [${keys.join(", ")}], message fee ${fee} wei`;
}

async function guardiansSigning(key: Testnet): Promise<string> {
  const vaa = await latestSignedVaa(WORMHOLE_TESTNET[key].chainId);
  if (!vaa) throw new Error("Wormholescan has no VAA for this chain");
  const hours = secondsAgo(vaa.timestamp.getTime() / 1000) / 3600;
  if (hours > MAX_VAA_AGE_HOURS) throw new Error(`latest VAA ${vaa.id} is ${hours.toFixed(1)} h old`);
  return `latest VAA ${vaa.id}, ${hours.toFixed(1)} h old, guardian set #${vaa.guardianSetIndex}`;
}

async function create2Deployer(): Promise<string> {
  const chains: EvmChainKey[] = [...TESTNETS, "ethereumFork"];
  const codes = await Promise.all(chains.map((key) => publicClient(key).getCode({ address: CREATE2_DEPLOYER })));
  const hashes = codes.map((code, i) => {
    if (!code || code === "0x") throw new Error(`no code on ${chains[i]}`);
    return keccak256(code);
  });
  if (new Set(hashes).size !== 1) throw new Error(`bytecode differs across chains: ${hashes.join(", ")}`);
  return `${CREATE2_DEPLOYER} has identical code on ${chains.join(", ")}`;
}

async function gatewayOnFork(forkBlock: number): Promise<string> {
  const client = publicClient("ethereumFork");
  const gateway = { address: snowbridgeGateway(), abi: gatewayAbi } as const;
  const [head, mode, nonce, usdtRegistered] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({ ...gateway, functionName: "operatingMode" }),
    client.readContract({ ...gateway, functionName: "v2_outboundNonce" }),
    client.readContract({ ...gateway, functionName: "isTokenRegistered", args: [MAINNET_USDT] }),
  ]);
  if (head !== BigInt(forkBlock)) throw new Error(`fork is at #${head}, expected #${forkBlock}`);
  if (mode !== GATEWAY_MODE_NORMAL) throw new Error(`Gateway operating mode is ${mode}`);
  if (!usdtRegistered) throw new Error(`USDT ${MAINNET_USDT} is not registered on the Gateway`);
  return `fork #${head}, Gateway ${gateway.address}: mode normal, V2 outbound nonce ${nonce}, USDT registered`;
}

async function hydrationPaseoDead(): Promise<string> {
  const response = await fetch(HYDRATION_PASEO_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "chain_getHeader", params: [] }),
  });
  const { result } = (await response.json()) as { result: { number: string } };
  const head = Number(result.number);
  if (head !== HYDRATION_PASEO_LAST_BLOCK) throw new Error(`head moved to #${head}; HANDOFF §5 is outdated`);
  return `still stuck at #${head}`;
}

async function report(name: string, check: () => Promise<string>): Promise<boolean> {
  try {
    console.log(`ok    ${name}: ${await check()}`);
    return true;
  } catch (err) {
    console.log(`FAIL  ${name}: ${(err as Error).message}`);
    return false;
  }
}

const fork = await spawnEthereumFork();
try {
  const results = [
    ...(await Promise.all(
      TESTNETS.flatMap((key) => [
        report(`${key} RPC`, () => testnetHead(key)),
        report(`${key} Wormhole core`, () => wormholeCore(key)),
        report(`${key} Wormhole guardians`, () => guardiansSigning(key)),
      ]),
    )),
    await report("CREATE2 deployer", create2Deployer),
    await report("Snowbridge Gateway on Ethereum fork", () => gatewayOnFork(fork.spec.block)),
    await report("Hydration Paseo is dead", hydrationPaseoDead),
  ];
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await fork.close();
}
process.exit();
