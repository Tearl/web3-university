// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CourseMarket } from "../src/CourseMarket.sol";

interface SeedSepoliaVm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Creates exactly one deterministic 4 YD course on a fresh Sepolia deployment.
contract SeedSepolia {
    SeedSepoliaVm private constant vm =
        SeedSepoliaVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    string private constant METADATA_URI = "ipfs://web3-university/solidity-foundations";
    uint256 private constant PRICE = 4 ether;

    error SepoliaOnly(uint256 actualChainId);
    error TeacherKeyMismatch();
    error UnexpectedCourseOne();

    function run() external returns (uint256 courseId) {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);

        CourseMarket market = CourseMarket(vm.envAddress("COURSE_MARKET_ADDRESS"));
        uint256 teacherKey = vm.envUint("TEACHER_PRIVATE_KEY");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address teacher = vm.envAddress("TEACHER_ADDRESS");
        if (vm.addr(teacherKey) != teacher) revert TeacherKeyMismatch();

        if (market.nextCourseId() == 1) {
            vm.startBroadcast(teacherKey);
            courseId = market.submitCourse(METADATA_URI, PRICE);
            vm.stopBroadcast();
        } else {
            courseId = 1;
        }

        (
            uint256 id,
            address recordedTeacher,
            uint256 price,
            string memory metadataUri,
            CourseMarket.CourseStatus status
        ) = market.courses(courseId);
        if (
            id != courseId || recordedTeacher != teacher || price != PRICE
                || keccak256(bytes(metadataUri)) != keccak256(bytes(METADATA_URI))
        ) revert UnexpectedCourseOne();

        if (status != CourseMarket.CourseStatus.Active) {
            vm.startBroadcast(deployerKey);
            market.approveCourse(courseId);
            vm.stopBroadcast();
        }
    }
}
