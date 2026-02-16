/**
 * Human-readable ABI for the ERC-1404 SecurityToken contract.
 *
 * Replaces the original SecurityToken.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const SecurityTokenABI = [
  // View functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function maxTotalSupply() view returns (uint256)',
  'function isPaused() view returns (bool)',
  'function balanceOf(address who) view returns (uint256)',
  'function unlockedBalanceOf(address who) view returns (uint256)',
  'function lockedAmountOf(address who) view returns (uint256)',
  'function tokensBalanceOf(address who) view returns (uint256)',
  'function getTransferGroup(address addr) view returns (uint256 groupID)',
  'function getFrozenStatus(address addr) view returns (bool status)',
  'function getMaxBalance(address addr) view returns (uint256)',
  'function getAllowTransferTime(address from, address to) view returns (uint256 timestamp)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function hasRole(address addr, uint8 role) view returns (bool)',
  'function swapNumber() view returns (uint256)',

  // Write functions
  'function transfer(address recipient, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function setTransferGroup(address addr, uint256 groupID)',
  'function setAllowGroupTransfer(uint256 from, uint256 to, uint256 lockedUntil)',
  'function setMaxBalance(address addr, uint256 updatedValue)',
  'function mint(address to, uint256 value)',
  'function burn(address from, uint256 value)',
  'function pause()',
  'function unpause()',
  'function freeze(address addr, bool status)',
  'function configureSell(uint256 restrictedTokenAmount, address quoteToken, address quoteTokenSender, uint256 quoteTokenAmount)',
  'function configureBuy(uint256 restrictedTokenAmount, address restrictedTokenSender, address quoteToken, uint256 quoteTokenAmount)',
  'function fundDividend(address token, uint256 amount, uint256 snapshotId)',
  'function claimDividend(address token, uint256 snapshotId)',
  'function snapshot() returns (uint256)',
] as const;
