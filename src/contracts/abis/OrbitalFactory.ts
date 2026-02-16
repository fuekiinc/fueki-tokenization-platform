/**
 * Human-readable ABI for the OrbitalFactory contract.
 *
 * Replaces the original OrbitalFactory.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const OrbitalFactoryABI = [
  // Constructor
  'constructor(address _admin, address _feeCollector, uint256 _defaultSwapFeeBps)',

  // Errors
  'error InvalidFee()',
  'error NotAdmin()',
  'error PoolExists()',
  'error ZeroAddress()',

  // Events
  'event AdminUpdated(address indexed oldAdmin, address indexed newAdmin)',
  'event DefaultFeeCollectorUpdated(address indexed collector)',
  'event DefaultSwapFeeUpdated(uint256 newFeeBps)',
  'event PoolCreated(address indexed pool, address[] tokens, uint8 concentration, uint256 swapFeeBps, address feeCollector)',

  // View functions
  'function admin() view returns (address)',
  'function defaultFeeCollector() view returns (address)',
  'function defaultSwapFeeBps() view returns (uint256)',
  'function getAllPools() view returns (address[])',
  'function getPool(address[] _tokens, uint8 _concentration) view returns (address)',
  'function getPoolAtIndex(uint256 index) view returns (address)',
  'function getPoolsForToken(address token) view returns (address[])',
  'function poolsByKey(bytes32) view returns (address)',
  'function totalPools() view returns (uint256)',

  // Write functions
  'function createPool(address[] _tokens, uint8 _concentration, uint256 _swapFeeBps, string _name, string _symbol) returns (address pool)',
  'function setAdmin(address _newAdmin)',
  'function setDefaultFeeCollector(address _collector)',
  'function setDefaultSwapFee(uint256 _feeBps)',
] as const;
