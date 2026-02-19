/**
 * Comprehensive human-readable ABI for the ERC-1404 SecurityToken contract.
 *
 * Covers the full inheritance chain:
 *   EasyAccessControl -> RestrictedLockupToken -> Dividends -> RestrictedSwap
 *
 * Includes all view/write functions, events, and custom errors needed for
 * the complete security token management frontend.
 */
export const SecurityTokenABI = [
  // -----------------------------------------------------------------------
  // ERC-20 Standard
  // -----------------------------------------------------------------------
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address who) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address sender, address recipient, uint256 amount) returns (bool)',

  // -----------------------------------------------------------------------
  // ERC-20 Snapshot (inherited from ERC20Snapshot)
  // -----------------------------------------------------------------------
  'function balanceOfAt(address account, uint256 snapshotId) view returns (uint256)',
  'function totalSupplyAt(uint256 snapshotId) view returns (uint256)',

  // -----------------------------------------------------------------------
  // RestrictedLockupToken — Core Token Config
  // -----------------------------------------------------------------------
  'function maxTotalSupply() view returns (uint256)',
  'function isPaused() view returns (bool)',
  'function minTimelockAmount() view returns (uint256)',
  'function maxReleaseDelay() view returns (uint256)',
  'function contractAdminCount() view returns (uint8)',

  // -----------------------------------------------------------------------
  // RestrictedLockupToken — Balance Views
  // -----------------------------------------------------------------------
  'function tokensBalanceOf(address who) view returns (uint256)',
  'function unlockedBalanceOf(address who) view returns (uint256)',
  'function lockedAmountOf(address who) view returns (uint256)',
  'function unlockedAmountOf(address who) view returns (uint256)',
  'function timelockBalanceOf(address who) view returns (uint256)',

  // -----------------------------------------------------------------------
  // RestrictedLockupToken — Transfer Restrictions
  // -----------------------------------------------------------------------
  'function getTransferGroup(address addr) view returns (uint256 groupID)',
  'function getFrozenStatus(address addr) view returns (bool status)',
  'function getMaxBalance(address addr) view returns (uint256)',
  'function getAllowTransferTime(address from, address to) view returns (uint256 timestamp)',
  'function getAllowGroupTransferTime(uint256 from, uint256 to) view returns (uint256 timestamp)',
  'function detectTransferRestriction(address from, address to, uint256 value) view returns (uint8)',
  'function messageForTransferRestriction(uint8 restrictionCode) view returns (string)',
  'function enforceTransferRestrictions(address from, address to, uint256 value) view',

  // -----------------------------------------------------------------------
  // RestrictedLockupToken — Release Schedules
  // -----------------------------------------------------------------------
  'function releaseSchedules(uint256 index) view returns (uint256 releaseCount, uint256 delayUntilFirstReleaseInSeconds, uint256 initialReleasePortionInBips, uint256 periodBetweenReleasesInSeconds)',
  'function scheduleCount() view returns (uint256 count)',
  'function createReleaseSchedule(uint256 releaseCount, uint256 delayUntilFirstReleaseInSeconds, uint256 initialReleasePortionInBips, uint256 periodBetweenReleasesInSeconds) returns (uint256 unlockScheduleId)',

  // -----------------------------------------------------------------------
  // RestrictedLockupToken — Timelocks
  // -----------------------------------------------------------------------
  'function timelockOf(address who, uint256 index) view returns (tuple(uint256 scheduleId, uint256 commencementTimestamp, uint256 tokensTransferred, uint256 totalAmount, address[] cancelableBy))',
  'function timelockCountOf(address who) view returns (uint256)',
  'function lockedAmountOfTimelock(address who, uint256 timelockIndex) view returns (uint256 locked)',
  'function unlockedAmountOfTimelock(address who, uint256 timelockIndex) view returns (uint256 unlocked)',
  'function balanceOfTimelock(address who, uint256 timelockIndex) view returns (uint256)',
  'function totalUnlockedToDateOfTimelock(address who, uint256 timelockIndex) view returns (uint256 total)',
  'function calculateUnlocked(uint256 commencedTimestamp, uint256 currentTimestamp, uint256 amount, uint256 scheduleId) view returns (uint256 unlocked)',
  'function fundReleaseSchedule(address to, uint256 amount, uint256 commencementTimestamp, uint256 scheduleId, address[] cancelableBy) returns (bool success)',
  'function batchFundReleaseSchedule(address[] to, uint256[] amounts, uint256[] commencementTimestamps, uint256[] scheduleIds, address[] cancelableBy) returns (bool success)',
  'function cancelTimelock(address target, uint256 timelockIndex, uint256 scheduleId, uint256 commencementTimestamp, uint256 totalAmount, address reclaimTokenTo) returns (bool success)',
  'function transferTimelock(address to, uint256 value, uint256 timelockId) returns (bool)',

  // -----------------------------------------------------------------------
  // RestrictedLockupToken — Admin Write Functions
  // -----------------------------------------------------------------------
  'function setTransferGroup(address addr, uint256 groupID)',
  'function setAllowGroupTransfer(uint256 from, uint256 to, uint256 lockedUntil)',
  'function setMaxBalance(address addr, uint256 updatedValue)',
  'function setAddressPermissions(address addr, uint256 groupID, uint256 lockedBalanceUntil, uint256 maxBalance, bool status)',
  'function mint(address to, uint256 value)',
  'function burn(address from, uint256 value)',
  'function pause()',
  'function unpause()',
  'function freeze(address addr, bool status)',
  'function snapshot() returns (uint256)',
  'function getCurrentSnapshotId() view returns (uint256)',
  'function upgradeTransferRules(address newTransferRules)',
  'function transferRules() view returns (address)',

  // -----------------------------------------------------------------------
  // EasyAccessControl — Role Management
  // -----------------------------------------------------------------------
  'function hasRole(address addr, uint8 role) view returns (bool)',
  'function grantRole(address addr, uint8 role)',
  'function revokeRole(address addr, uint8 role)',

  // -----------------------------------------------------------------------
  // Dividends
  // -----------------------------------------------------------------------
  'function tokenPrecisionDivider() view returns (uint256)',
  'function fundDividend(address token, uint256 amount, uint256 snapshotId)',
  'function claimDividend(address token, uint256 snapshotId)',
  'function withdrawalRemains(address token, uint256 snapshotId)',
  'function fundsAt(address token, uint256 snapshotId) view returns (uint256)',
  'function tokensAt(address token, uint256 snapshotId) view returns (uint256)',
  'function totalAwardedBalanceAt(address token, address receiver, uint256 snapshotId) view returns (uint256)',
  'function claimedBalanceAt(address token, address receiver, uint256 snapshotId) view returns (uint256)',
  'function unclaimedBalanceAt(address token, address receiver, uint256 snapshotId) view returns (uint256)',

  // -----------------------------------------------------------------------
  // RestrictedSwap — OTC Swaps
  // -----------------------------------------------------------------------
  'function swapNumber() view returns (uint256)',
  'function swapStatus(uint256 swapNumber) view returns (uint8)',
  'function configureSell(uint256 restrictedTokenAmount, address quoteToken, address quoteTokenSender, uint256 quoteTokenAmount)',
  'function configureBuy(uint256 restrictedTokenAmount, address restrictedTokenSender, address quoteToken, uint256 quoteTokenAmount)',
  'function completeSwapWithPaymentToken(uint256 swapNumber)',
  'function completeSwapWithRestrictedToken(uint256 swapNumber)',
  'function cancelSell(uint256 swapNumber)',

  // -----------------------------------------------------------------------
  // Events — RestrictedLockupToken
  // -----------------------------------------------------------------------
  'event ScheduleCreated(address indexed from, uint256 indexed scheduleId)',
  'event ScheduleFunded(address indexed from, address indexed to, uint256 indexed scheduleId, uint256 amount, uint256 commencementTimestamp, uint256 timelockId, address[] cancelableBy)',
  'event TimelockCanceled(address indexed canceledBy, address indexed target, uint256 indexed timelockIndex, address reclaimTokenTo, uint256 canceledAmount, uint256 paidAmount)',

  // Events — Transfer Restrictions
  'event AddressMaxBalance(address indexed admin, address indexed addr, uint256 indexed value)',
  'event AddressTransferGroup(address indexed admin, address indexed addr, uint256 indexed value)',
  'event AddressFrozen(address indexed admin, address indexed addr, bool indexed status)',
  'event AllowGroupTransfer(address indexed admin, uint256 indexed fromGroup, uint256 indexed toGroup, uint256 lockedUntil)',

  // Events — Admin
  'event Pause(address admin, bool status)',
  'event Upgrade(address admin, address oldRules, address newRules)',
  'event RoleChange(address indexed grantor, address indexed grantee, uint8 role, bool indexed status)',

  // Events — Dividends
  'event Funded(address indexed payer, address indexed token, uint256 amount, uint256 indexed snapshotId)',
  'event Claimed(address indexed payee, address indexed token, uint256 amount, uint256 indexed snapshotId)',
  'event Withdrawn(address indexed payee, address indexed token, uint256 amount, uint256 indexed snapshotId)',

  // Events — Swap
  'event SwapConfigured(uint256 indexed swapNumber, address indexed restrictedTokenSender, uint256 restrictedTokenAmount, address quoteToken, address indexed quoteTokenSender, uint256 quoteTokenAmount)',
  'event SwapComplete(uint256 indexed swapNumber, address indexed restrictedTokenSender, uint256 restrictedTokenAmount, address indexed quoteTokenSender, address quoteToken, uint256 quoteTokenAmount)',
  'event SwapCanceled(address indexed sender, uint256 indexed swapNumber)',

  // Events — ERC-20
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Snapshot(uint256 id)',
] as const;

