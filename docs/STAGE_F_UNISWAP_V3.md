# 阶段 F：Uniswap V3 测试池与兑换页

> 网络：Sepolia（chainId `11155111`）  
> 资产：WETH、Mock USDC（`mUSDC`）、YD  
> 状态：已完成并通过 Sepolia 业务验收

## 0. 本次 Sepolia 部署结果（2026-08-16）

| 项目 | 地址 / 编号 |
|---|---|
| MockUSDC | `0x5b3DC28b0b55ee1425e17f83C4AeeF0612Cb2eF9` |
| TestnetSwapGateway | `0x01BE518f6B50fC89d542180BDB622eD463cc23d8` |
| WETH/YD Pool | `0x9E1CD840De92d7E3Dac0bfb4EbFB165970DcFc3E` |
| mUSDC/YD Pool | `0xE94aFBa7779513F9dAe893CE53c049aCe9F6f255` |
| WETH/YD Position NFT | `230913` |
| mUSDC/YD Position NFT | `230914` |
| Cloudflare Worker version | `54e783db-8dcd-4779-8858-571355310d97` |

链上只读检查已确认两个 Pool 的 liquidity 均非零，QuoterV2 已能返回两条路径的实时报价。完整交易、区块和 ABI 哈希见 `packages/contracts/deployments/sepolia-dex.json`。

钱包端验收已完成：

- mUSDC -> YD：授权、Swap、mUSDC 减少和 YD 增加均通过。
- WETH -> YD：ETH 包装、授权、Swap、WETH 减少和 YD 增加均通过。
- YD -> CourseMarket：阶段 D 已由同一学生地址完成课程 1 的 4 YD 购买；当前仅有课程 1 且该地址已购买，重复购买会按预期回滚，因此未制造第二笔重复交易。

## 1. 安全边界

- `mUSDC` 的名称包含 `Test Only`，不是 Circle USDC，没有真实价值。
- 每个地址只能从 faucet 领取一次 `1,000 mUSDC`。
- 兑换只允许 `WETH -> YD` 和 `mUSDC -> YD`，固定使用 0.3% 池。
- 前端先通过 QuoterV2 取得报价，再计算用户设置的最小到账。
- `TestnetSwapGateway` 在链上检查截止时间和最小到账，过期或超滑点会回滚。
- 用户只授权本次输入数量；网关调用 SwapRouter02 后立即把 Router allowance 清零。
- 池价格只用于教学兑换，不可用作借贷、清算或其他安全 Oracle。

## 2. 官方 Sepolia 合约

以下地址已按 Uniswap 官方 Ethereum/Sepolia deployment 页面核对：

| 合约 | 地址 |
|---|---|
| UniswapV3Factory | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` |
| NonfungiblePositionManager | `0x1238536071E1c677A632429e3655c799b22cDA52` |
| QuoterV2 | `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3` |
| SwapRouter02 | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` |
| WETH9 | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |

项目拥有并部署的合约：

- `MockUSDC`：6 decimals、一次性 faucet、初始测试供应量发给 Treasury。
- `TestnetSwapGateway`：为 SwapRouter02 增加 deadline、输入白名单和精确授权清理。

## 3. 默认教学流动性

| 池 | 默认输入 | 初始教学价格 |
|---|---:|---:|
| WETH/YD 0.3% | `0.01 WETH + 100 YD` | `1 WETH ≈ 10,000 YD` |
| mUSDC/YD 0.3% | `100 mUSDC + 100 YD` | `1 mUSDC ≈ 1 YD` |

两个 Position 使用 full-range ticks：`[-887220, 887220]`。这些数值只服务于低金额演示，不能代表市场价格。

## 4. 部署前准备

部署钱包需要足够的 Sepolia ETH 支付两个项目合约的 Gas。Treasury 需要：

