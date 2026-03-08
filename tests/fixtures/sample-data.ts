/**
 * Shared payload fixtures used across Vitest API/component suites.
 */

export const SAMPLE_SOLIDITY_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SampleToken {
    string public name = "Sample";
    function ping() external pure returns (uint256) {
        return 1;
    }
}
`;

export const SAMPLE_KYC_HEADERS = {
  validUserId: 'integration-test-user',
  unknownUserId: 'integration-test-user-does-not-exist',
};

export const SAMPLE_GAS_REQUEST = {
  bytecode: '0x6080604052348015600f57600080fd5b5060f68061001d6000396000f3fe60806040',
  constructorArgs: [],
};
