/**
 * Human-readable ABI for the WrappedAsset ERC-20 token contract.
 *
 * Replaces the original WrappedAsset.json (358 lines) with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const WrappedAssetABI = [
  // Constructor
  'constructor(string _name, string _symbol, bytes32 _documentHash, string _documentType, uint256 _originalValue)',

  // Errors
  'error InsufficientAllowance()',
  'error InsufficientBalance()',
  'error OnlyFactory()',
  'error ZeroAddress()',

  // Events
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',

  // Functions
  'function allowance(address, address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool success)',
  'function balanceOf(address) view returns (uint256)',
  'function burn(uint256 amount)',
  'function decimals() view returns (uint8)',
  'function documentHash() view returns (bytes32)',
  'function documentType() view returns (string)',
  'function factory() view returns (address)',
  'function mint(address to, uint256 amount)',
  'function name() view returns (string)',
  'function originalValue() view returns (uint256)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool success)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool success)',
] as const;
