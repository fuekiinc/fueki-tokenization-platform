// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;


contract EasyAccessControl {

  // ---------------------------------------------------------------
  //  Custom Errors (gas optimization: ~200 gas cheaper than require strings)
  // ---------------------------------------------------------------
  error ZeroAddress();
  error InvalidRole();
  error DoesNotHaveContractAdminRole();
  error DoesNotHaveTransferAdminRole();
  error DoesNotHaveWalletsAdminRole();
  error DoesNotHaveReserveAdminRole();
  error DoesNotHaveWalletsOrReserveAdminRole();
  error AddressLacksSpecifiedRoles();
  error MustHaveAtLeastOneContractAdmin();

  // ---------------------------------------------------------------
  //  Constants (gas optimization: constants are inlined by the compiler)
  // ---------------------------------------------------------------
  uint8 internal constant CONTRACT_ADMIN_ROLE = 1; // 0001
  uint8 internal constant RESERVE_ADMIN_ROLE = 2;  // 0010
  uint8 internal constant WALLETS_ADMIN_ROLE = 4;  // 0100
  uint8 internal constant TRANSFER_ADMIN_ROLE = 8; // 1000

  // Gas optimization: constant for the valid role mask avoids recomputation
  uint8 private constant VALID_ROLE_MASK = 15;

  event RoleChange(address indexed grantor, address indexed grantee, uint8 role, bool indexed status);

  mapping (address => uint8) admins; // address => binary roles

  uint8 public contractAdminCount; // counter of contract admins to keep at least one

  modifier validAddress(address addr) {
    if (addr == address(0)) revert ZeroAddress();
    _;
  }

  modifier validRole(uint8 role) {
    // Gas optimization: single comparison instead of two separate checks
    if (role == 0 || role | VALID_ROLE_MASK != VALID_ROLE_MASK) revert InvalidRole();
    _;
  }

  modifier onlyContractAdmin() {
    if (!hasRole(msg.sender, CONTRACT_ADMIN_ROLE)) revert DoesNotHaveContractAdminRole();
    _;
  }

  modifier onlyTransferAdmin() {
    if (!hasRole(msg.sender, TRANSFER_ADMIN_ROLE)) revert DoesNotHaveTransferAdminRole();
    _;
  }

  modifier onlyWalletsAdmin() {
    if (!hasRole(msg.sender, WALLETS_ADMIN_ROLE)) revert DoesNotHaveWalletsAdminRole();
    _;
  }

  modifier onlyReserveAdmin() {
    if (!hasRole(msg.sender, RESERVE_ADMIN_ROLE)) revert DoesNotHaveReserveAdminRole();
    _;
  }

  /**
    @notice Grant role/roles to address use role bitmask
    @param addr to grant role
    @param role bitmask of role/roles to grant
  **/
  function grantRole(address addr, uint8 role) public validRole(role) validAddress(addr) onlyContractAdmin  {
    if ( admins[addr] & CONTRACT_ADMIN_ROLE == 0 && role & CONTRACT_ADMIN_ROLE > 0 ) contractAdminCount++;
    admins[addr] |= role;
    emit RoleChange(msg.sender, addr, role, true);
  }

  /**
    @notice Revoke role/roles from address use role bitmask
    @param addr to revoke role
    @param role bitmask of role/roles to revoke
  **/
  function revokeRole(address addr, uint8 role) public validRole(role) validAddress(addr) onlyContractAdmin  {
    if ((admins[addr] & role) != role) revert AddressLacksSpecifiedRoles();
    if ( role & CONTRACT_ADMIN_ROLE > 0 ) {
      if (contractAdminCount <= 1) revert MustHaveAtLeastOneContractAdmin();
      contractAdminCount--;
    }
    admins[addr] &= ~role;
    emit RoleChange(msg.sender, addr, role, false);
  }

  /**
    @notice Check role/roles availability at address
    @param addr to revoke role
    @param role bitmask of role/roles to revoke
    @return bool true or false
  **/
  function hasRole(address addr, uint8 role) public view validRole(role) validAddress(addr) returns (bool) {
    return admins[addr] & role > 0;
  }
}
