// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract YDToken is ERC20, ERC20Permit {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 ether;

    constructor(address treasury) ERC20("YD Token", "YD") ERC20Permit("YD Token") {
        require(treasury != address(0), "zero treasury");
        _mint(treasury, INITIAL_SUPPLY);
    }
}
