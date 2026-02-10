// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITransferRules.sol";
import "./EasyAccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


contract RestrictedLockupToken is ERC20Snapshot, EasyAccessControl, ReentrancyGuard {

  using SafeERC20 for IERC20;

  struct ReleaseSchedule {
    uint releaseCount;
    uint delayUntilFirstReleaseInSeconds;
    uint initialReleasePortionInBips;
    uint periodBetweenReleasesInSeconds;
  }

  struct Timelock {
    uint scheduleId;
    uint commencementTimestamp;
    uint tokensTransferred;
    uint totalAmount;
    address[] cancelableBy; // not cancelable unless set at the time of funding
  }

  ReleaseSchedule[] public releaseSchedules;
  uint immutable public minTimelockAmount;
  uint immutable public maxReleaseDelay;
  uint private constant BIPS_PRECISION = 10000;

  mapping(address => Timelock[]) public timelocks;
  mapping(address => uint) internal _totalTokensUnlocked;

  event ScheduleCreated(address indexed from, uint indexed scheduleId);

  event ScheduleFunded(
    address indexed from,
    address indexed to,
    uint indexed scheduleId,
    uint amount,
    uint commencementTimestamp,
    uint timelockId,
    address[] cancelableBy
  );

  event TimelockCanceled(
    address indexed canceledBy,
    address indexed target,
    uint indexed timelockIndex,
    address relaimTokenTo,
    uint canceledAmount,
    uint paidAmount
  );

  uint8 public _decimals;

  ITransferRules public transferRules;

  uint256 public maxTotalSupply;

  // Transfer restriction "eternal storage" mappings that can be used by future TransferRules contract upgrades
  // They are accessed through getter and setter methods
  mapping(address => uint256) private _maxBalances;
  mapping(address => uint256) private _transferGroups; // restricted groups like Reg D Accredited US, Reg CF Unaccredited US and Reg S Foreign

  mapping(uint256 => mapping(uint256 => uint256)) private _allowGroupTransfers; // approve transfers between groups: from => to => TimeLockUntil

  mapping(address => bool) private _frozenAddresses;

  bool public isPaused = false;

  event AddressMaxBalance(address indexed admin, address indexed addr, uint256 indexed value);

  event AddressTransferGroup(address indexed admin, address indexed addr, uint256 indexed value);
  event AddressFrozen(address indexed admin, address indexed addr, bool indexed status);
  event AllowGroupTransfer(address indexed admin, uint256 indexed fromGroup, uint256 indexed toGroup, uint256 lockedUntil);

  event Pause(address admin, bool status);
  event Upgrade(address admin, address oldRules, address newRules);

  /**
    @dev Configure deployment for a specific token with release schedule security parameters
    @dev The symbol should end with " Unlock" & be less than 11 characters for MetaMask "custom token" compatibility
  */
  constructor (
    address transferRules_,
    address contractAdmin_,
    address tokenReserveAdmin_,
    string memory symbol_,
    string memory name_,
    uint8 decimals_,
    uint256 totalSupply_,
    uint256 maxTotalSupply_,
    uint _minTimelockAmount,
    uint _maxReleaseDelay
  ) ERC20(name_, symbol_) ReentrancyGuard() {
    // Restricted Token
    require(transferRules_ != address(0), "Transfer rules address cannot be 0x0");
    require(contractAdmin_ != address(0), "Token owner address cannot be 0x0");
    require(tokenReserveAdmin_ != address(0), "Token reserve admin address cannot be 0x0");

    // Transfer rules can be swapped out for a new contract inheriting from the ITransferRules interface
    // The "eternal storage" for rule data stays in this RestrictedToken contract for use by TransferRules contract upgrades
    transferRules = ITransferRules(transferRules_);
    _decimals = decimals_;
    maxTotalSupply = maxTotalSupply_;

    admins[contractAdmin_] = CONTRACT_ADMIN_ROLE;
    contractAdminCount = 1;

    admins[tokenReserveAdmin_] |= RESERVE_ADMIN_ROLE;

    _mint(tokenReserveAdmin_, totalSupply_);

    // Token Lockup
    require(_minTimelockAmount > 0, "Min timelock amount > 0");
    minTimelockAmount = _minTimelockAmount;
    maxReleaseDelay = _maxReleaseDelay;
  }

  modifier onlyWalletsAdminOrReserveAdmin() {
    require((hasRole(msg.sender, WALLETS_ADMIN_ROLE) || hasRole(msg.sender, RESERVE_ADMIN_ROLE)),
      "DOES NOT HAVE WALLETS ADMIN OR RESERVE ADMIN ROLE");
    _;
  }

  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  // Create new snapshot
  function snapshot() external onlyContractAdmin returns (uint256)  {
    return _snapshot();
  }

  // Get current snapshot ID
  function getCurrentSnapshotId() view external returns (uint256) {
    return _getCurrentSnapshotId();
  }

  /// @dev Sets the maximum number of tokens an address will be allowed to hold.
  /// Addresses can hold 0 tokens by default.
  /// @param addr The address to restrict
  /// @param updatedValue the maximum number of tokens the address can hold
  function setMaxBalance(address addr, uint256 updatedValue) public validAddress(addr) onlyWalletsAdmin {
    _maxBalances[addr] = updatedValue;
    emit AddressMaxBalance(msg.sender, addr, updatedValue);
  }

  /// @dev Gets the maximum number of tokens an address is allowed to hold
  /// @param addr The address to check restrictions for
  function getMaxBalance(address addr) external view returns (uint256) {
    return _maxBalances[addr];
  }

  /**
    @notice Create a release schedule template that can be used to generate many token timelocks
    @param releaseCount Total number of releases including any initial "cliff'
    @param delayUntilFirstReleaseInSeconds "cliff" or 0 for immediate release
    @param initialReleasePortionInBips Portion to release in 100ths of 1% (10000 BIPS per 100%)
    @param periodBetweenReleasesInSeconds After the delay and initial release
        the remaining tokens will be distributed evenly across the remaining number of releases (releaseCount - 1)
    @return unlockScheduleId The id used to refer to the release schedule at the time of funding the schedule
  */
  function createReleaseSchedule(
    uint releaseCount,
    uint delayUntilFirstReleaseInSeconds,
    uint initialReleasePortionInBips,
    uint periodBetweenReleasesInSeconds
  ) external returns (uint unlockScheduleId) {
    require(delayUntilFirstReleaseInSeconds <= maxReleaseDelay, "first release > max");
    require(releaseCount >= 1, "< 1 release");
    require(initialReleasePortionInBips <= BIPS_PRECISION, "release > 100%");

    if (releaseCount > 1) {
      require(periodBetweenReleasesInSeconds > 0, "period = 0");
    } else if (releaseCount == 1) {
      require(initialReleasePortionInBips == BIPS_PRECISION, "released < 100%");
    }

    releaseSchedules.push(ReleaseSchedule(
        releaseCount,
        delayUntilFirstReleaseInSeconds,
        initialReleasePortionInBips,
        periodBetweenReleasesInSeconds
      ));

    unlockScheduleId = releaseSchedules.length - 1;
    emit ScheduleCreated(msg.sender, unlockScheduleId);

    return unlockScheduleId;
  }

  /**
    @notice Fund the programmatic release of tokens to a recipient.
        WARNING: this function IS CANCELABLE by cancelableBy.
        If canceled the tokens that are locked at the time of the cancellation will be returned to the funder
        and unlocked tokens will be transferred to the recipient.
    @param to recipient address that will have tokens unlocked on a release schedule
    @param amount of tokens to transfer in base units (the smallest unit without the decimal point)
    @param commencementTimestamp the time the release schedule will start
    @param scheduleId the id of the release schedule that will be used to release the tokens
    @param cancelableBy array of canceler addresses
    @return success Always returns true on completion so that a function calling it can revert if the required call did not succeed
  */
  function fundReleaseSchedule(
    address to,
    uint amount,
    uint commencementTimestamp, // unix timestamp
    uint scheduleId,
    address[] memory cancelableBy
  ) public nonReentrant returns (bool success) {
    require(cancelableBy.length <= 10, "max 10 cancelableBy addressees");

    uint timelockId = _fund(to, amount, commencementTimestamp, scheduleId);

    if (cancelableBy.length > 0) {
      timelocks[to][timelockId].cancelableBy = cancelableBy;
    }

    emit ScheduleFunded(msg.sender, to, scheduleId, amount, commencementTimestamp, timelockId, cancelableBy);
    return true;
  }


  function _fund(
    address to,
    uint amount,
    uint commencementTimestamp, // unix timestamp
    uint scheduleId)
  internal returns (uint) {
    require(amount >= minTimelockAmount, "amount < min funding");
    require(to != address(0), "to 0 address");
    require(scheduleId < releaseSchedules.length, "bad scheduleId");
    require(amount >= releaseSchedules[scheduleId].releaseCount, "< 1 token per release");

    _transfer(address(this), amount);

    require(
      commencementTimestamp + releaseSchedules[scheduleId].delayUntilFirstReleaseInSeconds <=
      block.timestamp + maxReleaseDelay
    , "initial release out of range");

    Timelock memory timelock;
    timelock.scheduleId = scheduleId;
    timelock.commencementTimestamp = commencementTimestamp;
    timelock.totalAmount = amount;

    timelocks[to].push(timelock);
    return timelockCountOf(to) - 1;
  }

  /**
    @notice Cancel a cancelable timelock created by the fundReleaseSchedule function.
        WARNING: this function cannot cancel a release schedule created by fundReleaseSchedule
        If canceled the tokens that are locked at the time of the cancellation will be returned to the funder
        and unlocked tokens will be transferred to the recipient.
    @param target The address that would receive the tokens when released from the timelock.
    @param timelockIndex timelock index
    @param target The address that would receive the tokens when released from the timelock
    @param scheduleId require it matches expected
    @param commencementTimestamp require it matches expected
    @param totalAmount require it matches expected
    @param reclaimTokenTo reclaim token to
    @return success Always returns true on completion so that a function calling it can revert if the required call did not succeed
  */
  function cancelTimelock(
    address target,
    uint timelockIndex,
    uint scheduleId,
    uint commencementTimestamp,
    uint totalAmount,
    address reclaimTokenTo
  ) public returns (bool success) {
    require(timelockCountOf(target) > timelockIndex, "invalid timelock");
    require(reclaimTokenTo != address(0), "Invalid reclaimTokenTo");

    Timelock storage timelock = timelocks[target][timelockIndex];

    require(_canBeCanceled(timelock), "You are not allowed to cancel this timelock");
    require(timelock.scheduleId == scheduleId, "Expected scheduleId does not match");
    require(timelock.commencementTimestamp == commencementTimestamp, "Expected commencementTimestamp does not match");
    require(timelock.totalAmount == totalAmount, "Expected totalAmount does not match");

    uint canceledAmount = lockedAmountOfTimelock(target, timelockIndex);

    require(canceledAmount > 0, "Timelock has no value left");

    uint paidAmount = unlockedAmountOfTimelock(target, timelockIndex);

    IERC20(this).safeTransfer(reclaimTokenTo, canceledAmount);
    IERC20(this).safeTransfer(target, paidAmount);

    emit TimelockCanceled(msg.sender, target, timelockIndex, reclaimTokenTo, canceledAmount, paidAmount);

    timelock.tokensTransferred = timelock.totalAmount;
    return true;
  }

  /**
   *  @notice Check if timelock can be cancelable by msg.sender
   */
  function _canBeCanceled(Timelock storage timelock) view private returns (bool){
    for (uint i = 0; i < timelock.cancelableBy.length; i++) {
      if (msg.sender == timelock.cancelableBy[i]) {
        return true;
      }
    }
    return false;
  }

  /**
   *  @notice Batch version of fund cancelable release schedule
   *  @param to An array of recipient address that will have tokens unlocked on a release schedule
   *  @param amounts An array of amount of tokens to transfer in base units (the smallest unit without the decimal point)
   *  @param commencementTimestamps An array of the time the release schedule will start
   *  @param scheduleIds An array of the id of the release schedule that will be used to release the tokens
   *  @param cancelableBy An array of cancelables
   *  @return success Always returns true on completion so that a function calling it can revert if the required call did not succeed
   */
  function batchFundReleaseSchedule(
    address[] calldata to,
    uint[] calldata amounts,
    uint[] calldata commencementTimestamps,
    uint[] calldata scheduleIds,
    address[] calldata cancelableBy
  ) external returns (bool success) {
    require(to.length == amounts.length, "mismatched array length");
    require(to.length == commencementTimestamps.length, "mismatched array length");
    require(to.length == scheduleIds.length, "mismatched array length");

    for (uint i = 0; i < to.length; i++) {
      require(fundReleaseSchedule(
          to[i],
          amounts[i],
          commencementTimestamps[i],
          scheduleIds[i],
          cancelableBy
        ));
    }

    return true;
  }
  /**
    @notice Get The locked balance for a specific address and specific timelock
    @param who The address to check
    @param timelockIndex Specific timelock belonging to the who address
    @return locked Balance of the timelock
    lockedBalanceOfTimelock
  */
  function lockedAmountOfTimelock(address who, uint timelockIndex) public view returns (uint locked) {
    Timelock memory timelock = timelockOf(who, timelockIndex);
    if (timelock.totalAmount <= timelock.tokensTransferred) {
      return 0;
    } else {
      return timelock.totalAmount - totalUnlockedToDateOfTimelock(who, timelockIndex);
    }
  }

  /**
    @notice Get the unlocked balance for a specific address and specific timelock
    @param who the address to check
    @param timelockIndex for a specific timelock belonging to the who address
    @return unlocked balance of the timelock
    unlockedBalanceOfTimelock
  */
  function unlockedAmountOfTimelock(address who, uint timelockIndex) public view returns (uint unlocked) {
    Timelock memory timelock = timelockOf(who, timelockIndex);
    if (timelock.totalAmount <= timelock.tokensTransferred) {
      return 0;
    } else {
      return totalUnlockedToDateOfTimelock(who, timelockIndex) - timelock.tokensTransferred;
    }
  }

  /**
    @notice Check the total remaining balance of a timelock including the locked and unlocked portions
    @param who the address to check
    @param timelockIndex  Specific timelock belonging to the who address
    @return total remaining balance of a timelock
  */
  function balanceOfTimelock(address who, uint timelockIndex) external view returns (uint) {
    Timelock memory timelock = timelockOf(who, timelockIndex);
    if (timelock.totalAmount <= timelock.tokensTransferred) {
      return 0;
    } else {
      return timelock.totalAmount - timelock.tokensTransferred;
    }
  }

  /**
    @notice Gets the total locked and unlocked balance of a specific address's timelocks
    @param who The address to check
    @param timelockIndex The index of the timelock for the who address
    @return total Locked and unlocked amount for the specified timelock
  */
  function totalUnlockedToDateOfTimelock(address who, uint timelockIndex) public view returns (uint total) {
    Timelock memory _timelock = timelockOf(who, timelockIndex);

    return calculateUnlocked(
      _timelock.commencementTimestamp,
      block.timestamp,
      _timelock.totalAmount,
      _timelock.scheduleId
    );
  }

  /**
    @notice ERC20 standard interface function
          Provide controls of Restricted and Lockup tokens
          Can transfer simple ERC-20 tokens and unlocked tokens at the same time
          First will transfer unlocked tokens and then simple ERC-20
    @param recipient of transfer
    @param amount of tokens to transfer
    @return true On success / Reverted on error
  */
  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
    require(recipient != address(0), "Address cannot be 0x0");
    enforceTransferRestrictions(msg.sender, recipient, amount);
    return _transfer(recipient, amount);
  }

  function _transfer(address recipient, uint256 amount) private returns (bool) {
    uint256[2] memory values = validateTransfer(msg.sender, recipient, amount);
    require(values[0] + values[1] >= amount, "Insufficent tokens");
    if (values[0] > 0) {// unlocked tokens
      super._transfer(address(this), recipient, values[0]);
    }
    if (values[1] > 0) {// simple tokens
      super._transfer(msg.sender, recipient, values[1]);
    }
    return true;
  }

  /**
    @notice ERC20 standard interface function
          Provide controls of Restricted and Lockup tokens
          Can transfer simple ERC-20 tokens and unlocked tokens at the same time
          First will transfer unlocked tokens and then simple ERC-20
    @param sender of transfer
    @param recipient of transfer
    @param amount of tokens to transfer
    @return true On success / Reverted on error
  */
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) public virtual override returns (bool) {
    require(recipient != address(0) && sender != address(0), "Address cannot be 0x0");

    uint256 currentAllowance = allowance(sender, msg.sender);

    require(amount <= currentAllowance, "The approved allowance is lower than the transfer amount");
    enforceTransferRestrictions(sender, recipient, amount);

    uint256[2] memory values = validateTransfer(sender, recipient, amount);
    require(values[0] + values[1] >= amount, "Insufficent tokens");

    if (values[0] > 0) { // unlocked tokens
      super._transfer(address(this), recipient, values[0]);

      // Decrease allowance
      unchecked {
        _approve(sender, msg.sender, currentAllowance - values[0]);
      }
    }

    if (values[1] > 0) { // simple tokens
      super.transferFrom(sender, recipient, values[1]);
    }
    return true;
  }

  /**
    @notice Balance of simple ERC20 tokens without any timelocks
    @param who Address to calculate
    @return amount The amount of simple ERC-20 tokens available
    token.balanceOf
  **/
  function tokensBalanceOf(address who) public view returns (uint256) {
    return super.balanceOf(who);
  }

  /**
    @notice Get The total available to transfer balance exclude timelocked
    @param who Address to calculate
    @return amount The total available amount
    no have original
  **/
  function unlockedBalanceOf(address who) public view returns (uint256) {
    return tokensBalanceOf(who) + unlockedAmountOf(who);
  }

  /**
    @notice Get The total balance of tokens (simple + locked + unlocked)
    @param who Address to calculate
    @return amount The total account balance amount
    no have original
  **/
  function balanceOf(address who) public view override returns (uint256) {
    return tokensBalanceOf(who) + unlockedAmountOf(who) + lockedAmountOf(who);
  }

  /**
    @notice Get The total locked balance of an address for all timelocks
    @param who Address to calculate
    @return amount The total locked amount of tokens for all of the who address's timelocks
    lockedBalanceOf
  */
  function lockedAmountOf(address who) public view returns (uint amount) {
    for (uint i = 0; i < timelockCountOf(who); i++) {
      amount += lockedAmountOfTimelock(who, i);
    }
    return amount;
  }

  /**
    @notice Get The total unlocked balance of an address for all timelocks
    @param who Address to calculate
    @return amount The total unlocked amount of tokens for all of the who address's timelocks
    unlockedBalanceOf
  */
  function unlockedAmountOf(address who) public view returns (uint amount) {
    for (uint i = 0; i < timelockCountOf(who); i++) {
      amount += unlockedAmountOfTimelock(who, i);
    }
    return amount;
  }

  /**
    @notice Get timelocked balance - used only in tests
    @param who Address to calculate
    @return Amount of the tokens used in timelocks (locked+unlocked)
    balanceOf
  **/
  function timelockBalanceOf(address who) public view returns (uint) {
    return unlockedAmountOf(who) + lockedAmountOf(who);
  }

  /**
    @notice Check and calculate the availability to transfer tokens between accounts from simple and timelock balances
    @param from Address from
    @param to Address to
    @param value Amount of tokens
    @return values Array of uint256[2] contains unlocked tokens at index 0, and simple ERC-20 at index 1 that can be used for transfer
  **/
  function validateTransfer(address from, address to, uint256 value) internal returns (uint256[2] memory values) {
    uint256 balance = tokensBalanceOf(from);
    uint256 unlockedBalance = unlockedAmountOf(from);

    require(balance + unlockedBalance >= value, "amount > unlocked");

    uint remainingTransfer = value;

    // transfer from unlocked tokens
    for (uint i = 0; i < timelockCountOf(from); i++) {
      // if the timelock has no value left
      if (timelocks[from][i].tokensTransferred == timelocks[from][i].totalAmount) {
        continue;
      } else if (remainingTransfer > unlockedAmountOfTimelock(from, i)) {
        // if the remainingTransfer is more than the unlocked balance use it all
        remainingTransfer -= unlockedAmountOfTimelock(from, i);
        timelocks[from][i].tokensTransferred += unlockedAmountOfTimelock(from, i);
      } else {
        // if the remainingTransfer is less than or equal to the unlocked balance
        // use part or all and exit the loop
        timelocks[from][i].tokensTransferred += remainingTransfer;
        remainingTransfer = 0;
        break;
      }
    }

    values[0] = value - remainingTransfer; // from unlockedValue
    values[1] = remainingTransfer; // from balanceOf
  }

  /**
    @notice transfers the unlocked token from an address's specific timelock
        It is typically more convenient to call transfer. But if the account has many timelocks the cost of gas
        for calling transfer may be too high. Calling transferTimelock from a specific timelock limits the transfer cost.
    @param to the address that the tokens will be transferred to
    @param value the number of token base units to me transferred to the to address
    @param timelockId the specific timelock of the function caller to transfer unlocked tokens from
    @return bool always true when completed
  */
  function transferTimelock(address to, uint value, uint timelockId) public returns (bool) {
    require(unlockedAmountOfTimelock(msg.sender, timelockId) >= value, "amount > unlocked");
    timelocks[msg.sender][timelockId].tokensTransferred += value;
    IERC20(this).safeTransfer(to, value);
    return true;
  }

  /**
    @notice calculates how many tokens would be released at a specified time for a scheduleId.
        This is independent of any specific address or address's timelock.
    @param commencedTimestamp the commencement time to use in the calculation for the scheduled
    @param currentTimestamp the timestamp to calculate unlocked tokens for
    @param amount the amount of tokens
    @param scheduleId the schedule id used to calculate the unlocked amount
    @return unlocked the total amount unlocked for the schedule given the other parameters
  */
  function calculateUnlocked(
    uint commencedTimestamp,
    uint currentTimestamp,
    uint amount,
    uint scheduleId
  ) public view returns (uint unlocked) {
    return calculateUnlocked(commencedTimestamp, currentTimestamp, amount, releaseSchedules[scheduleId]);
  }

  // @notice the total number of schedules that have been created
  function scheduleCount() external view returns (uint count) {
    return releaseSchedules.length;
  }

  /**
    @notice Get the struct details for an address's specific timelock
    @param who Address to check
    @param index The index of the timelock for the who address
    @return timelock Struct with the attributes of the timelock
  */
  function timelockOf(address who, uint index) public view returns (Timelock memory timelock) {
    return timelocks[who][index];
  }

  // @notice returns the total count of timelocks for a specific address
  function timelockCountOf(address who) public view returns (uint) {
    return timelocks[who].length;
  }

  /**
    @notice calculates how many tokens would be released at a specified time for a ReleaseSchedule struct.
            This is independent of any specific address or address's timelock.
    @param commencedTimestamp the commencement time to use in the calculation for the scheduled
    @param currentTimestamp the timestamp to calculate unlocked tokens for
    @param amount the amount of tokens
    @param releaseSchedule a ReleaseSchedule struct used to calculate the unlocked amount
    @return unlocked the total amount unlocked for the schedule given the other parameters
  */
  function calculateUnlocked(
    uint commencedTimestamp,
    uint currentTimestamp,
    uint amount,
    ReleaseSchedule memory releaseSchedule)
  public pure returns (uint unlocked) {
    return calculateUnlocked(
      commencedTimestamp,
      currentTimestamp,
      amount,
      releaseSchedule.releaseCount,
      releaseSchedule.delayUntilFirstReleaseInSeconds,
      releaseSchedule.initialReleasePortionInBips,
      releaseSchedule.periodBetweenReleasesInSeconds
    );
  }

  /**
    @notice The same functionality as above function with spread format of `releaseSchedule` arg
    @param commencedTimestamp the commencement time to use in the calculation for the scheduled
    @param currentTimestamp the timestamp to calculate unlocked tokens for
    @param amount the amount of tokens
    @param releaseCount Total number of releases including any initial "cliff'
    @param delayUntilFirstReleaseInSeconds "cliff" or 0 for immediate release
    @param initialReleasePortionInBips Portion to release in 100ths of 1% (10000 BIPS per 100%)
    @param periodBetweenReleasesInSeconds After the delay and initial release
    @return unlocked the total amount unlocked for the schedule given the other parameters
  */
  function calculateUnlocked(
    uint commencedTimestamp,
    uint currentTimestamp,
    uint amount,
    uint releaseCount,
    uint delayUntilFirstReleaseInSeconds,
    uint initialReleasePortionInBips,
    uint periodBetweenReleasesInSeconds
  ) public pure returns (uint unlocked) {
    if (commencedTimestamp > currentTimestamp) {
      return 0;
    }
    uint secondsElapsed = currentTimestamp - commencedTimestamp;

    // return the full amount if the total lockup period has expired
    // unlocked amounts in each period are truncated and round down remainders smaller than the smallest unit
    // unlocking the full amount unlocks any remainder amounts in the final unlock period
    // this is done first to reduce computation
    if (
      secondsElapsed >= delayUntilFirstReleaseInSeconds +
    (periodBetweenReleasesInSeconds * (releaseCount - 1))
    ) {
      return amount;
    }

    // unlock the initial release if the delay has elapsed
    if (secondsElapsed >= delayUntilFirstReleaseInSeconds) {
      unlocked = (amount * initialReleasePortionInBips) / BIPS_PRECISION;

      // if at least one period after the delay has passed
      if (secondsElapsed - delayUntilFirstReleaseInSeconds >= periodBetweenReleasesInSeconds) {

        // calculate the number of additional periods that have passed (not including the initial release)
        // this discards any remainders (ie it truncates / rounds down)
        uint additionalUnlockedPeriods = (secondsElapsed - delayUntilFirstReleaseInSeconds) / periodBetweenReleasesInSeconds;

        // calculate the amount of unlocked tokens for the additionalUnlockedPeriods
        // multiplication is applied before division to delay truncating to the smallest unit
        // this distributes unlocked tokens more evenly across unlock periods
        // than truncated division followed by multiplication
        unlocked += ((amount - unlocked) * additionalUnlockedPeriods) / (releaseCount - 1);
      }
    }

    return unlocked;
  }

  /// @dev Enforces transfer restrictions managed using the ERC-1404 standard functions.
  /// The TransferRules contract defines what the rules are. The data inputs to those rules remains in the RestrictedToken contract.
  /// TransferRules is a separate contract so its logic can be upgraded.
  /// @param from The address the tokens are transferred from
  /// @param to The address the tokens would be transferred to
  /// @param value the quantity of tokens to be transferred
  function enforceTransferRestrictions(address from, address to, uint256 value) public view {/*private*/
    uint8 restrictionCode = detectTransferRestriction(from, to, value);
    require(transferRules.checkSuccess(restrictionCode), messageForTransferRestriction(restrictionCode));
  }

  /// @dev Calls the TransferRules detectTransferRetriction function to determine if tokens can be transferred.
  /// detectTransferRestriction returns a status code.
  /// @param from The address the tokens are transferred from
  /// @param to The address the tokens would be transferred to
  /// @param value The quantity of tokens to be transferred
  function detectTransferRestriction(address from, address to, uint256 value) public view returns (uint8) {
    return transferRules.detectTransferRestriction(address(this), from, to, value);
  }

  /// @dev Calls TransferRules to lookup a human readable error message that goes with an error code.
  /// @param restrictionCode is an error code to lookup an error code for
  function messageForTransferRestriction(uint8 restrictionCode) public view returns (string memory) {
    return transferRules.messageForTransferRestriction(restrictionCode);
  }

  /// @dev Set the one group that the address belongs to, such as a US Reg CF investor group.
  /// @param addr The address to set the group for.
  /// @param groupID The uint256 numeric ID of the group.
  function setTransferGroup(address addr, uint256 groupID) public validAddress(addr) onlyWalletsAdmin {
    _transferGroups[addr] = groupID;
    emit AddressTransferGroup(msg.sender, addr, groupID);
  }

  /// @dev Gets the transfer group the address belongs to. The default group is 0.
  /// @param addr The address to check.
  /// @return groupID The group id of the address.
  function getTransferGroup(address addr) external view returns (uint256 groupID) {
    return _transferGroups[addr];
  }

  /// @dev Freezes or unfreezes an address.
  /// Tokens in a frozen address cannot be transferred from until the address is unfrozen.
  /// @param addr The address to be frozen.
  /// @param status The frozenAddress status of the address. True means frozen false means not frozen.
  function freeze(address addr, bool status) public validAddress(addr) onlyWalletsAdminOrReserveAdmin {
    _frozenAddresses[addr] = status;
    emit AddressFrozen(msg.sender, addr, status);
  }

  /// @dev Checks the status of an address to see if its frozen
  /// @param addr The address to check
  /// @return status Returns true if the address is frozen and false if its not frozen.
  function getFrozenStatus(address addr) external view returns (bool status) {
    return _frozenAddresses[addr];
  }

  /// @dev A convenience method for updating the transfer group, lock until, max balance, and freeze status.
  /// The convenience method also helps to reduce gas costs.
  /// @notice This function has different parameters count from original
  /// @param addr The address to set permissions for.
  /// @param groupID The ID of the address
  /// @param lockedBalanceUntil The amount of tokens to be reserved until the timelock expires. Reservation is exclusive.
  /// @param maxBalance Is the maximum number of tokens the account can hold.
  /// @param status The frozenAddress status of the address. True means frozen false means not frozen.
  function setAddressPermissions(address addr, uint256 groupID, uint256 lockedBalanceUntil,
    uint256 maxBalance, bool status) public validAddress(addr) onlyWalletsAdmin {
    setTransferGroup(addr, groupID);
    setMaxBalance(addr, maxBalance);
    freeze(addr, status);
  }

  /// @dev Sets an allowed transfer from a group to another group beginning at a specific time.
  /// There is only one definitive rule per from and to group.
  /// @param from The group the transfer is coming from.
  /// @param to The group the transfer is going to.
  /// @param lockedUntil The unix timestamp that the transfer is locked until. 0 is a special number. 0 means the transfer is not allowed.
  /// This is because in the smart contract mapping all pairs are implicitly defined with a default lockedUntil value of 0.
  /// But no transfers should be authorized until explicitly allowed. Thus 0 must mean no transfer is allowed.
  function setAllowGroupTransfer(uint256 from, uint256 to, uint256 lockedUntil) external onlyTransferAdmin {
    _allowGroupTransfers[from][to] = lockedUntil;
    emit AllowGroupTransfer(msg.sender, from, to, lockedUntil);
  }

  /// @dev Checks to see when a transfer between two addresses would be allowed.
  /// @param from The address the transfer is coming from
  /// @param to The address the transfer is going to
  /// @return timestamp The Unix timestamp of the time the transfer would be allowed. A 0 means never.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  function getAllowTransferTime(address from, address to) external view returns (uint timestamp) {
    return _allowGroupTransfers[_transferGroups[from]][_transferGroups[to]];
  }

  /// @dev Checks to see when a transfer between two groups would be allowed.
  /// @param from The group id the transfer is coming from
  /// @param to The group id the transfer is going to
  /// @return timestamp The Unix timestamp of the time the transfer would be allowed. A 0 means never.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  function getAllowGroupTransferTime(uint from, uint to) external view returns (uint timestamp) {
    return _allowGroupTransfers[from][to];
  }

  /// @dev Destroys tokens and removes them from the total supply. Can only be called by an address with a Reserve Admin role.
  /// @param from The address to destroy the tokens from.
  /// @param value The number of tokens to destroy from the address.
  function burn(address from, uint256 value) external validAddress(from) onlyReserveAdmin {
    require(value <= balanceOf(from), "Insufficent tokens to burn");
    _burn(from, value);
  }

  /// @dev Allows the reserve admin to create new tokens in a specified address.
  /// The total number of tokens cannot exceed the maxTotalSupply (the "Hard Cap").
  /// @param to The addres to mint tokens into.
  /// @param value The number of tokens to mint.
  function mint(address to, uint256 value) external validAddress(to) onlyReserveAdmin {
    require(totalSupply() + value <= maxTotalSupply, "Cannot mint more than the max total supply");
    _mint(to, value);
  }

  /// @dev Allows the contract admin to pause transfers.
  function pause() external onlyContractAdmin() {
    isPaused = true;
    emit Pause(msg.sender, true);
  }

  /// @dev Allows the contract admin to unpause transfers.
  function unpause() external onlyContractAdmin() {
    isPaused = false;
    emit Pause(msg.sender, false);
  }

  /// @dev Allows the contrac admin to upgrade the transfer rules.
  /// The upgraded transfer rules must implement the ITransferRules interface which conforms to the ERC-1404 token standard.
  /// @param newTransferRules The address of the deployed TransferRules contract.
  function upgradeTransferRules(ITransferRules newTransferRules) external onlyTransferAdmin {
    require(address(newTransferRules) != address(0x0), "Address cannot be 0x0");
    address oldRules = address(transferRules);
    transferRules = newTransferRules;
    emit Upgrade(msg.sender, oldRules, address(newTransferRules));
  }


  // @dev can delete, used only at tests
  function safeApprove(address spender, uint256 value) public {
    // safeApprove should only be called when setting an initial allowance,
    // or when resetting it to zero. To increase and decrease it, use
    // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
    require((value == 0) || (allowance(address(msg.sender), spender) == 0),
      "Cannot approve from non-zero to non-zero allowance"
    );
    approve(spender, value);
  }

}
