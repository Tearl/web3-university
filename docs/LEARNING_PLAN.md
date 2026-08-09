# Web3 University 开发学习计划

这份计划的目标不是尽快“拼出一个 DApp”，而是让你能解释每一笔数据为什么放在链上或链下、交易如何从浏览器进入区块、后端能相信什么，以及怎样验证代码真的安全。

建议每完成一个阶段就提交一次 Git，并在继续前完成该阶段的验收。不要一开始购买主网资产；整个项目只使用本地链和 Sepolia 测试网。

## 先建立全局心智模型

一次购买课程会经过以下路径：

```text
浏览器
  ├─ 读取：RPC / The Graph / API
  └─ 写入：钱包签名交易
              ↓
        CourseMarket 合约
          ├─ 调用 YDToken.transferFrom
          ├─ 更新 purchased 映射
          └─ 发出 CoursePurchased 事件
                    ↓
              The Graph 索引事件

Fastify API 不替用户购买，也不把数据库记录当作购买凭证；
它读取 CourseMarket.hasPurchased 后，才允许用户访问视频。
```

你需要始终区分三类操作：

- `readContract`：读取链上状态，不需要签名，不消耗 Gas。
- `writeContract`：请求钱包签名并发送交易，需要 Gas。
- API 请求：访问项目方服务器，结果不自动具备链上可信度。

---

## 阶段 0：准备开发环境

### 学习目标

理解 monorepo、Node 包管理器、本地数据库和本地区块链分别解决什么问题。

### 操作步骤

1. 安装 Node.js 22 LTS、pnpm、Docker Desktop 和 Foundry。
2. 在项目根目录创建环境文件：

   ```bash
   cp .env.example .env
   ```

3. 安装依赖并验证整个仓库：

   ```bash
   pnpm install
   pnpm check
   ```

4. 启动 PostgreSQL：

   ```bash
   docker compose up -d postgres
   pnpm --filter @web3-university/api db:generate
   pnpm --filter @web3-university/api db:migrate
   ```

5. 启动 Web 和 API：

   ```bash
   pnpm dev
   ```

6. 打开 `http://localhost:3000`，再访问 `http://localhost:4000/health`。

### 验收

- 四个静态页面可访问并在手机宽度下正常排版。
- `/health` 返回 HTTP 200。
- `pnpm check` 没有 TypeScript、测试或构建错误。

### 常见问题

- 不要把真实私钥放入 `.env`；即使 `.gitignore` 已忽略它，也只应使用测试钱包。
- 如果 Node 的最新版本与依赖不兼容，优先换 LTS，不要随意修改锁文件。

---

## 阶段 1：从 Solidity 和本地链开始

涉及目录：`packages/contracts/src`、`packages/contracts/test`

### 学习目标

- 理解 ERC-20、ERC-721、`msg.sender`、mapping、event、custom error。
- 理解 AccessControl、Checks-Effects-Interactions 和重入保护。
- 学会先测试合约，再让前端调用它。

### 1.1 阅读已有合约

按这个顺序阅读：

1. `YDToken.sol`：观察 ERC-20 总量在哪里铸造。
2. `CourseMarket.sol`：追踪 `submitCourse → approveCourse → buy`。
3. `CourseCertificate.sol`：理解 `_update` 为什么阻止普通转账。
4. `CompletionOracle.sol`：先把它理解为“受权限控制的回调适配器”，暂时不要接 Chainlink。

每读一个 public 状态变量，都在 Remix 或 `cast call` 中读取一次。每读一个写函数，都回答：谁能调用、会改什么状态、会发什么事件、失败时会怎样。

### 1.2 补齐 Foundry 测试

安装测试库后，把 `CourseMarket.t.sol` 的注释清单逐项实现：

```bash
cd packages/contracts
forge install foundry-rs/forge-std --no-commit
forge test -vv
```

最低测试矩阵：

| 场景 | 预期 |
|---|---|
| 非老师提交课程 | revert |
| 老师提交零价格课程 | revert |
| 未审批课程购买 | revert |
| approve 后购买 | treasury 收到 YD，`purchased=true` |
| 重复购买 | revert |
| pause 后购买 | revert |
| 非 Oracle 铸造证书 | revert |
| 同一用户同一课程重复铸造 | revert |
| 证书转给他人 | revert |

