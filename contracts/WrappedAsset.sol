// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WrappedAsset
 * @notice ERC-20 token representing a wrapped real-world asset.
 *         Only the factory that deployed this token may mint new supply.
 *         Any token holder may burn their own tokens.
 *
 * @dev    Implements the full ERC-20 interface inline (no external imports).
 *         Stores immutable metadata about the underlying document that was
 *         tokenized (hash, type, original value).
 */
contract WrappedAsset {

    // ---------------------------------------------------------------
    //  ERC-20 storage
    // ---------------------------------------------------------------

    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ---------------------------------------------------------------
    //  Asset metadata (set once at construction, never mutated)
    // ---------------------------------------------------------------

    bytes32 public documentHash;
    string  public documentType;
    uint256 public originalValue;

    // ---------------------------------------------------------------
    //  Access control
    // ---------------------------------------------------------------

    /// @notice The factory contract that deployed this token.
    address public immutable factory;

    // ---------------------------------------------------------------
    //  Events (ERC-20)
    // ---------------------------------------------------------------

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error OnlyFactory();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /**
     * @param _name          Token name (e.g. "Wrapped Invoice #42")
     * @param _symbol        Token symbol (e.g. "wINV42")
     * @param _documentHash  Keccak-256 hash of the original document
     * @param _documentType  Human-readable document category (e.g. "invoice")
     * @param _originalValue Nominal value of the underlying asset (in minor units)
     */
    constructor(
        string  memory _name,
        string  memory _symbol,
        bytes32 _documentHash,
        string  memory _documentType,
        uint256 _originalValue
    ) {
        name          = _name;
        symbol        = _symbol;
        documentHash  = _documentHash;
        documentType  = _documentType;
        originalValue = _originalValue;
        factory       = msg.sender;
    }

    // ---------------------------------------------------------------
    //  ERC-20 core
    // ---------------------------------------------------------------

    /**
     * @notice Transfer `amount` tokens from the caller to `to`.
     * @param to     Recipient address.
     * @param amount Number of tokens (in wei-units).
     * @return success Always true on success; reverts otherwise.
     */
    function transfer(address to, uint256 amount) external returns (bool success) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        unchecked {
            balanceOf[msg.sender] -= amount;
        }
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Approve `spender` to transfer up to `amount` tokens on behalf
     *         of the caller.
     * @param spender Address being granted the allowance.
     * @param amount  Maximum number of tokens the spender may transfer.
     * @return success Always true.
     */
    function approve(address spender, uint256 amount) external returns (bool success) {
        if (spender == address(0)) revert ZeroAddress();

        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfer `amount` tokens from `from` to `to`, deducting from
     *         the caller's allowance.
     * @param from   Address whose tokens are transferred.
     * @param to     Recipient address.
     * @param amount Number of tokens.
     * @return success Always true on success; reverts otherwise.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool success) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) revert InsufficientAllowance();
            unchecked {
                allowance[from][msg.sender] = currentAllowance - amount;
            }
        }

        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ---------------------------------------------------------------
    //  Mint / Burn
    // ---------------------------------------------------------------

    /**
     * @notice Mint `amount` new tokens to `to`.  Callable only by the factory.
     * @param to     Recipient of the newly minted tokens.
     * @param amount Number of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyFactory {
        if (to == address(0)) revert ZeroAddress();

        totalSupply   += amount;
        balanceOf[to] += amount;

        emit Transfer(address(0), to, amount);
    }

    /**
     * @notice Burn `amount` of the caller's tokens, permanently removing
     *         them from circulation.
     * @param amount Number of tokens to burn.
     */
    function burn(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        unchecked {
            balanceOf[msg.sender] -= amount;
        }
        totalSupply -= amount;

        emit Transfer(msg.sender, address(0), amount);
    }
}
