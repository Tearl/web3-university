# 阶段 C：学习进度、Evidence 与本地证书闭环

> 状态：已完成并通过 Privy 实际钱包业务验收  
> 环境：PostgreSQL + Anvil 31337 + Fastify API + Next.js Web

## 1. 已交付

- 课程进度读取、课时进度更新和个人学习记录 API。
- 每次进度写入校验 Privy 身份、绑定钱包和链上 `hasPurchased`。
- 服务端时间窗口防刷：不允许倒退、单次最多 60 秒、总观看时长不能超过真实经过时间与初始宽限。
- 课程达到 100% 时在数据库事务中生成 `wallet + courseId` 唯一 Evidence。
- Oracle challenge、持久化一次性 nonce、过期检查、重放防护、API key 和限频。
- ERC-721 metadata endpoint，包含课程、学生、完成度和 Evidence hash。
- Anvil 开发环境本地 Oracle 履约，完成 `requestCompletion -> fulfillCompletion -> W3CERT`。
- 课程详情真实学习计时与申请证书 UI；个人中心真实学习记录、统计和证书列表。
- `CourseCertificate` 与 `CompletionOracle` ABI 自动同步到 shared 包。

## 2. API

需要 Privy Bearer token 且钱包必须属于当前用户：

```text
GET   /courses/:courseId/progress
PATCH /courses/:courseId/lessons/:lessonId/progress
GET   /learning
POST  /oracle/local/fulfill
```

供后续 Oracle/Chainlink 使用：

```text
POST /oracle/challenge
GET  /oracle/completion
```

这两个接口使用 `x-oracle-key`，challenge 返回的 nonce 有效期短且只能消费一次。

公开 NFT metadata：

```text
GET /certificates/metadata/:evidenceHash
```

## 3. 本地启动

分别打开四个终端：

```bash
docker compose up -d postgres
anvil
pnpm --filter @web3-university/api dev
pnpm --filter @web3-university/web dev
```

首次或 schema 更新后执行：

```bash
pnpm --filter @web3-university/api db:migrate
pnpm --filter @web3-university/api db:seed
```

Anvil 每次重启会清空链，需要重新运行本地部署与 seed；以 [`LOCAL_CHAIN.md`](./LOCAL_CHAIN.md) 的命令和部署输出地址为准。

## 4. 必要配置

`.env` 至少确认：

```dotenv
PUBLIC_API_URL=http://localhost:4000
CERTIFICATE_IMAGE_URL=http://localhost:3000/certificate-w3.svg
PROGRESS_INITIAL_ALLOWANCE_SECONDS=30
PROGRESS_UPDATE_GRACE_SECONDS=10
PROGRESS_MAX_DELTA_SECONDS=60
ORACLE_NONCE_TTL_SECONDS=120
ORACLE_RATE_LIMIT_PER_MINUTE=10
COURSE_CERTIFICATE_ADDRESS=<本次 DeployLocal 输出>
COMPLETION_ORACLE_ADDRESS=<本次 DeployLocal 输出>
LOCAL_ORACLE_PRIVATE_KEY=<仅 Anvil 的 ORACLE_ROLE 账户私钥>
```

不要将测试私钥用于 Sepolia 或任何有真实资产的网络。`/oracle/local/fulfill` 的链上发送逻辑只允许 development + 31337。

## 5. 手动验收步骤

1. 使用 Privy 登录，并确认当前交易钱包已绑定到该 Privy 用户。
2. 给该钱包准备 YD，购买一门 Active 课程。
3. 进入课程详情，点击“开始学习”；每次最多计时 60 秒，点击“暂停并保存”。
4. 完成所有课时后确认页面显示唯一 Evidence。
5. 点击“申请本地证书”，钱包确认 `requestCompletion` 交易。
6. 等待本地 Oracle 履约，确认页面出现证书 tokenId。
7. 打开个人中心，确认真实学习统计、Evidence 状态和证书 metadata。
8. 使用 `cast` 或区块浏览器核验 `ownerOf`、`certificateOf`、`tokenURI`；尝试转让应 revert。

以下路径必须失败：未购买写进度、非绑定钱包、瞬间跃增、nonce 重放、未知 request、重复 fulfill 和证书转让。

## 6. 已通过门禁

```text
API Vitest        38/38
Foundry           14/14
pnpm check        PASS
forge fmt --check PASS
Web production    PASS
Subgraph build    PASS
Prisma migration  database in sync
```

浏览器已确认课程详情存在学习进度区、个人中心不含静态学习/证书数据，桌面页面无横向溢出。实际 Privy 钱包主路径完成后即可将阶段 C 标记为业务验收完成，并进入阶段 D。
