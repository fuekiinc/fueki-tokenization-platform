// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./SecurityTokenDeployer.sol";

/**
 * @title SecurityTokenFactory
 *
 * @dev Each deployment creates:
 *      1. A TransferRules contract (compliance engine)
 *      2. A RestrictedSwap token (full security token with lockups, dividends, swaps)
 *
 *      The deployer becomes both CONTRACT_ADMIN and RESERVE_ADMIN on the token.
 *      Child contract bytecodes live in the SecurityTokenDeployer contract so
 *      this factory stays under the EIP-170 24 KB size limit.
 */
contract SecurityTokenFactory {

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    struct SecurityToken {
        address tokenAddress;
        address transferRulesAddress;
        address creator;
        string  name;
        string  symbol;
        uint8   decimals;
        uint256 totalSupply;
        uint256 maxTotalSupply;
        bytes32 documentHash;
        string  documentType;
        uint256 originalValue;
        uint256 createdAt;
    }

    /// @notice The external deployer contract that creates child contracts.
    /// Gas optimization: immutable saves ~2100 gas per access vs storage read
    SecurityTokenDeployer private immutable _deployer;

    /// @notice Ordered list of every security token ever created.
    SecurityToken[] private _allTokens;

    /// @notice creator => list of token indices they deployed.
    mapping(address => uint256[]) private _userTokens;

    /// @notice token address => index in _allTokens array.
    mapping(address => uint256) private _tokenIndex;

    /// @notice token address => bool (exists in registry).
    mapping(address => bool) private _tokenExists;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event SecurityTokenCreated(
        address indexed creator,
        address indexed tokenAddress,
        address indexed transferRulesAddress,
        string  name,
        string  symbol,
        uint256 totalSupply,
        uint256 maxTotalSupply,
        bytes32 documentHash,
        string  documentType,
        uint256 originalValue
    );

    // ---------------------------------------------------------------
    //  Errors (gas optimization: custom errors are ~200 gas cheaper than require strings)
    // ---------------------------------------------------------------

    error ZeroSupply();
    error EmptyName();
    error EmptySymbol();
    error MaxSupplyTooLow();
    error TokenNotFound();
    error IndexOutOfBounds();

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    constructor(address deployerAddress) {
        _deployer = SecurityTokenDeployer(deployerAddress);
    }

    // ---------------------------------------------------------------
    //  External functions
    // ---------------------------------------------------------------

    /**
     * @notice Deploy a new ERC-1404 security token with full compliance features.
     *
     * @param _name            Token name
     * @param _symbol          Token symbol (max 11 chars for MetaMask compat)
     * @param _decimals        Token decimals (typically 18)
     * @param _totalSupply     Initial supply to mint to the caller
     * @param _maxTotalSupply  Hard cap on total supply (must be >= _totalSupply)
     * @param _documentHash    Keccak-256 hash of the backing document
     * @param _documentType    Human-readable document category
     * @param _originalValue   Nominal value of the underlying asset
     * @param _minTimelockAmount Minimum tokens required to create a timelock
     * @param _maxReleaseDelay Maximum delay in seconds for the first release
     *
     * @return tokenAddress The address of the newly deployed security token.
     * @return rulesAddress The address of the deployed TransferRules contract.
     */
    function createSecurityToken(
        string  calldata _name,
        string  calldata _symbol,
        uint8   _decimals,
        uint256 _totalSupply,
        uint256 _maxTotalSupply,
        bytes32 _documentHash,
        string  calldata _documentType,
        uint256 _originalValue,
        uint256 _minTimelockAmount,
        uint256 _maxReleaseDelay
    ) external returns (address tokenAddress, address rulesAddress) {
        if (bytes(_name).length == 0) revert EmptyName();
        if (bytes(_symbol).length == 0) revert EmptySymbol();
        if (_totalSupply == 0) revert ZeroSupply();
        if (_maxTotalSupply < _totalSupply) revert MaxSupplyTooLow();

        // Default lockup params if not specified
        uint256 minTimelock = _minTimelockAmount > 0 ? _minTimelockAmount : 1;
        uint256 maxDelay = _maxReleaseDelay > 0 ? _maxReleaseDelay : 346896000; // ~11 years

        // 1. Deploy TransferRules (compliance engine) via external deployer
        rulesAddress = _deployer.deployTransferRules();

        // 2. Deploy RestrictedSwap token (the full security token) via external deployer
        //    - msg.sender becomes CONTRACT_ADMIN
        //    - msg.sender becomes RESERVE_ADMIN (receives initial supply)
        tokenAddress = _deployer.deployRestrictedSwap(
            rulesAddress,           // transferRules
            msg.sender,             // contractAdmin
            msg.sender,             // tokenReserveAdmin (gets initial supply)
            _symbol,
            _name,
            _decimals,
            _totalSupply,
            _maxTotalSupply,
            minTimelock,
            maxDelay
        );

        // 3. Register in factory
        uint256 index = _allTokens.length;
        _allTokens.push(SecurityToken({
            tokenAddress: tokenAddress,
            transferRulesAddress: rulesAddress,
            creator: msg.sender,
            name: _name,
            symbol: _symbol,
            decimals: _decimals,
            totalSupply: _totalSupply,
            maxTotalSupply: _maxTotalSupply,
            documentHash: _documentHash,
            documentType: _documentType,
            originalValue: _originalValue,
            createdAt: block.timestamp
        }));

        _userTokens[msg.sender].push(index);
        _tokenIndex[tokenAddress] = index;
        _tokenExists[tokenAddress] = true;

        emit SecurityTokenCreated(
            msg.sender,
            tokenAddress,
            rulesAddress,
            _name,
            _symbol,
            _totalSupply,
            _maxTotalSupply,
            _documentHash,
            _documentType,
            _originalValue
        );
    }

    // ---------------------------------------------------------------
    //  View functions
    // ---------------------------------------------------------------

    /// @notice Return every security token created by `user`.
    /// Gas optimization: cached array length, unchecked loop increment
    function getUserTokens(address user) external view returns (address[] memory) {
        uint256[] memory indices = _userTokens[user];
        uint256 len = indices.length;
        address[] memory result = new address[](len);
        for (uint256 i; i < len;) {
            result[i] = _allTokens[indices[i]].tokenAddress;
            unchecked { ++i; }
        }
        return result;
    }

    /// @notice Return the total number of security tokens deployed.
    function getTotalTokens() external view returns (uint256) {
        return _allTokens.length;
    }

    /// @notice Return full details of a security token by its address.
    function getTokenDetails(address tokenAddress) external view returns (SecurityToken memory) {
        if (!_tokenExists[tokenAddress]) revert TokenNotFound();
        return _allTokens[_tokenIndex[tokenAddress]];
    }

    /// @notice Return the security token at a given index.
    function getTokenAtIndex(uint256 index) external view returns (SecurityToken memory) {
        if (index >= _allTokens.length) revert IndexOutOfBounds();
        return _allTokens[index];
    }

    /// @notice Check if a token was created by this factory.
    function isFactoryToken(address tokenAddress) external view returns (bool) {
        return _tokenExists[tokenAddress];
    }
}
