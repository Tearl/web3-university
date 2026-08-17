// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CourseMarket } from "../src/CourseMarket.sol";

interface RoleVm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Grants roles without exposing an admin key to the web app.
contract GrantCourseRoles {
    RoleVm private constant vm = RoleVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        CourseMarket market = CourseMarket(vm.envAddress("LOCAL_COURSE_MARKET_ADDRESS"));
        address teacher = vm.envAddress("LOCAL_TEACHER_ADDRESS");
        address reviewer = vm.envAddress("LOCAL_REVIEWER_ADDRESS");
        uint256 adminKey = vm.envUint("LOCAL_PRIVATE_KEY");

        vm.startBroadcast(adminKey);
        market.grantRole(market.TEACHER_ROLE(), teacher);
        market.grantRole(market.REVIEWER_ROLE(), reviewer);
        vm.stopBroadcast();
    }
}
