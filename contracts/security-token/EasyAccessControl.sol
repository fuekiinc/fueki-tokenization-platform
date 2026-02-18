// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;


contract EasyAccessControl {

  uint8 constant CONTRACT_ADMIN_ROLE = 1; // 0001
  uint8 constant RESERVE_ADMIN_ROLE = 2;  // 0010
  uint8 constant WALLETS_ADMIN_ROLE = 4;  // 0100
  uint8 constant TRANSFER_ADMIN_ROLE = 8; // 1000

  event RoleChange(address indexed grantor, address indexed grantee, uint8 role, bool indexed status);

  mapping (address => uint8) admins; // address => binary roles

  uint8 public contractAdminCount; // counter of contract admins to keep at least one

  modifier validAddress(address addr) {
    require(addr != address(0), "Address cannot be 0x0");
    _;
  }

  modifier validRole(uint8 role) {
    require( role > 0 && role | 15 == 15, "DOES NOT HAVE VALID ROLE");
    _;
  }

  modifier onlyContractAdmin() {
    require(hasRole(msg.sender, CONTRACT_ADMIN_ROLE), "DOES NOT HAVE CONTRACT ADMIN ROLE");
    _;
  }

  modifier onlyTransferAdmin() {
    require(hasRole(msg.sender, TRANSFER_ADMIN_ROLE), "DOES NOT HAVE TRANSFER ADMIN ROLE");
    _;
  }

  modifier onlyWalletsAdmin() {
    require(hasRole(msg.sender, WALLETS_ADMIN_ROLE), "DOES NOT HAVE WALLETS ADMIN ROLE");
    _;
  }

  modifier onlyReserveAdmin() {
    require(hasRole(msg.sender, RESERVE_ADMIN_ROLE), "DOES NOT HAVE RESERVE ADMIN ROLE");
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
    require((admins[addr] & role) == role, "Address does not have specified roles");
    if ( role & CONTRACT_ADMIN_ROLE > 0 ) {
      require( contractAdminCount > 1, "Must have at least one contract admin" );
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
