// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CompletionOracle } from "../src/CompletionOracle.sol";

interface CREConfigureVm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function envBytes32(string calldata name) external returns (bytes32);
    function envString(string calldata name) external returns (string memory);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Pins the deployed workflow identity after CRE returns its workflow ID.
contract ConfigureCREOracleSepolia {
    CREConfigureVm private constant vm =
        CREConfigureVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes private constant HEX_CHARS = "0123456789abcdef";

    function run() external {
        require(block.chainid == 11155111, "Sepolia only");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address oracleAddress = vm.envAddress("CRE_COMPLETION_ORACLE_ADDRESS");
        address workflowOwner = vm.envAddress("CRE_WORKFLOW_OWNER_ADDRESS");
        bytes32 workflowId = vm.envBytes32("CRE_WORKFLOW_ID");
        bytes10 workflowName = _workflowName(vm.envString("CRE_WORKFLOW_NAME"));
        require(oracleAddress.code.length > 0 && workflowOwner != address(0), "invalid config");

        vm.startBroadcast(deployerKey);
        CompletionOracle(oracleAddress)
            .setCREWorkflowIdentity(workflowOwner, workflowName, workflowId);
        vm.stopBroadcast();
    }

    /// @dev Matches Chainlink ReceiverTemplate workflow-name encoding:
    /// SHA-256 -> lowercase hex -> first ten ASCII bytes.
    function _workflowName(string memory name) private pure returns (bytes10 result) {
        require(bytes(name).length > 0, "empty workflow name");
        bytes32 hash = sha256(bytes(name));
        bytes memory encoded = new bytes(10);
        for (uint256 index = 0; index < 5; index++) {
            uint8 value = uint8(hash[index]);
            encoded[index * 2] = HEX_CHARS[value >> 4];
            encoded[index * 2 + 1] = HEX_CHARS[value & 0x0f];
        }
        assembly {
            result := mload(add(encoded, 32))
        }
    }
}
