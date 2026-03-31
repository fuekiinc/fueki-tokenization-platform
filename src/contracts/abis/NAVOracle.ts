/**
 * Human-readable ABI for NAVOracle.
 */
export const NAVOracleABI = [
  'function NAV_PUBLISHER_ROLE() view returns (bytes32)',
  'function NAV_ADMIN_ROLE() view returns (bytes32)',
  'function token() view returns (address)',
  'function baseCurrency() view returns (string)',
  'function NAV_DECIMALS() view returns (uint8)',
  'function latestAttestationIndex() view returns (uint256)',
  'function minAttestationInterval() view returns (uint256)',
  'function maxNavChangeBps() view returns (uint256)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function publishNAV(uint256 navPerToken, uint256 totalNAV, uint256 totalTokenSupply, uint48 effectiveDate, bytes32 reportHash, string reportURI)',
  'function updateParameters(uint256 minInterval, uint256 maxChangeBps)',
  'function pause()',
  'function unpause()',
  'function currentNAVPerToken() view returns (uint256)',
  'function currentTotalNAV() view returns (uint256)',
  'function getAttestation(uint256 index) view returns (tuple(uint256 navPerToken, uint256 totalNAV, uint256 totalTokenSupply, uint48 effectiveDate, uint48 publishedAt, address publisher, bytes32 reportHash, string reportURI))',
  'function latestAttestation() view returns (tuple(uint256 navPerToken, uint256 totalNAV, uint256 totalTokenSupply, uint48 effectiveDate, uint48 publishedAt, address publisher, bytes32 reportHash, string reportURI))',
  'function attestationCount() view returns (uint256)',
  'function getAttestations(uint256 start, uint256 count) view returns (tuple(uint256 navPerToken, uint256 totalNAV, uint256 totalTokenSupply, uint48 effectiveDate, uint48 publishedAt, address publisher, bytes32 reportHash, string reportURI)[])',
  'function holderValue(address holder) view returns (uint256)',
  'event NAVPublished(uint256 indexed attestationIndex, uint256 navPerToken, uint256 totalNAV, uint48 effectiveDate, address indexed publisher, bytes32 reportHash)',
] as const;

export const NAV_ROLE_LABELS = {
  publisher: 'NAV Publisher',
  admin: 'NAV Admin',
} as const;
