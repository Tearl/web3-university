// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { TestnetSwapGateway } from "../src/TestnetSwapGateway.sol";
import { ISwapRouter02 } from "../src/interfaces/IUniswapV3Sepolia.sol";

interface DexVm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function warp(uint256) external;
}

contract MintableToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) { }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract MockSwapRouter02 is ISwapRouter02 {
    uint256 public rate = 2;

    function setRate(uint256 nextRate) external {
        rate = nextRate;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn * rate;
        require(amountOut >= params.amountOutMinimum, "Too little received");
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
    }
}

contract StageFDexTest {
    DexVm private constant vm = DexVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant STUDENT = address(0xF001);
    address private constant OTHER = address(0xF002);

    MockUSDC private mockUsdc;
    MintableToken private yd;
    MintableToken private weth;
    MockSwapRouter02 private router;
    TestnetSwapGateway private gateway;

    function setUp() public {
        mockUsdc = new MockUSDC(address(this));
        yd = new MintableToken("YD", "YD");
        weth = new MintableToken("Wrapped Ether", "WETH");
        router = new MockSwapRouter02();
        gateway = new TestnetSwapGateway(
            address(router), address(yd), address(weth), address(mockUsdc), 3000
        );
        yd.mint(address(router), 1_000_000 ether);
        weth.mint(STUDENT, 10 ether);
    }

    function testMockUsdcUsesSixDecimalsAndOneClaimPerAddress() public {
        _assertEq(mockUsdc.decimals(), 6, "decimals");
        vm.prank(STUDENT);
        mockUsdc.faucet();
        _assertEq(mockUsdc.balanceOf(STUDENT), 1_000 * 10 ** 6, "faucet amount");

        vm.prank(STUDENT);
        vm.expectRevert(MockUSDC.AlreadyClaimed.selector);
        mockUsdc.faucet();
    }

    function testExactInputUsesMinimumOutputAndClearsRouterAllowance() public {
        vm.startPrank(STUDENT);
        weth.approve(address(gateway), 1 ether);
        uint256 output =
            gateway.exactInputToYD(address(weth), 1 ether, 19e17, block.timestamp + 5 minutes);
        vm.stopPrank();

        _assertEq(output, 2 ether, "output");
        _assertEq(yd.balanceOf(STUDENT), 2 ether, "student output");
        _assertEq(weth.allowance(address(gateway), address(router)), 0, "router allowance");
    }

    function testExpiredUnsupportedAndZeroMinimumSwapsRevert() public {
        vm.startPrank(STUDENT);
        weth.approve(address(gateway), 3 ether);
        uint256 expiredDeadline = block.timestamp - 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                TestnetSwapGateway.SwapDeadlineExpired.selector, expiredDeadline, block.timestamp
            )
        );
        gateway.exactInputToYD(address(weth), 1 ether, 1, expiredDeadline);

        vm.expectRevert(
            abi.encodeWithSelector(TestnetSwapGateway.UnsupportedInputToken.selector, OTHER)
        );
        gateway.exactInputToYD(OTHER, 1 ether, 1, block.timestamp + 1);

        vm.expectRevert(TestnetSwapGateway.InvalidAmount.selector);
        gateway.exactInputToYD(address(weth), 1 ether, 0, block.timestamp + 1);
        vm.stopPrank();
    }

    function testRouterRejectsOutputBelowSlippageMinimum() public {
        vm.startPrank(STUDENT);
        weth.approve(address(gateway), 1 ether);
        vm.expectRevert(bytes("Too little received"));
        gateway.exactInputToYD(address(weth), 1 ether, 21e17, block.timestamp + 5 minutes);
        vm.stopPrank();
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }
}
