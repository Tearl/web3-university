# Web3 University

“Web3 大学”半中心化 DApp 的 monorepo 骨架。课程状态、YD 支付、购买凭证和结业证书上链；视频、评论、用户资料和学习进度保存在 PostgreSQL。

## 工作区

- `apps/web`：Next.js 前端、Privy 登录和 wagmi 链上交互。
- `apps/api`：Fastify API、Prisma 数据模型、签名与 Oracle 接口。
- `packages/contracts`：YD、课程市场、证书和完成度 Oracle 合约。
- `packages/subgraph`：课程、购买和证书事件索引。
- `packages/shared`：链配置、合约地址与共享类型。
- `packages/cre-workflow`：Chainlink CRE 完课验证、受保护 API 访问和 Forwarder 写链工作流。
- `docs`：架构、开发顺序与验收说明。

面向初学者的逐阶段实现教程见 [`docs/LEARNING_PLAN.md`](./docs/LEARNING_PLAN.md)。
从当前进度到可演示版本的任务、排期和验收门禁见
[`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md)。
教师中心、评论/混合数据、学习证书、Chainlink、Uniswap 和 Subgraph 的剩余功能实施计划见
[`docs/REMAINING_FEATURES_PLAN.md`](./docs/REMAINING_FEATURES_PLAN.md)。
教师真实提交、Reviewer 审核/拒绝/下架的配置与验收见
[`docs/TEACHER_CENTER.md`](./docs/TEACHER_CENTER.md)。
本地 Anvil 合约部署、测试账户和验收记录见
[`docs/LOCAL_CHAIN.md`](./docs/LOCAL_CHAIN.md)。
PostgreSQL 初始化和购买保护课程内容接口见
[`docs/COURSE_API.md`](./docs/COURSE_API.md)。
Privy 登录、绑定钱包和 EIP-712 资料签名见
[`docs/PRIVY_PROFILE.md`](./docs/PRIVY_PROFILE.md)。
Sepolia 统一部署、manifest、配置同步和链上验证见
[`docs/STAGE_D_SEPOLIA_DEPLOYMENT.md`](./docs/STAGE_D_SEPOLIA_DEPLOYMENT.md)。
Chainlink Functions 停服后的 CRE 迁移、模拟、部署和 Sepolia 验收见
[`docs/STAGE_E_CHAINLINK_CRE.md`](./docs/STAGE_E_CHAINLINK_CRE.md)。
CRE 审批期间的 AWS EIP-712 签名 Oracle fallback、部署和验收见
[`docs/STAGE_E_AWS_SIGNED_FALLBACK.md`](./docs/STAGE_E_AWS_SIGNED_FALLBACK.md)。
阶段 H 的自动化门禁、发布回滚、测试账户、演示数据和 8 分钟答辩脚本见
[`docs/STAGE_H_RELEASE_ACCEPTANCE.md`](./docs/STAGE_H_RELEASE_ACCEPTANCE.md)。

Cloudflare Workers 前端与 AWS ECS Express Mode/RDS 后端的部署步骤见
[`docs/CLOUD_DEPLOYMENT_AWS_CLOUDFLARE.md`](./docs/CLOUD_DEPLOYMENT_AWS_CLOUDFLARE.md)。

## 快速开始

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm --filter @web3-university/api db:generate
pnpm --filter @web3-university/api db:migrate
pnpm --filter @web3-university/api db:seed
pnpm config:check
pnpm dev
```

前端默认地址为 <http://localhost:3000>，API 健康检查为 <http://localhost:4000/health>。

## 当前状态

P0–P4 与阶段 A–H 已完成并通过 Sepolia 发布验收。Chainlink CRE 主路径仍等待 Deploy Access，当前 Sepolia 发布版使用已验收的 AWS EIP-712 签名 Oracle fallback。

## 安全约束

- 只使用测试网和测试资产。
- 私钥、Privy secret、RPC key 不提交 Git。
- 购买事实以合约为准，数据库仅缓存。
- 修改资料需同时验证 Privy access token、钱包签名和一次性 nonce。
