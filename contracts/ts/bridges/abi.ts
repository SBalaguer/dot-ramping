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
