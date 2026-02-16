/**
 * Human-readable ABI for the SecurityTokenFactory contract.
 *
 * Replaces the original SecurityTokenFactory.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const SecurityTokenFactoryABI = [
  // Constructor
  'constructor(address _deployer)',

  // Errors
  'error EmptyName()',
  'error EmptySymbol()',
  'error MaxSupplyTooLow()',
  'error ZeroSupply()',

  // Events
  'event SecurityTokenCreated(address indexed creator, address indexed tokenAddress, address indexed transferRulesAddress, string name, string symbol, uint256 totalSupply, uint256 maxTotalSupply, bytes32 documentHash, string documentType, uint256 originalValue)',

  // Functions
  'function createSecurityToken(bytes _rulesBytecode, bytes _swapBytecode, string _name, string _symbol, uint8 _decimals, uint256 _totalSupply, uint256 _maxTotalSupply, bytes32 _documentHash, string _documentType, uint256 _originalValue, uint256 _minTimelockAmount, uint256 _maxReleaseDelay) returns (address tokenAddress, address rulesAddress)',
  'function deployer() view returns (address)',
  'function getTokenAtIndex(uint256 index) view returns (tuple(address tokenAddress, address transferRulesAddress, address creator, string name, string symbol, uint8 decimals, uint256 totalSupply, uint256 maxTotalSupply, bytes32 documentHash, string documentType, uint256 originalValue, uint256 createdAt))',
  'function getTokenDetails(address tokenAddress) view returns (tuple(address tokenAddress, address transferRulesAddress, address creator, string name, string symbol, uint8 decimals, uint256 totalSupply, uint256 maxTotalSupply, bytes32 documentHash, string documentType, uint256 originalValue, uint256 createdAt))',
  'function getTotalTokens() view returns (uint256)',
  'function getUserTokens(address user) view returns (address[])',
  'function isFactoryToken(address tokenAddress) view returns (bool)',
] as const;
