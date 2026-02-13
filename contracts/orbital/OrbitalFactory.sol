// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OrbitalPool.sol";

/**
 * @title OrbitalFactory
 * @notice Factory contract for deploying OrbitalPool instances.
 *
 *         Maintains a registry of all pools, indexed by a deterministic
 *         pool key derived from the sorted token set. Ensures only one
 *         pool exists per unique combination of tokens + concentration.
 *
 * @dev    Follows existing Fueki platform conventions.
 */
contract OrbitalFactory {

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    /// @notice Admin address (can update default parameters).
    address public admin;

    /// @notice Default fee collector for new pools.
    address public defaultFeeCollector;

    /// @notice Default swap fee in basis points for new pools.
    uint256 public defaultSwapFeeBps;

    /// @notice Ordered list of all pools ever created.
    address[] private _allPools;

    /// @notice poolKey => pool address. poolKey = keccak256(sorted tokens + concentration).
    mapping(bytes32 => address) public poolsByKey;

    /// @notice token => list of pools that include this token.
    mapping(address => address[]) private _tokenPools;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event PoolCreated(
        address indexed pool,
        address[] tokens,
        uint8 concentration,
        uint256 swapFeeBps,
        address feeCollector
    );

    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event DefaultFeeCollectorUpdated(address indexed collector);
    event DefaultSwapFeeUpdated(uint256 newFeeBps);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error NotAdmin();
    error ZeroAddress();
    error PoolExists();
    error InvalidFee();

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /**
     * @param _admin             Initial admin address.
     * @param _feeCollector      Default fee collector for new pools.
     * @param _defaultSwapFeeBps Default swap fee in bps (e.g., 4 = 0.04%).
     */
    constructor(
        address _admin,
        address _feeCollector,
        uint256 _defaultSwapFeeBps
    ) {
        if (_admin == address(0) || _feeCollector == address(0)) revert ZeroAddress();
        if (_defaultSwapFeeBps > 100) revert InvalidFee();

        admin = _admin;
        defaultFeeCollector = _feeCollector;
        defaultSwapFeeBps = _defaultSwapFeeBps;
    }

    // ---------------------------------------------------------------
    //  Pool Creation
    // ---------------------------------------------------------------

    /**
     * @notice Create a new OrbitalPool for a given set of tokens.
     *
     * @param _tokens         Array of token addresses (2-8 tokens).
     * @param _concentration  Superellipse power (2, 4, 8, 16, 32).
     * @param _swapFeeBps     Swap fee in basis points (0 = use default).
     * @param _name           LP token name.
     * @param _symbol         LP token symbol.
     * @return pool           Address of the newly created pool.
     */
    function createPool(
        address[] calldata _tokens,
        uint8 _concentration,
        uint256 _swapFeeBps,
        string calldata _name,
        string calldata _symbol
    ) external returns (address pool) {
        // Use default fee if not specified
        uint256 feeBps = _swapFeeBps == 0 ? defaultSwapFeeBps : _swapFeeBps;

        // Compute pool key for uniqueness check
        bytes32 poolKey = _computePoolKey(_tokens, _concentration);
        if (poolsByKey[poolKey] != address(0)) revert PoolExists();

        // Deploy new pool
        OrbitalPool newPool = new OrbitalPool();
        pool = address(newPool);

        // Initialize the pool
        newPool.initialize(
            _tokens,
            _concentration,
            feeBps,
            defaultFeeCollector,
            _name,
            _symbol
        );

        // Register in storage
        poolsByKey[poolKey] = pool;
        _allPools.push(pool);

        // Index by token for lookup
        for (uint256 i = 0; i < _tokens.length; ++i) {
            _tokenPools[_tokens[i]].push(pool);
        }

        emit PoolCreated(pool, _tokens, _concentration, feeBps, defaultFeeCollector);
    }

    // ---------------------------------------------------------------
    //  View Functions
    // ---------------------------------------------------------------

    /// @notice Get total number of pools created.
    function totalPools() external view returns (uint256) {
        return _allPools.length;
    }

    /// @notice Get pool address at a given index.
    function getPoolAtIndex(uint256 index) external view returns (address) {
        return _allPools[index];
    }

    /// @notice Get all pool addresses.
    function getAllPools() external view returns (address[] memory) {
        return _allPools;
    }

    /// @notice Get pool address for a specific token set + concentration.
    function getPool(
        address[] calldata _tokens,
        uint8 _concentration
    ) external view returns (address) {
        bytes32 poolKey = _computePoolKey(_tokens, _concentration);
        return poolsByKey[poolKey];
    }

    /// @notice Get all pools that include a specific token.
    function getPoolsForToken(address token) external view returns (address[] memory) {
        return _tokenPools[token];
    }

    // ---------------------------------------------------------------
    //  Admin Functions
    // ---------------------------------------------------------------

    function setAdmin(address _newAdmin) external onlyAdmin {
        if (_newAdmin == address(0)) revert ZeroAddress();
        address old = admin;
        admin = _newAdmin;
        emit AdminUpdated(old, _newAdmin);
    }

    function setDefaultFeeCollector(address _collector) external onlyAdmin {
        if (_collector == address(0)) revert ZeroAddress();
        defaultFeeCollector = _collector;
        emit DefaultFeeCollectorUpdated(_collector);
    }

    function setDefaultSwapFee(uint256 _feeBps) external onlyAdmin {
        if (_feeBps > 100) revert InvalidFee();
        defaultSwapFeeBps = _feeBps;
        emit DefaultSwapFeeUpdated(_feeBps);
    }

    // ---------------------------------------------------------------
    //  Internal
    // ---------------------------------------------------------------

    /**
     * @notice Compute a deterministic pool key from sorted tokens + concentration.
     *         Tokens are sorted to ensure the same set always produces the same key.
     */
    function _computePoolKey(
        address[] calldata _tokens,
        uint8 _concentration
    ) internal pure returns (bytes32) {
        // Sort tokens for deterministic key
        address[] memory sorted = new address[](_tokens.length);
        for (uint256 i = 0; i < _tokens.length; ++i) {
            sorted[i] = _tokens[i];
        }
        _sortAddresses(sorted);

        return keccak256(abi.encodePacked(sorted, _concentration));
    }

    /// @notice Sort an array of addresses in ascending order (insertion sort).
    function _sortAddresses(address[] memory arr) internal pure {
        uint256 n = arr.length;
        for (uint256 i = 1; i < n; ++i) {
            address key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                --j;
            }
            arr[j] = key;
        }
    }
}
