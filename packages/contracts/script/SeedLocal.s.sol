// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CourseMarket } from "../src/CourseMarket.sol";
import { YDToken } from "../src/YDToken.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Adds three deterministic demo courses to a freshly deployed local market.
contract SeedLocal {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant DEFAULT_ADMIN_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 private constant DEFAULT_TEACHER_KEY =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 private constant DEFAULT_TREASURY_KEY =
        0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    address private constant DEFAULT_STUDENT = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;

    function run() external {
        CourseMarket market = CourseMarket(vm.envAddress("LOCAL_COURSE_MARKET_ADDRESS"));
        YDToken yd = YDToken(vm.envAddress("LOCAL_YD_TOKEN_ADDRESS"));
        uint256 teacherKey = vm.envOr("LOCAL_TEACHER_PRIVATE_KEY", DEFAULT_TEACHER_KEY);
        uint256 adminKey = vm.envOr("LOCAL_PRIVATE_KEY", DEFAULT_ADMIN_KEY);
        uint256 treasuryKey = vm.envOr("LOCAL_TREASURY_PRIVATE_KEY", DEFAULT_TREASURY_KEY);
        address student = vm.envOr("LOCAL_STUDENT_ADDRESS", DEFAULT_STUDENT);

        vm.startBroadcast(teacherKey);
        market.submitCourse("ipfs://web3-university/solidity-foundations", 4 ether);
        market.submitCourse("ipfs://web3-university/defi-uniswap", 8 ether);
        market.submitCourse("ipfs://web3-university/dapp-fullstack", 12 ether);
        vm.stopBroadcast();

        vm.startBroadcast(adminKey);
        market.approveCourse(1);
        market.approveCourse(2);
        market.approveCourse(3);
        vm.stopBroadcast();

        vm.startBroadcast(treasuryKey);
        yd.transfer(student, 100 ether);
        vm.stopBroadcast();
    }
}
