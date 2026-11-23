import {
  concatHex,
  encodeAbiParameters,
  getContractAddress,
  getCreate2Address,
  keccak256,
  type Address,
  type Hex,
} from "viem";

/** Mirrors the Solidity `Params` struct; every field is bound into the forwarder's CREATE2 salt. */
export interface ForwarderParams {
  id: Hex;
  entropy: Hex;
  beneficiary: Hex;
  refund: Address;
  routeMask: number;
}

const PARAMS_ABI = [
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint8" },
] as const;

/** The factory creates its forwarder implementation first, so it sits at the factory's CREATE nonce 1. */
const IMPLEMENTATION_NONCE = 1n;

export function saltOf(params: ForwarderParams): Hex {
  return keccak256(
    encodeAbiParameters(PARAMS_ABI, [params.id, params.entropy, params.beneficiary, params.refund, params.routeMask]),
  );
}

export function implementationOf(factory: Address): Address {
  return getContractAddress({ opcode: "CREATE", from: factory, nonce: IMPLEMENTATION_NONCE });
}

/** Creation code of the EIP-1167 minimal proxy that OpenZeppelin `Clones` deploys for `implementation`. */
export function cloneInitCode(implementation: Address): Hex {
  return concatHex(["0x3d602d80600a3d3981f3363d3d373d3d3d363d73", implementation, "0x5af43d82803e903d91602b57fd5bf3"]);
}

/** Counterfactual deposit address: where `factory` will deploy the forwarder bound to `params`. */
export function forwarderAddress(factory: Address, params: ForwarderParams): Address {
  return getCreate2Address({
    from: factory,
    salt: saltOf(params),
    bytecode: cloneInitCode(implementationOf(factory)),
  });
}
