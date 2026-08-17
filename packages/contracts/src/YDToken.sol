// SPDX-License-Identifier: MIT
// SPDX 许可证标识：告诉编译器和使用者，这份代码采用 MIT 开源许可证。
pragma solidity ^0.8.24;
// 指定 Solidity 编译器版本：允许使用 0.8.24 及以上、0.9.0 以下的版本。
// Solidity 0.8.x 默认包含整数溢出和下溢检查。

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// ERC20 是 OpenZeppelin 提供的标准代币实现，已经包含：
// balanceOf、transfer、approve、allowance、transferFrom 等常用功能。

import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

// ERC20Permit 实现 EIP-2612：允许持币人通过离线签名完成授权。
// 它可以把传统的 approve 授权步骤改成签名授权，从而改善用户体验。

/// @title YD Token
/// @notice Web3 University 中用于购买课程的教学代币。
/// @dev 合约复用 OpenZeppelin 的 ERC20 与 ERC20Permit，不自行实现代币标准。
contract YDToken is ERC20, ERC20Permit {
    // public：其他合约和前端都可以读取这个常量。
    // constant：数值编译时固定，不占用普通 storage 槽，也不能被修改。
    // `ether` 在这里不是 ETH，而是 Solidity 的 10^18 数值单位。
    // ERC20 默认使用 18 位小数，因此 1_000_000 ether 表示 1,000,000 个完整 YD。
    uint256 public constant INITIAL_SUPPLY = 1_000_000 ether;

    /// @param treasury 初始代币接收地址，通常由项目金库或部署者控制。
    /// @dev constructor 只会在部署合约时执行一次。
    constructor(address treasury) ERC20("YD Token", "YD") ERC20Permit("YD Token") {
        // ERC20("YD Token", "YD") 设置代币名称和符号。
        // ERC20Permit("YD Token") 使用代币名称建立 EIP-712 签名域。

        // 零地址没有对应私钥。如果把初始代币铸造给零地址，代币将无法正常使用。
        require(treasury != address(0), "zero treasury");

        // _mint 是 ERC20 提供的内部函数：
        // 1. 增加 treasury 的余额；
        // 2. 增加 totalSupply；
        // 3. 发出 Transfer(address(0), treasury, INITIAL_SUPPLY) 事件。
        // 本合约没有暴露其他 mint 函数，因此总供应量在部署后固定不变。
        _mint(treasury, INITIAL_SUPPLY);
    }
}
