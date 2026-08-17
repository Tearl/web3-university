// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    INonfungiblePositionManager,
    IUniswapV3Pool,
    IWETH9
} from "../src/interfaces/IUniswapV3Sepolia.sol";

interface DexSeedVm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Initializes the two 0.3% teaching pools and mints full-range liquidity positions.
/// @dev Safe to resume: a pair with non-zero liquidity is skipped instead of funded twice.
contract SeedDexLiquiditySepolia {
    using SafeERC20 for IERC20;

    DexSeedVm private constant vm =
        DexSeedVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    uint24 private constant POOL_FEE = 3000;
    int24 private constant TICK_LOWER = -887220;
    int24 private constant TICK_UPPER = 887220;
    address private constant POSITION_MANAGER = 0x1238536071E1c677A632429e3655c799b22cDA52;
    address private constant WETH9 = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    error SepoliaOnly(uint256 actualChainId);
    error LiquidityProviderMismatch(address configuredTreasury, address signer);
    error InsufficientYD(uint256 available, uint256 required);
    error InsufficientMockUSDC(uint256 available, uint256 required);

    function run() external {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);

        uint256 providerKey = vm.envUint("TREASURY_PRIVATE_KEY");
        address provider = vm.addr(providerKey);
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        if (provider != treasury) revert LiquidityProviderMismatch(treasury, provider);

        address yd = vm.envAddress("YD_TOKEN_ADDRESS");
        address mockUsdc = vm.envAddress("MOCK_USDC_ADDRESS");

        vm.startBroadcast(providerKey);
        _seedWethPool(provider, yd);
        _seedMockUsdcPool(provider, yd, mockUsdc);
        vm.stopBroadcast();
    }

    function _seedWethPool(address provider, address yd) private {
        uint256 wethAmount = vm.envOr("DEX_WETH_LIQUIDITY_WEI", 0.01 ether);
        uint256 ydAmount = vm.envOr("DEX_WETH_YD_LIQUIDITY_WEI", 100 ether);
        uint256 ydBalance = IERC20(yd).balanceOf(provider);
        if (ydBalance < ydAmount) revert InsufficientYD(ydBalance, ydAmount);

        uint256 wrappedBalance = IWETH9(WETH9).balanceOf(provider);
        if (wrappedBalance < wethAmount) {
            IWETH9(WETH9).deposit{ value: wethAmount - wrappedBalance }();
        }

        IERC20(yd).forceApprove(POSITION_MANAGER, ydAmount);
        IERC20(WETH9).forceApprove(POSITION_MANAGER, wethAmount);
        _seedPair(WETH9, yd, wethAmount, ydAmount, provider);

        IERC20(yd).forceApprove(POSITION_MANAGER, 0);
        IERC20(WETH9).forceApprove(POSITION_MANAGER, 0);
    }

    function _seedMockUsdcPool(address provider, address yd, address mockUsdc) private {
        uint256 mockUsdcAmount = vm.envOr("DEX_MOCK_USDC_LIQUIDITY_UNITS", 100 * 10 ** 6);
        uint256 ydAmount = vm.envOr("DEX_MOCK_USDC_YD_LIQUIDITY_WEI", 100 ether);
        uint256 ydBalance = IERC20(yd).balanceOf(provider);
        if (ydBalance < ydAmount) revert InsufficientYD(ydBalance, ydAmount);
        uint256 usdcBalance = IERC20(mockUsdc).balanceOf(provider);
        if (usdcBalance < mockUsdcAmount) {
            revert InsufficientMockUSDC(usdcBalance, mockUsdcAmount);
        }

        IERC20(yd).forceApprove(POSITION_MANAGER, ydAmount);
        IERC20(mockUsdc).forceApprove(POSITION_MANAGER, mockUsdcAmount);
        _seedPair(mockUsdc, yd, mockUsdcAmount, ydAmount, provider);

        IERC20(yd).forceApprove(POSITION_MANAGER, 0);
        IERC20(mockUsdc).forceApprove(POSITION_MANAGER, 0);
    }

    function _seedPair(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address recipient
    ) private {
        (address token0, address token1, uint256 amount0, uint256 amount1) = tokenA < tokenB
            ? (tokenA, tokenB, amountA, amountB)
            : (tokenB, tokenA, amountB, amountA);

        INonfungiblePositionManager manager = INonfungiblePositionManager(POSITION_MANAGER);
        address pool = manager.createAndInitializePoolIfNecessary(
            token0, token1, POOL_FEE, _encodePriceSqrt(amount1, amount0)
        );
        if (IUniswapV3Pool(pool).liquidity() != 0) return;

        manager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: POOL_FEE,
                tickLower: TICK_LOWER,
                tickUpper: TICK_UPPER,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0 * 95 / 100,
                amount1Min: amount1 * 95 / 100,
                recipient: recipient,
                deadline: block.timestamp + 10 minutes
            })
        );
    }

    /// @dev Encodes sqrt(amount1 / amount0) as Q64.96 without overflowing uint256.
    function _encodePriceSqrt(uint256 amount1, uint256 amount0) private pure returns (uint160) {
        uint256 ratioX128 = (amount1 << 128) / amount0;
        return uint160(_sqrt(ratioX128) << 32);
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        result = 1 << (log2(value) >> 1);
        unchecked {
            for (uint256 i; i < 7; ++i) {
                result = (result + value / result) >> 1;
            }
            uint256 roundedDown = value / result;
            return result < roundedDown ? result : roundedDown;
        }
    }

    function log2(uint256 value) private pure returns (uint256 result) {
        if (value >> 128 > 0) {
            value >>= 128;
            result += 128;
        }
        if (value >> 64 > 0) {
            value >>= 64;
            result += 64;
        }
        if (value >> 32 > 0) {
            value >>= 32;
            result += 32;
        }
        if (value >> 16 > 0) {
            value >>= 16;
            result += 16;
        }
        if (value >> 8 > 0) {
            value >>= 8;
            result += 8;
        }
        if (value >> 4 > 0) {
            value >>= 4;
            result += 4;
        }
        if (value >> 2 > 0) {
            value >>= 2;
            result += 2;
        }
        if (value >> 1 > 0) result += 1;
    }
}
