// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { YDToken } from "../src/YDToken.sol";
import { CourseMarket } from "../src/CourseMarket.sol";

interface FundSepoliaVm {
    function envUint(string calldata name) external returns (uint256);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Idempotently tops a student up to a target YD balance on Sepolia.
contract FundSepoliaStudent {
    FundSepoliaVm private constant vm =
        FundSepoliaVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;

    error SepoliaOnly(uint256 actualChainId);
    error TreasuryKeyMismatch();
    error TransferFailed();

    function run() external {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);

        YDToken yd = YDToken(vm.envAddress("YD_TOKEN_ADDRESS"));
        CourseMarket market = CourseMarket(vm.envAddress("COURSE_MARKET_ADDRESS"));
        address student = vm.envAddress("STUDENT_ADDRESS");
        uint256 targetBalance = vm.envOr("STUDENT_YD_TARGET", 100 ether);
        uint256 treasuryKey = vm.envUint("TREASURY_PRIVATE_KEY");
        if (vm.addr(treasuryKey) != market.treasury()) revert TreasuryKeyMismatch();

        uint256 currentBalance = yd.balanceOf(student);
        if (currentBalance >= targetBalance) return;

        vm.startBroadcast(treasuryKey);
        if (!yd.transfer(student, targetBalance - currentBalance)) revert TransferFailed();
        vm.stopBroadcast();
    }
}
