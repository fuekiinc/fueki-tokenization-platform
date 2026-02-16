/**
 * Human-readable ABI for the WrappedAssetFactory contract.
 *
 * Replaces the original WrappedAssetFactory.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const WrappedAssetFactoryABI = [
  // Errors
  'error EmptyName()',
  'error EmptySymbol()',
  'error MintExceedsOriginalValue()',
  'error ZeroAddress()',
  'error ZeroMintAmount()',

  // Events
  'event AssetCreated(address indexed creator, address indexed assetAddress, string name, string symbol, bytes32 documentHash, string documentType, uint256 originalValue, uint256 mintAmount, address indexed recipient)',

  // Functions
  'function createWrappedAsset(string _name, string _symbol, bytes32 _documentHash, string _documentType, uint256 _originalValue, uint256 _mintAmount, address _recipient) returns (address asset)',
  'function getAssetAtIndex(uint256 index) view returns (address)',
  'function getTotalAssets() view returns (uint256)',
  'function getUserAssets(address user) view returns (address[])',
] as const;
