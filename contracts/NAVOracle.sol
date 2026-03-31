// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract NAVOracle is AccessControl, Pausable {
    bytes32 public constant NAV_PUBLISHER_ROLE = keccak256("NAV_PUBLISHER_ROLE");
    bytes32 public constant NAV_ADMIN_ROLE = keccak256("NAV_ADMIN_ROLE");
    uint8 public constant NAV_DECIMALS = 6;

    struct NAVAttestation {
        uint256 navPerToken;
        uint256 totalNAV;
        uint256 totalTokenSupply;
        uint48 effectiveDate;
        uint48 publishedAt;
        address publisher;
        bytes32 reportHash;
        string reportURI;
    }

    address public immutable token;
    string public baseCurrency;
    NAVAttestation[] public attestations;
    uint256 public latestAttestationIndex;
    uint256 public minAttestationInterval;
    uint256 public maxNavChangeBps;

    event NAVPublished(
        uint256 indexed attestationIndex,
        uint256 navPerToken,
        uint256 totalNAV,
        uint48 effectiveDate,
        address indexed publisher,
        bytes32 reportHash
    );

    event NAVParametersUpdated(uint256 minInterval, uint256 maxChangeBps);

    error AttestationTooFrequent(uint256 earliestAllowed);
    error NAVChangeExceedsThreshold(uint256 currentNav, uint256 proposedNav, uint256 maxChangeBps);
    error InvalidNavPerToken();
    error SupplyMismatch(uint256 reportedSupply, uint256 actualSupply);
    error InvalidReportHash();

    constructor(
        address token_,
        string memory baseCurrency_,
        uint256 minAttestationInterval_,
        uint256 maxNavChangeBps_,
        address admin_
    ) {
        token = token_;
        baseCurrency = baseCurrency_;
        minAttestationInterval = minAttestationInterval_;
        maxNavChangeBps = maxNavChangeBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(NAV_ADMIN_ROLE, admin_);
    }

    function publishNAV(
        uint256 navPerToken_,
        uint256 totalNAV_,
        uint256 totalTokenSupply_,
        uint48 effectiveDate_,
        bytes32 reportHash_,
        string calldata reportURI_
    ) external onlyRole(NAV_PUBLISHER_ROLE) whenNotPaused {
        if (navPerToken_ == 0) revert InvalidNavPerToken();
        if (reportHash_ == bytes32(0)) revert InvalidReportHash();

        uint256 actualSupply = IERC20(token).totalSupply();
        if (totalTokenSupply_ != actualSupply) {
            revert SupplyMismatch(totalTokenSupply_, actualSupply);
        }

        if (attestations.length > 0) {
            NAVAttestation storage previous = attestations[latestAttestationIndex];
            uint256 earliestAllowed = uint256(previous.publishedAt) + minAttestationInterval;
            if (block.timestamp < earliestAllowed) {
                revert AttestationTooFrequent(earliestAllowed);
            }

            uint256 currentNav = previous.navPerToken;
            uint256 delta = navPerToken_ > currentNav
                ? navPerToken_ - currentNav
                : currentNav - navPerToken_;
            uint256 maxDelta = (currentNav * maxNavChangeBps) / 10_000;
            if (delta > maxDelta) {
                revert NAVChangeExceedsThreshold(currentNav, navPerToken_, maxNavChangeBps);
            }
        }

        uint256 index = attestations.length;
        attestations.push(
            NAVAttestation({
                navPerToken: navPerToken_,
                totalNAV: totalNAV_,
                totalTokenSupply: totalTokenSupply_,
                effectiveDate: effectiveDate_,
                publishedAt: uint48(block.timestamp),
                publisher: msg.sender,
                reportHash: reportHash_,
                reportURI: reportURI_
            })
        );
        latestAttestationIndex = index;

        emit NAVPublished(index, navPerToken_, totalNAV_, effectiveDate_, msg.sender, reportHash_);
    }

    function updateParameters(
        uint256 minInterval_,
        uint256 maxChangeBps_
    ) external onlyRole(NAV_ADMIN_ROLE) {
        minAttestationInterval = minInterval_;
        maxNavChangeBps = maxChangeBps_;
        emit NAVParametersUpdated(minInterval_, maxChangeBps_);
    }

    function pause() external onlyRole(NAV_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(NAV_ADMIN_ROLE) {
        _unpause();
    }

    function currentNAVPerToken() external view returns (uint256) {
        if (attestations.length == 0) return 0;
        return attestations[latestAttestationIndex].navPerToken;
    }

    function currentTotalNAV() external view returns (uint256) {
        if (attestations.length == 0) return 0;
        return attestations[latestAttestationIndex].totalNAV;
    }

    function getAttestation(uint256 index) external view returns (NAVAttestation memory) {
        return attestations[index];
    }

    function latestAttestation() external view returns (NAVAttestation memory) {
        require(attestations.length > 0, "No attestations");
        return attestations[latestAttestationIndex];
    }

    function attestationCount() external view returns (uint256) {
        return attestations.length;
    }

    function getAttestations(
        uint256 start,
        uint256 count
    ) external view returns (NAVAttestation[] memory result) {
        uint256 total = attestations.length;
        if (start >= total || count == 0) {
            return new NAVAttestation[](0);
        }

        uint256 end = start + count;
        if (end > total) {
            end = total;
        }

        result = new NAVAttestation[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = attestations[i];
        }
    }

    function holderValue(address holder) external view returns (uint256) {
        if (attestations.length == 0) return 0;

        uint256 balance = IERC20(token).balanceOf(holder);
        uint256 navPerToken = attestations[latestAttestationIndex].navPerToken;
        uint8 tokenDecimals = IERC20Metadata(token).decimals();

        return (balance * navPerToken) / (10 ** tokenDecimals);
    }
}
