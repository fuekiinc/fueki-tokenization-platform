import { ethers } from 'ethers';

export const NAV_ORACLE_ABI = [
  'function NAV_PUBLISHER_ROLE() view returns (bytes32)',
  'function NAV_ADMIN_ROLE() view returns (bytes32)',
  'function token() view returns (address)',
  'function baseCurrency() view returns (string)',
  'function minAttestationInterval() view returns (uint256)',
  'function maxNavChangeBps() view returns (uint256)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function attestationCount() view returns (uint256)',
  'function getAttestation(uint256 index) view returns (tuple(uint256 navPerToken, uint256 totalNAV, uint256 totalTokenSupply, uint48 effectiveDate, uint48 publishedAt, address publisher, bytes32 reportHash, string reportURI))',
  'event NAVPublished(uint256 indexed attestationIndex, uint256 navPerToken, uint256 totalNAV, uint48 effectiveDate, address indexed publisher, bytes32 reportHash)',
] as const;

export const ERC20_METADATA_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

export const SECURITY_TOKEN_ROLE_ABI = [
  'function hasRole(address addr, uint8 role) view returns (bool)',
] as const;

export const NAV_PUBLISHER_ROLE = ethers.id('NAV_PUBLISHER_ROLE');
export const NAV_ADMIN_ROLE = ethers.id('NAV_ADMIN_ROLE');
export const SECURITY_TOKEN_CONTRACT_ADMIN_ROLE = 1;
