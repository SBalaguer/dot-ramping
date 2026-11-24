import { parseAbi } from "viem";

/** The parts of the third-party bridge contracts the relayer calls at run time. */

export const basejumpEmitterAbi = parseAbi([
  "function wormhole() view returns (address)",
  "function landing() view returns (bytes32)",
  "function nttManagerFor(address asset) view returns (address)",
  "function assetFee(address asset) view returns (uint256)",
  "event BridgeInitiated(address indexed asset, uint256 amount, uint256 fee, uint16 destChain, bytes32 recipient, uint64 transferSequence, uint64 messageSequence)",
]);

export const basejumpReceiverAbi = parseAbi([
  "function wormhole() view returns (address)",
  "function landing() view returns (bytes32)",
  "function authorizedEmitters(uint16 sourceChain) view returns (bytes32)",
  "function processedVaas(bytes32 vaaHash) view returns (bool)",
  "function completeTransfer(bytes vaa)",
]);

export const basejumpLandingAbi = parseAbi([
  "event TransferExecuted(address indexed sourceAsset, address indexed destAsset, bytes32 indexed recipient, uint256 amount)",
  "event TransferQueued(uint256 indexed id, address indexed sourceAsset, address destAsset, bytes32 recipient, uint256 amount)",
]);

export const nttManagerAbi = parseAbi([
  "struct NttManagerPeer { bytes32 peerAddress; uint8 tokenDecimals; }",
  "function getPeer(uint16 chainId) view returns (NttManagerPeer)",
  "function quoteDeliveryPrice(uint16 recipientChain, bytes transceiverInstructions) view returns (uint256[], uint256)",
]);

export const psmVaultAbi = parseAbi([
  "function wormhole() view returns (address)",
  "function usdc() view returns (address)",
  "function depositsPaused() view returns (bool)",
  "function depositAllowance() view returns (uint256)",
  "function authorizedEmitters(uint16 sourceChain) view returns (bytes32)",
  "event Deposited(address indexed from, bytes32 indexed recipient, uint256 amount, uint64 sequence)",
]);

export const psmFacilitatorAbi = parseAbi([
  "function wormhole() view returns (address)",
  "function authorizedEmitters(uint16 sourceChain) view returns (bytes32)",
  "function processedVaas(bytes32 vaaHash) view returns (bool)",
  "function mintHeadroom() view returns (uint256)",
  "function receiveMessage(bytes vaa)",
  "event Minted(address indexed recipient, uint256 usdcAmount, uint256 hollarAmount)",
  "event MintQueued(uint256 indexed id, address indexed recipient, uint256 usdcAmount, uint8 reason)",
]);

export const ghoTokenAbi = parseAbi([
  "struct Facilitator { uint128 bucketCapacity; uint128 bucketLevel; string label; }",
  "function addFacilitator(address facilitator, string label, uint128 bucketCapacity)",
  "function getFacilitator(address facilitator) view returns (Facilitator)",
]);
