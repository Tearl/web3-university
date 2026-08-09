# Web3 University

“Web3 大学”半中心化 DApp 的 monorepo 骨架。课程状态、YD 支付、购买凭证和结业证书上链；视频、评论、用户资料和学习进度保存在 PostgreSQL。

## 工作区

- `apps/web`：Next.js 前端和 Privy/wagmi 接入位。
- `apps/api`：Fastify API、Prisma 数据模型、签名与 Oracle 接口。
- `packages/contracts`：YD、课程市场、证书和完成度 Oracle 合约。
- `packages/subgraph`：课程、购买和证书事件索引。
- `packages/shared`：链配置、合约地址与共享类型。
- `docs`：架构、开发顺序与验收说明。

面向初学者的逐阶段实现教程见 [`docs/LEARNING_PLAN.md`](./docs/LEARNING_PLAN.md)。

## 快速开始

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm --filter @web3-university/api db:generate
pnpm dev
```

前端默认地址为 <http://localhost:3000>，API 健康检查为 <http://localhost:4000/health>。

## 当前状态

这是第一阶段“整体框架”。页面导航、API 边界、数据库模型、合约和 Subgraph 已落位；部署地址、Privy 凭据、Chainlink subscription、对象存储与真实 Uniswap 池需在后续阶段配置。

## 安全约束

- 只使用测试网和测试资产。
- 私钥、Privy secret、RPC key 不提交 Git。
- 购买事实以合约为准，数据库仅缓存。
- 修改资料需同时验证 Privy access token、钱包签名和一次性 nonce。