测试中使用 `vm.prank` 切换调用者，使用 `vm.expectRevert` 验证失败路径。不要只测试成功路径。

### 1.3 写本地部署脚本

新增 `script/DeployLocal.s.sol`，严格按下面顺序部署和授权：

1. `YDToken`
2. `CourseMarket`
3. `CourseCertificate`
4. `CompletionOracle`
5. 把 Certificate 的 `MINTER_ROLE` 授予 CompletionOracle
6. 把 Market 的 `TEACHER_ROLE` 授予教师测试地址
7. 把 Oracle 的 `ORACLE_ROLE` 授予本地回调测试地址

启动本地链并部署：

```bash
anvil
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### 阶段验收

- `forge test` 全部通过。
- 能用 `cast` 完成一次提交、审批、授权和购买。
- 能解释为什么 `approve` 和 `buy` 是两笔交易。
- 能从交易 receipt 中找到 `CoursePurchased` 日志。

---

## 阶段 2：在前端连接钱包并读取合约

涉及目录：`apps/web`、`packages/shared`

### 学习目标

理解钱包连接、Provider、Chain、Account、ABI 和合约地址如何协作。

### 操作步骤

1. 建立客户端 Provider 组件，把 Privy、wagmi 和 React Query 包在根布局内。
2. 在共享包中加入本地链和 Sepolia 的地址配置；不要在页面中散落地址字符串。
3. 从合约构建产物导出 ABI，避免手写 ABI。
4. 把页头的“连接钱包”展示按钮改为真实登录按钮。
5. 显示四种明确状态：未登录、正在连接、已连接、网络错误。
6. 用 `useReadContract` 读取 YD 余额和 `CourseMarket.courses(id)`。
7. 先在 Anvil 联调，确认后再切 Sepolia。

### 你应该观察什么

- 登录身份和钱包地址不是同一个概念；Privy 用户可以绑定钱包。
- React 服务端组件不能直接使用钱包 hook，需要把交互边界放在带 `"use client"` 的小组件中。
- 地址必须先经过 `getAddress` 校验；金额通过 `formatUnits(value, 18)` 展示。

### 阶段验收

- 断开钱包时不会发起需要账户的请求。
- 连错网络时提供“切换到目标网络”，而不是继续交易。
- 刷新页面后登录状态正确恢复。
- 首页课程数据来自合约读取或本地链事件，不再来自 `demo-data.ts`。

---

## 阶段 3：打通 YD 购买闭环

### 学习目标

掌握 allowance、交易模拟、签名、广播、receipt、确认数和失败原因。

### 操作步骤

1. 为本地开发准备 YD：从部署者账户转一些 YD 给学生测试地址。
2. 在课程详情页读取：
   - `balanceOf(student)`
   - `allowance(student, CourseMarket)`
   - `hasPurchased(student, courseId)`
3. allowance 不足时显示“授权 YD”；足够时显示“购买课程”。
4. 写交易前先用 `simulateContract`，尽量在用户签名前暴露 revert。
5. 发送交易后保存 hash，展示“等待打包”。
6. 等待 receipt；只有 `status === success` 才刷新购买状态。
7. 处理用户拒签、余额不足、授权不足、课程下架、重复购买和 RPC 超时。

### 状态机

```text
未连接 → 网络不匹配 → YD 不足 → 待授权
→ 授权确认中 → 可购买 → 购买确认中 → 已购买
```

不要用一个 `isLoading` 表示所有状态。状态越明确，错误越容易定位。

### 阶段验收

- treasury 余额增加的数量等于课程价格。
- 刷新页面后仍显示已购买，因为状态来自链而不是 React 内存。
- 用户拒签不会出现“交易失败”的误导性提示。
- receipt 已成功但索引尚未同步时，UI 仍然显示购买成功。

---

## 阶段 4：接入 PostgreSQL 和课程内容 API

涉及目录：`apps/api/prisma`、`apps/api/src`

### 学习目标

理解为什么标题、章节、视频 key 和学习进度不适合全部上链，以及 API 如何验证链上资格。

### 操作步骤

1. 为当前 Prisma schema 创建第一份 migration。
2. 建立唯一 PrismaClient 实例，并在 Fastify 关闭时断开连接。
3. 先实现只读接口：
   - `GET /courses/:courseId`
   - `GET /courses/:courseId/lessons`
4. 实现教师写入接口，但先只允许开发环境的固定测试用户。
5. 实现视频访问接口：
   - 从登录信息取得钱包地址。
   - 调用 `CourseMarket.hasPurchased(wallet, courseId)`。
   - 校验通过后生成短时效 URL。
6. 不要接真实对象存储时，可以先返回本地演示视频，但保持接口结构不变。

### 数据边界检查

- `courseId` 来自合约，是链上课程与数据库详情的关联键。
- 数据库不能单方面声明用户“已购买”。
- 数据库保存 `videoKey`，不要保存永不过期的公开视频 URL。
- BigInt 输出 JSON 前必须转成字符串。

### 阶段验收

- 未购买用户请求视频得到 403。
- 已购买用户得到短时效地址。
- 删除课程详情不会改变链上的购买事实。
- API 测试使用 Fastify `inject`，至少覆盖 200、400、401/403 和 404。

---

## 阶段 5：Privy 身份与 EIP-712 资料签名

### 学习目标

理解“已经登录”为什么不等于“拥有这个钱包”，以及 nonce 如何防止签名重放。

### 正确流程

```text
客户端携带 Privy access token 请求 nonce
→ 服务端验证 token 并持久化随机 nonce（5 分钟过期）
→ 客户端对 EIP-712 typed data 签名
→ 服务端恢复签名地址
→ 同时核对 Privy 用户、绑定钱包、nonce、domain、chainId 和 expiresAt
→ 原子地消费 nonce 并修改用户名
```

### 操作步骤

1. 实现统一的 Privy token 验证 hook。
2. 修改 `/profile/nonce`，把 nonce 写入 `ProfileNonce`，不要再只返回内存随机值。
3. 定义 EIP-712 domain 和 `UpdateProfile` 类型。
4. 前端用钱包签名 typed data。
5. 后端用 viem 恢复地址并逐字段核对。
6. 在同一个数据库事务里标记 nonce 已用并更新资料。

### 必测攻击场景

- 重放同一签名。
- 使用过期 nonce。
- 把 A 用户的 token 与 B 钱包的签名组合。
- 修改签名后的 username。
- 使用错误 chainId 或 domain。

### 阶段验收

上述攻击全部失败，合法签名只能成功一次。

---

## 阶段 6：用 The Graph 建立查询视图

涉及目录：`packages/subgraph`

### 学习目标

理解事件是历史事实，Subgraph 是可重建的查询索引，不是新的权威来源。

### 操作步骤

1. 先把合约部署到 Sepolia，记录地址和部署区块。
2. 用最终合约产物替换 `abis` 中的 ABI。
3. 修改 `subgraph.yaml` 的零地址和 `startBlock`。
4. 执行：

   ```bash
   pnpm --filter @web3-university/subgraph codegen
   pnpm --filter @web3-university/subgraph build
   ```

5. 部署 Subgraph，并用 GraphQL Playground 查询课程和购买记录。
6. 前端列表页改为 GraphQL 查询，交易成功后仍以 receipt 作为即时反馈。

### 必须理解的延迟

交易已确认到 Subgraph 可查询之间存在时间差。正确 UI 是“交易已确认，索引同步中”，不能把暂时查不到解释成购买失败。

### 阶段验收

- 重建 Subgraph 后能从链上事件恢复相同列表。
- 同一交易中的多个日志使用 `txHash-logIndex` 唯一标识。
- 前端能区分 RPC 错误、交易错误和索引延迟。

---

## 阶段 7：学习进度与 Oracle evidence

### 学习目标

理解链下进度的可篡改风险，以及“Oracle 把 API 数据搬上链”并不会让源数据天然可信。

### 操作步骤

1. 实现学习进度接口，服务端根据 lesson 时长限制 `watchedSeconds`。
2. 按课程汇总完成比例；只有所有必修章节达标才判定 100%。
3. 达到完成条件时生成规范化 evidence，并计算 hash。
4. 把 `OracleEvidence` 写入数据库；同一钱包和课程只能存在一个最终结果。
5. 完成 `/oracle/completion`：
   - 校验 API key。
   - 校验 nonce、过期时间和请求参数。
   - 只读取服务端生成的 evidence。
   - 设置速率限制并记录审计日志。

### 阶段验收

- 客户端无法通过提交 `completed=true` 冒充完成。
- evidence 内容相同则 hash 稳定，内容变化则 hash 变化。
- 未购买课程不能提交有效学习进度。

---

## 阶段 8：Chainlink Functions 与不可转让证书

### 学习目标

掌握异步 Oracle 请求、回调权限、重复回调保护和跨系统故障处理。

### 操作步骤

1. 先用本地授权账户手工调用 `fulfillCompletion`，验证证书链路。
2. 给 `CompletionOracle` 增加真实 Chainlink Functions 请求逻辑。
3. 把 API key 放入 Chainlink Secrets，不写入源码。
4. 编写 Functions JavaScript，调用只读完成度 API 并编码响应。
5. 回调中验证 request ID，确保只处理一次。
6. 给前端加入请求中、等待 Oracle、已完成、失败可重试四种状态。

### 必测场景

- 未购买课程请求证书。
- 不存在的 request ID。
- 重复回调。
- API 返回未完成。
- 已经有证书后再次申请。
- Oracle 回调失败后安全重试。

### 阶段验收

- `ownerOf(tokenId)` 返回学生地址。
- `certificateOf(student, courseId)` 返回唯一 token ID。
- transfer 和 `safeTransferFrom` 都失败。
- 证书元数据能在前端和区块浏览器读取。

---

## 阶段 9：最后再做测试网 DEX

DEX 与课程购买不是核心依赖，应当最后加入，避免同时调试太多协议。

### 学习目标

理解池、LP、报价、价格影响、滑点、deadline 和代币精度。

### 操作步骤

1. 部署 MockUSDC，并确认它与 YD 的 decimals 差异。
2. 使用测试网 WETH 和测试资产创建 WETH/YD、MockUSDC/YD 池。
3. 添加少量测试流动性。
4. 先实现只读报价，再实现 approve 和 swap。
5. UI 必须显示最少收到数量、滑点和 deadline。

### 安全提醒

- 测试代币没有现实价值，不要把它包装成投资产品。
- 不要把现货池价格当作安全的 Oracle 价格。
- 不要使用无限 allowance 作为默认选项。

---

## 阶段 10：最终质量与答辩准备

### 自动化检查

```bash
pnpm typecheck
pnpm test
pnpm build
forge fmt --check
forge test -vvv
```

再补一条 Playwright E2E 主路径：连接测试钱包、授权 YD、购买课程、访问第一节、写入进度、申请证书。

### 最终安全清单

- 合约地址与 chainId 总是匹配。
- 所有写交易在发送前模拟。
- 所有角色都有最小权限，部署者不长期持有无关角色。
- API 从经过验证的身份中取得钱包，不相信 body 里的 wallet。
- nonce 一次性、短时效并原子消费。
- 视频 URL 短时效且只发给已购买者。
- Oracle endpoint 有鉴权、过期时间、限速和审计记录。
- 日志和错误响应不会泄漏 token、签名或 secret。

### 建议的 5–8 分钟演示顺序

1. 用 30 秒解释链上/链下边界。
2. 老师提交课程，Reviewer 审批。
3. 学生连接钱包，展示 YD 余额。
4. 展示 approve 和 buy 是两笔不同交易。
5. 打开区块浏览器查看购买事件。
6. 访问课程并完成最后一个章节。
7. 请求 Oracle 验证，等待证书铸造。
8. 展示证书不可转让，并解释这一设计的取舍。

## 推荐提交节奏

```text
chore: set up local development environment
test(contracts): cover market roles and purchase flow
feat(contracts): add local deployment script
feat(web): connect wallet and read course state
feat(web): complete yd approval and purchase flow
feat(api): persist course content and protect video access
feat(auth): verify privy token and eip712 profile update
feat(subgraph): index courses purchases and certificates
feat(progress): issue completion evidence
feat(oracle): mint course certificate from verified completion
feat(dex): add testnet yd swap flow
test(e2e): cover student learning journey
```

如果某阶段没有通过验收，不要继续堆下一层。Web3 的大部分难调问题，都来自同时跨越钱包、RPC、合约、索引器和后端，却没有先证明每一层单独工作。
