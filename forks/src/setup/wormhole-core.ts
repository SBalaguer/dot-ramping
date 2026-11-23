import {
  HYDRATION_EVM_CHAIN_ID,
  HYDRATION_WORMHOLE_CHAIN_ID,
  WORMHOLE_TESTNET,
  publicClient,
  walletClient,
  wormholeCoreAbi,
  wormholeSetupAbi,
} from "@onramp/chains";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  type Account,
  type Address,
  type Hash,
  type Hex,
} from "viem";

/** Transactions that created Wormhole's own core contracts on Sepolia; their inputs are the official bytecode. */
const SEPOLIA_CREATION = {
  implementation: "0xd459e17dc92e8c27c13e736c293478805a06a9c4ff2126496cdd936ba2117fef",
  setup: "0xbed2e61cc1165784ab66d1a48fcabfb902a1d6f159ce499ec909641168e679ef",
  proxy: "0x55033579ac2a01baa318c0e1b2f73232d40752375d17dfd1b5d1aa6559e2b5f3",
} as const satisfies Record<string, Hash>;

const PROXY_CONSTRUCTOR = [{ type: "address" }, { type: "bytes" }] as const;

interface CoreParameters {
  guardians: readonly Address[];
  chainId: number;
  governanceChainId: number;
  governanceContract: Hex;
  evmChainId: bigint;
}

function proxyArguments(setup: Address, implementation: Address, core: CoreParameters): Hex {
  const initializer = encodeFunctionData({
    abi: wormholeSetupAbi,
    functionName: "setup",
    args: [
      implementation,
      core.guardians,
      core.chainId,
      core.governanceChainId,
      core.governanceContract,
      core.evmChainId,
    ],
  });
  return encodeAbiParameters(PROXY_CONSTRUCTOR, [setup, initializer]);
}

/** Reads what Wormhole deployed on Sepolia: creation code of all three contracts and the core's parameters. */
async function sepoliaCore() {
  const sepolia = publicClient("sepolia");
  const core = { address: WORMHOLE_TESTNET.sepolia.core, abi: wormholeCoreAbi } as const;

  const created = async (hash: Hash) => {
    const { input, from, nonce, to } = await sepolia.getTransaction({ hash });
    if (to !== null) throw new Error(`${hash} is not a contract creation`);
    return { code: input, address: getContractAddress({ from, nonce: BigInt(nonce) }) };
  };
  const [implementation, setup, proxy, index, governanceChainId, governanceContract, evmChainId] = await Promise.all([
    created(SEPOLIA_CREATION.implementation),
    created(SEPOLIA_CREATION.setup),
    created(SEPOLIA_CREATION.proxy),
    sepolia.readContract({ ...core, functionName: "getCurrentGuardianSetIndex" }),
    sepolia.readContract({ ...core, functionName: "governanceChainId" }),
    sepolia.readContract({ ...core, functionName: "governanceContract" }),
    sepolia.readContract({ ...core, functionName: "evmChainId" }),
  ]);
  const { keys: guardians } = await sepolia.readContract({ ...core, functionName: "getGuardianSet", args: [index] });
  const parameters = { guardians, chainId: WORMHOLE_TESTNET.sepolia.chainId, governanceChainId, governanceContract };

  const sepoliaArguments = proxyArguments(setup.address, implementation.address, { ...parameters, evmChainId });
  if (!proxy.code.endsWith(sepoliaArguments.slice(2))) {
    throw new Error("Sepolia core proxy was not constructed from its current guardian set and parameters");
  }
  const proxyCode = proxy.code.slice(0, -(sepoliaArguments.length - 2)) as Hex;

  return { implementationCode: implementation.code, setupCode: setup.code, proxyCode, parameters };
}

/**
 * Deploys Wormhole's official core on the Hydration fork with the testnet guardian set and Hydration's
 * Wormhole chain id, so the fork verifies real testnet VAAs. Hydration's own core only trusts mainnet guardians.
 */
export async function deployTestnetWormholeCore(deployer: Account): Promise<Address> {
  const { implementationCode, setupCode, proxyCode, parameters } = await sepoliaCore();
  const wallet = walletClient("hydrationFork", deployer);
  const reader = publicClient("hydrationFork");

  const deploy = async (code: Hex): Promise<Address> => {
    const hash = await wallet.sendTransaction({ data: code });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress) {
      throw new Error(`Wormhole core deployment ${hash} failed`);
    }
    return receipt.contractAddress;
  };

  const implementation = await deploy(implementationCode);
  const setup = await deploy(setupCode);
  return deploy(
    concatHex([
      proxyCode,
      proxyArguments(setup, implementation, {
        ...parameters,
        chainId: HYDRATION_WORMHOLE_CHAIN_ID,
        evmChainId: BigInt(HYDRATION_EVM_CHAIN_ID),
      }),
    ]),
  );
}
