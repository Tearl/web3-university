// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { MockUSDC } from "../src/MockUSDC.sol";
import { TestnetSwapGateway } from "../src/TestnetSwapGateway.sol";

interface DexDeployVm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys the Web3 University-owned Stage F contracts on Sepolia.
contract DeployDexSepolia {
    DexDeployVm private constant vm =
        DexDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    uint24 private constant POOL_FEE = 3000;
    address private constant SWAP_ROUTER_02 = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    address private constant WETH9 = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    error SepoliaOnly(uint256 actualChainId);
    error ExistingAddressHasNoCode(string name, address target);

    function run() external returns (MockUSDC mockUsdc, TestnetSwapGateway gateway) {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address ydToken = vm.envAddress("YD_TOKEN_ADDRESS");
        address mockUsdcAddress = vm.envOr("MOCK_USDC_ADDRESS", address(0));
        address gatewayAddress = vm.envOr("SWAP_GATEWAY_ADDRESS", address(0));

        _requireCodeWhenConfigured("MOCK_USDC_ADDRESS", mockUsdcAddress);
        _requireCodeWhenConfigured("SWAP_GATEWAY_ADDRESS", gatewayAddress);

        vm.startBroadcast(deployerKey);
        mockUsdc =
            mockUsdcAddress == address(0) ? new MockUSDC(treasury) : MockUSDC(mockUsdcAddress);
        gateway = gatewayAddress == address(0)
            ? new TestnetSwapGateway(SWAP_ROUTER_02, ydToken, WETH9, address(mockUsdc), POOL_FEE)
            : TestnetSwapGateway(gatewayAddress);
        vm.stopBroadcast();
    }

    function _requireCodeWhenConfigured(string memory name, address target) private view {
        if (target != address(0) && target.code.length == 0) {
            revert ExistingAddressHasNoCode(name, target);
        }
    }
}
