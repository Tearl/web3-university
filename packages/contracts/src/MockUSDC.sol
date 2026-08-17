// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock USDC
/// @notice Sepolia/Anvil-only teaching asset. This token is not Circle USDC and has no value.
contract MockUSDC is ERC20 {
    uint256 public constant INITIAL_TREASURY_SUPPLY = 1_000_000 * 10 ** 6;
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6;

    mapping(address account => bool claimed) public hasClaimed;

    error AlreadyClaimed();
    error ZeroTreasury();

    event FaucetClaimed(address indexed account, uint256 amount);

    constructor(address treasury) ERC20("Mock USDC (Test Only)", "mUSDC") {
        if (treasury == address(0)) revert ZeroTreasury();
        _mint(treasury, INITIAL_TREASURY_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Gives each address one clearly-labelled test allocation.
    function faucet() external {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        hasClaimed[msg.sender] = true;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }
}
