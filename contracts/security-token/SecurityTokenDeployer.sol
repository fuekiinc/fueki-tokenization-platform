// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./TransferRules.sol";
import "./RestrictedSwap.sol";

/**
 * @title SecurityTokenDeployer
 * @notice External deployer contract that creates the child contracts needed by
 *         SecurityTokenFactory. Separating deployment into its own contract keeps
 *         the factory under the EIP-170 bytecode size limit, since the child
 *         bytecodes live here instead of in the factory.
 */
contract SecurityTokenDeployer {
    /**
     * @notice Deploy a new TransferRules contract (compliance engine).
     * @return addr The address of the newly deployed TransferRules contract.
     */
    function deployTransferRules() external returns (address addr) {
        TransferRules rules = new TransferRules();
        addr = address(rules);
    }

    /**
     * @notice Deploy a new RestrictedSwap token (full ERC-1404 security token).
     * Gas optimization: string parameters use calldata instead of memory to avoid copying
     * @return addr The address of the newly deployed RestrictedSwap token.
     */
    function deployRestrictedSwap(
        address transferRules_,
        address contractAdmin_,
        address tokenReserveAdmin_,
        string calldata symbol_,
        string calldata name_,
        uint8 decimals_,
        uint256 totalSupply_,
        uint256 maxTotalSupply_,
        uint256 minTimelockAmount_,
        uint256 maxReleaseDelay_
    ) external returns (address addr) {
        RestrictedSwap token = new RestrictedSwap(
            transferRules_,
            contractAdmin_,
            tokenReserveAdmin_,
            symbol_,
            name_,
            decimals_,
            totalSupply_,
            maxTotalSupply_,
            minTimelockAmount_,
            maxReleaseDelay_
        );
        addr = address(token);
    }
}
