// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * @title SecurityTokenDeployer
 * @notice Generic contract deployer that creates contracts from bytecode
 *         passed as calldata. This keeps the factory contract under the
 *         EIP-170 size limit since the child contract bytecodes are not
 *         embedded in any runtime code.
 */
contract SecurityTokenDeployer {
    /**
     * @notice Deploy a contract from raw bytecode
     * @param bytecode The creation bytecode (constructor code + args)
     * @return addr The address of the newly deployed contract
     */
    function deploy(bytes memory bytecode) external returns (address addr) {
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "Deploy failed");
    }
}
