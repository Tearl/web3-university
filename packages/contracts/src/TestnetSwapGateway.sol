// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ISwapRouter02 } from "./interfaces/IUniswapV3Sepolia.sol";

/// @title Testnet YD Swap Gateway
/// @notice Adds an on-chain deadline and a narrow token allowlist around Uniswap V3 SwapRouter02.
contract TestnetSwapGateway is ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable swapRouter;
    address public immutable ydToken;
    address public immutable weth;
    address public immutable mockUsdc;
    uint24 public immutable poolFee;

    error InvalidAddress();
    error InvalidAmount();
    error UnsupportedInputToken(address token);
    error SwapDeadlineExpired(uint256 deadline, uint256 currentTimestamp);

    event YDSwapped(
        address indexed buyer, address indexed tokenIn, uint256 amountIn, uint256 amountOut
    );

    constructor(
        address router,
        address yd,
        address wethAddress,
        address mockUsdcAddress,
        uint24 fee
    ) {
        if (
            router == address(0) || yd == address(0) || wethAddress == address(0)
                || mockUsdcAddress == address(0)
        ) revert InvalidAddress();
        swapRouter = ISwapRouter02(router);
        ydToken = yd;
        weth = wethAddress;
        mockUsdc = mockUsdcAddress;
        poolFee = fee;
    }

    function exactInputToYD(
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (tokenIn != weth && tokenIn != mockUsdc) {
            revert UnsupportedInputToken(tokenIn);
        }
        if (amountIn == 0 || amountOutMinimum == 0) revert InvalidAmount();
        if (block.timestamp > deadline) {
            revert SwapDeadlineExpired(deadline, block.timestamp);
        }

        IERC20 input = IERC20(tokenIn);
        input.safeTransferFrom(msg.sender, address(this), amountIn);
        input.forceApprove(address(swapRouter), amountIn);

        amountOut = swapRouter.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: ydToken,
                fee: poolFee,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        input.forceApprove(address(swapRouter), 0);
        emit YDSwapped(msg.sender, tokenIn, amountIn, amountOut);
    }
}
