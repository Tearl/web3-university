// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CourseCertificate } from "../src/CourseCertificate.sol";
import { CompletionOracle } from "../src/CompletionOracle.sol";

interface CREDeployVm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys the CRE-enabled CompletionOracle without replacing the stage-D contracts.
contract DeployCREOracleSepolia {
    CREDeployVm private constant vm =
        CREDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;

    error SepoliaOnly(uint256 actualChainId);
    error ExistingAddressHasNoCode(string name, address target);

    function run() external returns (CompletionOracle oracle) {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(deployerKey);
        address market = vm.envAddress("COURSE_MARKET_ADDRESS");
        address certificateAddress = vm.envAddress("COURSE_CERTIFICATE_ADDRESS");
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");
        address workflowOwner = vm.envAddress("CRE_WORKFLOW_OWNER_ADDRESS");
        address fallbackSigner = vm.envOr("FALLBACK_ORACLE_SIGNER_ADDRESS", address(0));
        address existingOracle = vm.envOr("CRE_COMPLETION_ORACLE_ADDRESS", address(0));
        uint48 timeoutSeconds = uint48(vm.envOr("CRE_REQUEST_TIMEOUT_SECONDS", uint256(900)));

        _requireCode("COURSE_MARKET_ADDRESS", market);
        _requireCode("COURSE_CERTIFICATE_ADDRESS", certificateAddress);
        _requireCode("CRE_FORWARDER_ADDRESS", forwarder);
        if (existingOracle != address(0)) {
            _requireCode("CRE_COMPLETION_ORACLE_ADDRESS", existingOracle);
        }

        vm.startBroadcast(deployerKey);
        oracle = existingOracle == address(0)
            ? new CompletionOracle(admin, market, certificateAddress, forwarder)
            : CompletionOracle(existingOracle);

        CourseCertificate certificate = CourseCertificate(certificateAddress);
        if (!certificate.hasRole(certificate.MINTER_ROLE(), address(oracle))) {
            certificate.grantRole(certificate.MINTER_ROLE(), address(oracle));
        }
        if (oracle.creForwarder() != forwarder) oracle.setCREForwarder(forwarder);
        if (oracle.fallbackOracleSigner() != fallbackSigner) {
            oracle.setFallbackOracleSigner(fallbackSigner);
        }
        if (oracle.requestTimeout() != timeoutSeconds) oracle.setRequestTimeout(timeoutSeconds);
        if (oracle.expectedWorkflowOwner() != workflowOwner) {
            oracle.setCREWorkflowIdentity(workflowOwner, bytes10(0), bytes32(0));
        }
        vm.stopBroadcast();
    }

    function _requireCode(string memory name, address target) private view {
        if (target == address(0) || target.code.length == 0) {
            revert ExistingAddressHasNoCode(name, target);
        }
    }
}
