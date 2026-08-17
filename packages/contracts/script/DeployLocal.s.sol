// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { YDToken } from "../src/YDToken.sol";
import { CourseMarket } from "../src/CourseMarket.sol";
import { CourseCertificate } from "../src/CourseCertificate.sol";
import { CompletionOracle } from "../src/CompletionOracle.sol";

interface Vm {
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys and wires the complete contract set on a local Anvil chain.
/// @dev Defaults are Anvil's public deterministic development accounts. Never
/// reuse the default key on a public network.
contract DeployLocal {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant DEFAULT_ANVIL_PRIVATE_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address private constant DEFAULT_TEACHER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address private constant DEFAULT_ORACLE_CALLBACK = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address private constant DEFAULT_TREASURY = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    function run()
        external
        returns (
            YDToken yd,
            CourseMarket market,
            CourseCertificate certificate,
            CompletionOracle oracle
        )
    {
        uint256 deployerKey = vm.envOr("LOCAL_PRIVATE_KEY", DEFAULT_ANVIL_PRIVATE_KEY);
        address admin = vm.addr(deployerKey);
        address teacher = vm.envOr("LOCAL_TEACHER_ADDRESS", DEFAULT_TEACHER);
        address oracleCallback = vm.envOr("LOCAL_ORACLE_ADDRESS", DEFAULT_ORACLE_CALLBACK);
        address treasury = vm.envOr("LOCAL_TREASURY_ADDRESS", DEFAULT_TREASURY);

        vm.startBroadcast(deployerKey);

        yd = new YDToken(treasury);
        market = new CourseMarket(admin, address(yd), treasury);
        certificate = new CourseCertificate(admin);
        oracle = new CompletionOracle(admin, address(market), address(certificate), oracleCallback);

        certificate.grantRole(certificate.MINTER_ROLE(), address(oracle));
        market.grantRole(market.TEACHER_ROLE(), teacher);
        oracle.grantRole(oracle.ORACLE_ROLE(), oracleCallback);

        vm.stopBroadcast();
    }
}