/**
 * Role bitmask constants matching EasyAccessControl.sol.
 * Used for hasRole/grantRole/revokeRole calls.
 */
export const ROLE_CONTRACT_ADMIN = 1;
export const ROLE_RESERVE_ADMIN = 2;
export const ROLE_WALLETS_ADMIN = 4;
export const ROLE_TRANSFER_ADMIN = 8;

export const ROLE_LABELS: Record<number, string> = {
  [ROLE_CONTRACT_ADMIN]: 'Contract Admin',
  [ROLE_RESERVE_ADMIN]: 'Reserve Admin',
  [ROLE_WALLETS_ADMIN]: 'Wallets Admin',
  [ROLE_TRANSFER_ADMIN]: 'Transfer Admin',
};

export const ALL_ROLES = [
  ROLE_CONTRACT_ADMIN,
  ROLE_RESERVE_ADMIN,
  ROLE_WALLETS_ADMIN,
  ROLE_TRANSFER_ADMIN,
] as const;

/** Transfer restriction codes from TransferRules.sol */
export const TRANSFER_RESTRICTION_CODES: Record<number, string> = {
  0: 'SUCCESS',
  1: 'GREATER THAN RECIPIENT MAX BALANCE',
  2: 'SENDER TOKENS LOCKED',
  3: 'DO NOT SEND TO TOKEN CONTRACT',
  4: 'DO NOT SEND TO EMPTY ADDRESS',
  5: 'SENDER ADDRESS IS FROZEN',
  6: 'ALL TRANSFERS PAUSED',
  7: 'TRANSFER GROUP NOT APPROVED',
  8: 'TRANSFER GROUP NOT ALLOWED UNTIL LATER',
  9: 'RECIPIENT ADDRESS IS FROZEN',
};

/** SwapStatus enum values matching IRestrictedSwap.sol */
export const SWAP_STATUS = {
  SellConfigured: 0,
  BuyConfigured: 1,
  Complete: 2,
  Canceled: 3,
} as const;

export const SWAP_STATUS_LABELS: Record<number, string> = {
  [SWAP_STATUS.SellConfigured]: 'Sell Configured',
  [SWAP_STATUS.BuyConfigured]: 'Buy Configured',
  [SWAP_STATUS.Complete]: 'Complete',
  [SWAP_STATUS.Canceled]: 'Canceled',
};

/** BIPS precision constant (10000 = 100%) */
export const BIPS_PRECISION = 10000;
