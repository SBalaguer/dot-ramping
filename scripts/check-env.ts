import {
  BASE_SEPOLIA_USDC,
  CREATE2_DEPLOYER,
  GATEWAY_MODE_NORMAL,
  HYDRATION_WORMHOLE_CHAIN_ID,
  MAINNET_USDT,
  SEPOLIA_USDC,
  WORMHOLE_TESTNET,
  devUserAccount,
  factoryOwner,
  gatewayAbi,
  latestSignedVaa,
  publicClient,
  readDeployment,
  relayerAccount,
  snowbridgeGateway,
  wormholeCoreAbi,
  type EvmChainKey,
} from "@onramp/chains";
import { basejumpEmitterAbi, factoryAbi, nttManagerAbi, psmVaultAbi } from "@onramp/contracts";
import { forkContracts, setUpEthereumFork, spawnEthereumFork } from "@onramp/forks";
import { Route } from "@onramp/keys";
import { basejumpEtherFee } from "@onramp/routes";
import { isAddressEqual, keccak256, pad, size, zeroHash } from "viem";

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

/** The Sepolia side of W-ETH is wired so a deposit can only go to our emitter and settle to our fork landing. */
async function sepoliaDeployment(): Promise<string> {
  const client = publicClient("sepolia");
  const { factory, basejumpEmitter, nttManager } = readDeployment("sepolia");
  const relayer = relayerAccount().address;
  const landing = forkContracts(relayer).basejumpLanding;
  const factoryContract = { address: factory, abi: factoryAbi } as const;
  const emitter = { address: basejumpEmitter, abi: basejumpEmitterAbi } as const;

  const [owner, factoryRelayer, [bridge, token], settledTo, manager, peer, etherFee] = await Promise.all([
    client.readContract({ ...factoryContract, functionName: "owner" }),
    client.readContract({ ...factoryContract, functionName: "relayer" }),
    client.readContract({ ...factoryContract, functionName: "routeConfig", args: [Route.Basejump] }),
    client.readContract({ ...emitter, functionName: "landing" }),
    client.readContract({ ...emitter, functionName: "nttManagerFor", args: [SEPOLIA_USDC] }),
    client.readContract({
      address: nttManager,
      abi: nttManagerAbi,
      functionName: "getPeer",
      args: [HYDRATION_WORMHOLE_CHAIN_ID],
    }),
    basejumpEtherFee(client, basejumpEmitter, SEPOLIA_USDC),
  ]);
  if (!isAddressEqual(owner, factoryOwner())) throw new Error(`factory owner is ${owner}, not OWNER_EVM_ADDRESS`);
  if (!isAddressEqual(factoryRelayer, relayer)) throw new Error(`factory relayer is ${factoryRelayer}, not ours`);
  if (!isAddressEqual(bridge, basejumpEmitter) || !isAddressEqual(token, SEPOLIA_USDC)) {
    throw new Error(`factory routes Basejump to ${bridge} with token ${token}`);
  }
  if (settledTo !== pad(landing).toLowerCase()) throw new Error(`emitter settles to ${settledTo}, not ${landing}`);
  if (!isAddressEqual(manager, nttManager)) throw new Error(`emitter settles USDC through ${manager}`);
  if (peer.peerAddress === zeroHash) throw new Error("NTT manager has no peer for Hydration (Wormhole chain 73)");
  return `factory ${factory} (owner ${owner}) -> emitter ${basejumpEmitter} -> landing ${landing} on Hydration; bridge fee ${etherFee} wei`;
}

/** The Base Sepolia side of W-BASE: same factory as Sepolia, routing only to our vault, which serves our facilitator. */
async function baseSepoliaDeployment(): Promise<string> {
  const client = publicClient("baseSepolia");
  const { factory, psmVault } = readDeployment("base-sepolia");
  const relayer = relayerAccount().address;
  const facilitator = forkContracts(relayer).psmFacilitator;
  const factoryContract = { address: factory, abi: factoryAbi } as const;
  const vault = { address: psmVault, abi: psmVaultAbi } as const;

  const [owner, factoryRelayer, [bridge, token], bound, paused, allowance] = await Promise.all([
    client.readContract({ ...factoryContract, functionName: "owner" }),
    client.readContract({ ...factoryContract, functionName: "relayer" }),
    client.readContract({ ...factoryContract, functionName: "routeConfig", args: [Route.Psm] }),
    client.readContract({ ...vault, functionName: "authorizedEmitters", args: [HYDRATION_WORMHOLE_CHAIN_ID] }),
    client.readContract({ ...vault, functionName: "depositsPaused" }),
    client.readContract({ ...vault, functionName: "depositAllowance" }),
  ]);
  if (!isAddressEqual(factory, readDeployment("sepolia").factory)) throw new Error("factory differs from Sepolia's");
  if (!isAddressEqual(owner, factoryOwner())) throw new Error(`factory owner is ${owner}, not OWNER_EVM_ADDRESS`);
  if (!isAddressEqual(factoryRelayer, relayer)) throw new Error(`factory relayer is ${factoryRelayer}, not ours`);
  if (!isAddressEqual(bridge, psmVault) || !isAddressEqual(token, BASE_SEPOLIA_USDC)) {
    throw new Error(`factory routes the PSM to ${bridge} with token ${token}`);
  }
  if (bound !== pad(facilitator).toLowerCase()) throw new Error(`vault is bound to ${bound}, not ${facilitator}`);
  if (paused) throw new Error("vault deposits are paused");
  return `factory ${factory} (same as Sepolia) -> vault ${psmVault} -> facilitator ${facilitator} on Hydration; ${allowance} USDC of deposit allowance`;
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

/** S-ETH: the factory lands on the Ethereum fork at the testnets' address and routes only to the real Gateway. */
async function ethereumForkDeployment(): Promise<string> {
  const client = publicClient("ethereumFork");
  const factory = await setUpEthereumFork(relayerAccount(), devUserAccount().address);
  if (!isAddressEqual(factory, readDeployment("sepolia").factory)) {
    throw new Error(`the factory lands at ${factory}, not at the testnets' address; run pnpm deploy:testnets`);
  }
  const factoryContract = { address: factory, abi: factoryAbi } as const;
  const [[bridge, token], [xcm, claimer]] = await Promise.all([
    client.readContract({ ...factoryContract, functionName: "routeConfig", args: [Route.Snowbridge] }),
    client.readContract({ ...factoryContract, functionName: "snowbridgeTemplates" }),
  ]);
  if (!isAddressEqual(bridge, snowbridgeGateway()) || !isAddressEqual(token, MAINNET_USDT)) {
    throw new Error(`factory routes Snowbridge to ${bridge} with token ${token}`);
  }
  return `factory ${factory} (same as the testnets) -> Gateway ${bridge}; XCM template of ${size(xcm.data)} bytes with ${xcm.offsets.length} beneficiary slots, claimer with ${claimer.offsets.length}`;
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
    await report("W-ETH deployment on Sepolia", sepoliaDeployment),
    await report("W-BASE deployment on Base Sepolia", baseSepoliaDeployment),
    await report("Snowbridge Gateway on Ethereum fork", () => gatewayOnFork(fork.spec.block)),
    await report("S-ETH deployment on the Ethereum fork", ethereumForkDeployment),
    await report("Hydration Paseo is dead", hydrationPaseoDead),
  ];
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await fork.close();
}
process.exit();
