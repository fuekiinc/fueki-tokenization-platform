// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./WrappedAsset.sol";

/**
 * @title WrappedAssetFactory
 * @notice Deploys new WrappedAsset ERC-20 tokens and mints the initial supply
 *         to a designated recipient.  Keeps a registry of every asset created,
 *         indexed both globally and per-creator.
 */
contract WrappedAssetFactory {

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    /// @notice Ordered list of every WrappedAsset ever created.
    address[] private _allAssets;

    /// @notice creator => list of WrappedAsset addresses they deployed.
    mapping(address => address[]) private _userAssets;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event AssetCreated(
        address indexed creator,
        address indexed assetAddress,
        string  name,
        string  symbol,
        bytes32 documentHash,
        string  documentType,
        uint256 originalValue,
        uint256 mintAmount,
        address indexed recipient
    );

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error ZeroAddress();
    error ZeroMintAmount();
    error EmptyName();
    error EmptySymbol();
    error MintExceedsOriginalValue();

    // ---------------------------------------------------------------
    //  External functions
    // ---------------------------------------------------------------

    /**
     * @notice Deploy a new WrappedAsset token, mint the initial supply, and
     *         register it in the factory's registry.
     *
     * @param _name          Token name
     * @param _symbol        Token symbol
     * @param _documentHash  Keccak-256 hash of the original document
     * @param _documentType  Human-readable document category
     * @param _originalValue Nominal value of the underlying asset
     * @param _mintAmount    Number of tokens to mint (in wei-units, 18 decimals)
     * @param _recipient     Address that receives the initial token supply
     *
     * @return asset The address of the newly deployed WrappedAsset contract.
     */
    function createWrappedAsset(
        string  calldata _name,
        string  calldata _symbol,
        bytes32 _documentHash,
        string  calldata _documentType,
        uint256 _originalValue,
        uint256 _mintAmount,
        address _recipient
    ) external returns (address asset) {
        if (_recipient == address(0)) revert ZeroAddress();
        if (_mintAmount == 0) revert ZeroMintAmount();
        if (bytes(_name).length == 0) revert EmptyName();
        if (bytes(_symbol).length == 0) revert EmptySymbol();
        // Prevent minting more tokens than the declared original document value.
        // This is the critical on-chain enforcement that cannot be bypassed by
        // manipulating the frontend.  Client-side checks in MintForm.tsx provide
        // defense-in-depth but are not sufficient on their own.
        if (_mintAmount > _originalValue) revert MintExceedsOriginalValue();

        // Deploy the new token. `address(this)` becomes its factory.
        WrappedAsset token = new WrappedAsset(
            _name,
            _symbol,
            _documentHash,
            _documentType,
            _originalValue
        );

        // Mint initial supply to the recipient.
        token.mint(_recipient, _mintAmount);

        asset = address(token);

        // Register in both the global and per-user indices.
        _allAssets.push(asset);
        _userAssets[msg.sender].push(asset);

        emit AssetCreated(
            msg.sender,
            asset,
            _name,
            _symbol,
            _documentHash,
            _documentType,
            _originalValue,
            _mintAmount,
            _recipient
        );
    }

    // ---------------------------------------------------------------
    //  View functions
    // ---------------------------------------------------------------

    /**
     * @notice Return every WrappedAsset address created by `user`.
     * @param user Creator address.
     */
    function getUserAssets(address user) external view returns (address[] memory) {
        return _userAssets[user];
    }

    /**
     * @notice Return the total number of WrappedAssets ever deployed through
     *         this factory.
     */
    function getTotalAssets() external view returns (uint256) {
        return _allAssets.length;
    }

    /**
     * @notice Return the address of the asset at `index` in the global list.
     * @param index Zero-based position.
     */
    function getAssetAtIndex(uint256 index) external view returns (address) {
        return _allAssets[index];
    }
}
