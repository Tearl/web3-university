# 阶段 D：Sepolia 统一部署冻结

> 状态：已完成（Sepolia 部署、角色授权、课程 seed、Student YD 发放和 MetaMask `approve + buy` 验收全部通过）  
> 目标链：Sepolia（chainId `11155111`）

部署记录见 [`packages/contracts/deployments/sepolia.json`](../packages/contracts/deployments/sepolia.json)。

购买验收记录：

- Course：`#1`，价格 `4 YD`
- Student：`0xbC41A64280E546ED5558B08e386e4FD8d0142757`
- Purchase tx：`0x102bc66afb9364d6c3d27a9ce6523ef794ac20cbd1c3369c71e74ba905261f79`
- Block：`11491947`
- Receipt：`status=true`，`gasUsed=73870`
- 链上查询：`hasPurchased(student, 1)=true`

## 1. 安全准备

1. 新建只用于本项目的 Sepolia 部署钱包，不使用主钱包。
2. 为部署钱包准备测试 ETH；阶段 E 的 CRE 接入不使用 Functions LINK Subscription。
3. `.env` 已被 Git 忽略。部署私钥只能写入本地 `.env` 或临时 shell 环境。
4. 不要把 Anvil 公开测试私钥用于 Sepolia。

## 2. 部署前配置

将根目录 `.env` 切换为 Sepolia。RPC 必须写成实际 URL，`.env` 不会展开另一个变量：

```dotenv
CHAIN_ID=11155111
NEXT_PUBLIC_CHAIN_ID=11155111
SEPOLIA_RPC_URL=https://你的-sepolia-rpc
RPC_URL=https://你的-sepolia-rpc
NEXT_PUBLIC_RPC_URL=https://你的-sepolia-rpc

DEPLOYER_PRIVATE_KEY=0x...
TREASURY_ADDRESS=0x...
TEACHER_ADDRESS=0x...
TEACHER_PRIVATE_KEY=0x...
ORACLE_OPERATOR_ADDRESS=0x...
```

首次部署时从 `.env` 删除以下八个地址行。不要保留空值，因为 Foundry 会把“变量存在但为空”视为无效地址。部署完成后再写回：

```dotenv
YD_TOKEN_ADDRESS=
COURSE_MARKET_ADDRESS=
COURSE_CERTIFICATE_ADDRESS=
COMPLETION_ORACLE_ADDRESS=
NEXT_PUBLIC_YD_TOKEN_ADDRESS=
NEXT_PUBLIC_COURSE_MARKET_ADDRESS=
NEXT_PUBLIC_CERTIFICATE_ADDRESS=
NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS=
```

## 3. 编译与部署

部署命令会安全加载根目录 `.env`，不会把私钥拼进命令行：

```bash
forge test --root packages/contracts -vvv
pnpm --filter @web3-university/contracts deploy:sepolia
```

脚本会按顺序部署 YDToken、CourseMarket、CourseCertificate、CompletionOracle，并授予：

- CompletionOracle → CourseCertificate `MINTER_ROLE`
- 教师钱包 → CourseMarket `TEACHER_ROLE`
- Oracle 操作钱包 → CompletionOracle `ORACLE_ROLE`

脚本只允许 chainId `11155111`。如果传入已有合约地址，它会复用地址并只补缺失角色；已有地址没有 bytecode 时立即失败。

## 4. 生成 deployment manifest

```bash
pnpm --filter @web3-university/contracts manifest:sepolia
```

输出：

```text
packages/contracts/deployments/sepolia.json
```

manifest 包含 chainId、合约地址、部署区块、交易哈希、ABI SHA-256、角色交易、生成时间和 Git commit。检查无敏感信息后提交 Git。

## 5. 同步地址并验证

把 manifest 中四个地址同时写入 API 与 Web 配置：

```dotenv
YD_TOKEN_ADDRESS=0x...
COURSE_MARKET_ADDRESS=0x...
COURSE_CERTIFICATE_ADDRESS=0x...
COMPLETION_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_YD_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_COURSE_MARKET_ADDRESS=0x...
NEXT_PUBLIC_CERTIFICATE_ADDRESS=0x...
NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS=0x...
```

运行：

```bash
pnpm config:check
pnpm deployment:check
```

`config:check` 会拒绝 API/Web chainId 或地址不一致；`deployment:check` 会验证 RPC chainId、四个地址 bytecode、YD 总供应量、Market/Oracle 依赖、MINTER/TEACHER/ORACLE 角色和 treasury。

## 6. 创建 4 YD 演示课程

```bash
pnpm --filter @web3-university/contracts seed:sepolia
```

该脚本只接受新部署或已经存在的同一门课程 1，重复运行不会创建重复课程。课程价格为 4 YD，最终状态为 Active。

如需给测试学生准备 YD：

```dotenv
STUDENT_ADDRESS=0x...
TREASURY_PRIVATE_KEY=0x...
STUDENT_YD_TARGET=100000000000000000000
```

```bash
pnpm --filter @web3-university/contracts fund:sepolia
```

资金脚本只把学生余额补足到目标值，重复运行不会重复增加。如果 treasury 是多签，不使用该脚本，改由多签执行 YD transfer。

## 7. 阶段 D 最终验收

1. [x] `pnpm deployment:check` 全部通过。
2. [x] Etherscan 可查四个合约和角色授予交易。
3. [x] 使用测试学生完成一笔 4 YD `approve + buy`。
4. [x] `hasPurchased(student, 1)` 返回 `true`。
5. [x] manifest 的地址、部署区块和交易哈希与 Sepolia 链上记录一致。
6. [x] `pnpm check`、`forge fmt --check`、`forge test -vvv` 全部通过。

完成实际广播和购买后，阶段 D 才标记为完全完成；随后进入阶段 E 的 Chainlink CRE 真实接入。