- 与 `TREASURY_PRIVATE_KEY` 对应；脚本会在链上写入前强制校验。
- 至少 `200 YD`。
- 建议至少 `0.03 Sepolia ETH`，其中默认 `0.01 ETH` 会包装成 WETH，其余支付建池和注入流动性的 Gas。

`.env` 中继续使用已有的：

```dotenv
CHAIN_ID=11155111
NEXT_PUBLIC_CHAIN_ID=11155111
SEPOLIA_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
TREASURY_ADDRESS=...
TREASURY_PRIVATE_KEY=...
YD_TOKEN_ADDRESS=...
```

私钥只保存在本机 `.env`，不要粘贴到聊天、Cloudflare 或 Git。

## 5. 部署步骤

### 5.1 部署测试资产和交换网关

```bash
pnpm --filter @web3-university/contracts deploy:dex:sepolia
```

从广播输出记录 `MockUSDC` 和 `TestnetSwapGateway` 地址，然后写入 `.env`：

```dotenv
MOCK_USDC_ADDRESS=0x...
SWAP_GATEWAY_ADDRESS=0x...
NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x...
NEXT_PUBLIC_SWAP_GATEWAY_ADDRESS=0x...
```

脚本支持复用地址；写入上面两个地址后重新运行不会重复部署。

### 5.2 创建池并注入流动性

```bash
pnpm --filter @web3-university/contracts seed:dex:sepolia
```

脚本会：

1. 将 Treasury 的 `0.01 ETH` 包装为 WETH（已有余额则只补差额）。
2. 使用精确额度授权 PositionManager。
3. 初始化 WETH/YD 和 mUSDC/YD 0.3% 池。
4. 分别铸造 full-range Position NFT。
5. 清零 PositionManager 的三种代币 allowance。

如果某个池已有非零流动性，脚本会跳过该池，避免重跑时重复注资。

### 5.3 生成可追溯清单

```bash
pnpm --filter @web3-university/contracts manifest:dex:sepolia
```

输出：`packages/contracts/deployments/sepolia-dex.json`，包括项目合约、官方依赖、Pool、Position tokenId、交易哈希、区块和 ABI 哈希。

## 6. 前端发布

Cloudflare 构建环境必须增加：

```dotenv
NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x...
NEXT_PUBLIC_SWAP_GATEWAY_ADDRESS=0x...
```

官方 Factory/Quoter/Router/PositionManager/WETH 地址已经内置，Sepolia 不需要重复配置。之后执行：

```bash
pnpm cloudflare:deploy
```

打开 `/swap`，页面应显示两个池的实时 QuoterV2 报价。

## 7. 验收顺序

### mUSDC 路径

1. 点击领取 `1,000 mUSDC`。
2. 输入较小金额（建议 `5 mUSDC`）。
3. 确认有限 `approve`。
4. 确认 `exactInputToYD`。
5. 验证 YD 增加、mUSDC 减少、网关交易成功。

### WETH 路径

1. 切换 WETH，输入小额（建议 `0.0001 WETH`）。
2. 点击包装同等数量 ETH。
3. 确认有限 `approve`。
4. 确认 `exactInputToYD`。
5. 验证 YD 增加、WETH 减少。

### 购买衔接

兑换后点击“去购买 4 YD 课程”，完成现有 `YD approve -> CourseMarket.buy`。

### 失败路径

- 把滑点设置到 `0.1%`，在报价变化后交易应安全回滚。
- 超过页面 deadline 后旧请求应由网关以 `SwapDeadlineExpired` 回滚。
- 余额不足、授权不足、池无流动性都不能显示假成功。
- 单笔价格影响超过 5% 时，页面禁用兑换并提示减小数量。

## 8. 代码门禁

```bash
forge test
pnpm check
pnpm cloudflare:build
```

阶段完成标准：mUSDC/YD、WETH/YD 各有一笔 Sepolia 成功交易，并确认 CourseMarket 可继续使用该地址的 YD 余额。已完成。
