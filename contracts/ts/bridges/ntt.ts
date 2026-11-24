import { wormholeCoreAbi } from "@onramp/chains";
import { pad, zeroAddress, type Address } from "viem";

import { loadAbi, loadArtifact } from "../artifacts";
import { create, send, type Actor } from "../transact";

export interface NttParameters {
  token: Address;
  wormholeCore: Address;
  /** Wormhole chain id of the chain being deployed to. */
  wormholeChainId: number;
}

export interface NttPeer {
  wormholeChainId: number;
  manager: Address;
  tokenDecimals: number;
}

export interface NttDeployment {
  manager: Address;
  transceiver: Address;
}

const LOCKING = 0;
const RATE_LIMIT_DURATION = 86_400n;
const UNLIMITED = 2n ** 64n - 1n;
/** Wormhole consistency level: the settlement message is signed once its block is finalized. */
const FINALIZED = 202;

/**
 * A locking NTT manager with one Wormhole transceiver, deployed and configured the way Wormhole's own
 * `DeployWormholeNtt.s.sol` does it. Proxies are initialized by the account that created the implementations,
 * which NTT requires.
 */
export async function deployLockingNtt(
  by: Actor,
  { token, wormholeCore, wormholeChainId }: NttParameters,
): Promise<NttDeployment> {
  const libraries = { TransceiverStructs: await create(by, loadArtifact("TransceiverStructs", "ntt")) };
  const managerCode = loadArtifact("NttManager", "ntt", libraries);
  const transceiverCode = loadArtifact("WormholeTransceiver", "ntt", libraries);
  const proxy = loadArtifact("ERC1967Proxy", "ntt");

  const managerImplementation = await create(by, managerCode, [
    token,
    LOCKING,
    wormholeChainId,
    RATE_LIMIT_DURATION,
    false,
  ]);
  const manager = await create(by, proxy, [managerImplementation, "0x"]);
  await send(by, { address: manager, abi: managerCode.abi, functionName: "initialize" });

  const transceiverImplementation = await create(by, transceiverCode, [
    manager,
    wormholeCore,
    FINALIZED,
    0,
    0,
    zeroAddress,
  ]);
  const transceiver = await create(by, proxy, [transceiverImplementation, "0x"]);
  // Initializing announces the transceiver in a Wormhole message, which costs the core's fee.
  const messageFee = await by.reader.readContract({
    address: wormholeCore,
    abi: wormholeCoreAbi,
    functionName: "messageFee",
  });
  await send(by, { address: transceiver, abi: transceiverCode.abi, functionName: "initialize", value: messageFee });

  await send(by, { address: manager, abi: managerCode.abi, functionName: "setTransceiver", args: [transceiver] });
  await send(by, { address: manager, abi: managerCode.abi, functionName: "setOutboundLimit", args: [UNLIMITED] });
  await send(by, { address: manager, abi: managerCode.abi, functionName: "setThreshold", args: [1] });
  return { manager, transceiver };
}

/** Registers the manager on the other chain; `NttManager.transfer` reverts for a chain without a peer. */
export async function setNttPeer(by: Actor, manager: Address, peer: NttPeer): Promise<void> {
  await send(by, {
    address: manager,
    abi: loadAbi("NttManager", "ntt"),
    functionName: "setPeer",
    args: [peer.wormholeChainId, pad(peer.manager), peer.tokenDecimals, UNLIMITED],
  });
}
